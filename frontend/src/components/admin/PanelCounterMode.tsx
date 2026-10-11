'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import InlineError from '@/components/ui/InlineError';
import type { Product, ProductVariant } from '@/lib/types';

interface PanelCounterModeProps {
  orders: any[];
  refreshData: () => Promise<void>;
  isSyncing?: boolean;
  setOrders?: React.Dispatch<React.SetStateAction<any[]>>;
}

// Fallback items if API is unreachable
const FALLBACK_STORE_ITEMS = [
  { id: 'royal_cannon_mid', name: 'Royal Cannon (Mid-Range)', category: 'Towels', price: 250, stock: 20 },
  { id: 'royal_cannon_high', name: 'Royal Cannon (High-end)', category: 'Towels', price: 600, stock: 16 },
  { id: 'royal_cannon_mini', name: 'Royal Cannon Mini Bath Towel', category: 'Towels', price: 150, stock: 20 },
  { id: 'bath_essentials', name: 'Bath Essentials Bath Towel', category: 'Towels', price: 300, stock: 20 },
  { id: 'chinese_fan_big', name: 'Chinese Fan (Big)', category: 'Fans', price: 100, stock: 50 },
  { id: 'chinese_fan_small', name: 'Chinese Fan (Small)', category: 'Fans', price: 80, stock: 50 },
  { id: 'regular_fan_big', name: 'Regular Fan (Big)', category: 'Fans', price: 80, stock: 49 },
  { id: 'regular_fan_small', name: 'Regular Fan (Small)', category: 'Fans', price: 45, stock: 40 },
  { id: 'byog', name: 'Client-Provided Garment (BYOG)', category: 'Custom', price: 100, stock: 999 },
];

export default function PanelCounterMode({ orders, refreshData, setOrders }: PanelCounterModeProps) {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'register' | 'quick_punch' | 'turnover'>('register');

  // Category filter to keep cards spacious without vertical scrolling
  const [selectedCategory, setSelectedCategory] = useState<'Towels' | 'Fans' | 'Custom' | 'All'>('Towels');

  // Real store catalog fetched from database
  const [liveProducts, setLiveProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);

  // Intake selection
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [customByogName, setCustomByogName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState<number>(250);

  // Step 2: Monogram text
  const [monogramText, setMonogramText] = useState('');

  // Step 3: Payment & Optional Google Link
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'GCash'>('Cash');
  const [gcashRef, setGcashRef] = useState('');
  const [customerContact, setCustomerContact] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [threadColor, setThreadColor] = useState('Metallic Gold');

  // Quick Slip Punch Form fields (Solution 1: Nanay Slips)
  const [quickProductId, setQuickProductId] = useState<string>('');
  const [quickText, setQuickText] = useState('');
  const [quickPrice, setQuickPrice] = useState<number>(250);
  const [quickQuantity, setQuickQuantity] = useState(1);
  const [quickPayment, setQuickPayment] = useState<'Cash' | 'GCash'>('Cash');
  const [isPunchSubmitting, setIsPunchSubmitting] = useState(false);
  const [punchedSlipsToday, setPunchedSlipsToday] = useState<{
    id: string;
    orderId: string;
    itemName: string;
    text: string;
    amount: number;
    method: string;
    time: string;
  }[]>([]);

  // Processing & Print Stub states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdOrderTicket, setCreatedOrderTicket] = useState<any | null>(null);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [quickPunchError, setQuickPunchError] = useState<string | null>(null);

  // Turn-Over Desk state
  const [turnOverSearch, setTurnOverSearch] = useState('');
  const [queueFilterStage, setQueueFilterStage] = useState<'all' | 'in_queue' | 'stitching' | 'ready'>('all');
  const [queueScope, setQueueScope] = useState<'all' | 'walkin_only'>('all');
  const [verifyingOrderForRelease, setVerifyingOrderForRelease] = useState<any | null>(null);
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);

  // Audio chime for Nanay when orders advance
  const playQueueChime = (type: 'start' | 'ready') => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      if (type === 'start') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, audioCtx.currentTime); // A4
        osc.frequency.exponentialRampToValueAtTime(659.25, audioCtx.currentTime + 0.12); // E5
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
        osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5
      }
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.5);
    } catch {
      // Audio muted or not allowed
    }
  };

  const getVerificationCode = (orderId: string) => {
    if (!orderId) return '#A-000';
    if (orderId.startsWith('WI-')) return `#${orderId.replace('WI-', 'A-')}`;
    const suffix = orderId.slice(-4).replace(/[^a-zA-Z0-9]/g, '');
    return `#A-${suffix.toUpperCase()}`;
  };

  const getOrderQuantity = (order: any): number => {
    if (Array.isArray(order.items) && order.items.length > 0) {
      return order.items.reduce((sum: number, it: any) => sum + (it.quantity || 1), 0);
    }
    return order.quantity || 1;
  };

  // Fetch live products
  useEffect(() => {
    let isMounted = true;
    const fetchCatalog = async () => {
      setIsLoadingProducts(true);
      try {
        const data = await api.get<Product[]>('/api/products');
        if (isMounted && Array.isArray(data) && data.length > 0) {
          const validProducts = data.filter(p => !p.name.includes('TEST Embroidered Hand Towel'));
          setLiveProducts(validProducts);
          if (validProducts.length > 0) {
            setSelectedProductId(validProducts[0].id);
            setUnitPrice(validProducts[0].price);
            setQuickProductId(validProducts[0].id);
            setQuickPrice(validProducts[0].price);
          }
        }
      } catch (err) {
        console.warn('Using cached catalog fallback:', err);
      } finally {
        if (isMounted) setIsLoadingProducts(false);
      }
    };
    fetchCatalog();
    return () => { isMounted = false; };
  }, []);

  // Merged Catalog
  const storeCatalog = useMemo(() => {
    if (liveProducts.length > 0) {
      const items = liveProducts.map(p => {
        const tagLower = (p.tag || '').toLowerCase();
        const cat = tagLower.includes('fan') ? 'Fans' : (tagLower.includes('towel') || p.name.toLowerCase().includes('towel')) ? 'Towels' : 'Towels';
        return {
          id: p.id,
          name: p.name,
          category: cat,
          price: p.price,
          stock: p.count ?? 20,
          variants: p.variants || [],
          isByog: false
        };
      });
      items.push({
        id: 'byog_client_item',
        name: 'Client-Provided Garment (BYOG)',
        category: 'Custom',
        price: 100,
        stock: 999,
        variants: [],
        isByog: true
      });
      return items;
    }
    return FALLBACK_STORE_ITEMS.map(i => ({ ...i, variants: [], isByog: i.id === 'byog' }));
  }, [liveProducts]);

  // Filtered by Category (Towels, Fans, Custom, All) so only 4 items show at a time without squishing!
  const displayedCatalog = useMemo(() => {
    if (selectedCategory === 'All') return storeCatalog;
    return storeCatalog.filter(i => i.category === selectedCategory);
  }, [storeCatalog, selectedCategory]);

  const activeSelectedItem = useMemo(() => {
    return storeCatalog.find(i => i.id === selectedProductId) || storeCatalog[0];
  }, [storeCatalog, selectedProductId]);

  const activeQuickItem = useMemo(() => {
    return storeCatalog.find(i => i.id === quickProductId) || storeCatalog[0];
  }, [storeCatalog, quickProductId]);

  const handleSelectItem = (item: any) => {
    setSelectedProductId(item.id);
    setSelectedVariant(null);
    setUnitPrice(item.price);
  };

  const handleSelectQuickItem = (item: any) => {
    setQuickProductId(item.id);
    setQuickPrice(item.price);
  };

  const grandTotal = useMemo(() => {
    return (unitPrice || 0) * (quantity || 1);
  }, [unitPrice, quantity]);


  const estimatedReadyTime = useMemo(() => {
    const readyDate = new Date(Date.now() + 20 * 60000);
    return readyDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, []);

  const handleResetForm = () => {
    setMonogramText('');
    setCustomerName('');
    setCustomerContact('');
    setGcashRef('');
    setQuantity(1);
    setSelectedVariant(null);
    setCustomByogName('');
    setCreatedOrderTicket(null);
  };

  // Submit Intake Order
  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setIntakeError(null);

    if (!monogramText.trim() && !activeSelectedItem.isByog) {
      setIntakeError('Please type the name or text to embroider.');
      showToast('Please type the name or text to embroider.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const isByog = activeSelectedItem.isByog;
      const itemName = isByog && customByogName.trim()
        ? `BYOG (${customByogName.trim()})`
        : selectedVariant
          ? `${activeSelectedItem.name} - ${selectedVariant.name}`
          : activeSelectedItem.name;

      const cleanText = monogramText.trim().toUpperCase();
      const isEmail = customerContact.includes('@');
      const isPhone = customerContact.replace(/\D/g, '').length >= 7;

      const payload = {
        clientName: customerName.trim() || (cleanText ? `Walk-In (${cleanText})` : 'Walk-In Customer'),
        clientPhone: isPhone ? customerContact.trim() : undefined,
        clientEmail: isEmail ? customerContact.trim() : undefined,
        design: `${itemName} — "${cleanText || 'Plain Monogram'}"`,
        items: [
          {
            productId: activeSelectedItem.isByog ? undefined : activeSelectedItem.id,
            name: itemName,
            quantity,
            price: unitPrice,
            isByog,
            selectedVariant: selectedVariant?.name || null,
            personalization: {
              text: cleanText,
              threadColor,
              placement: activeSelectedItem.category === 'Fans' ? 'Fan Blade' : 'Towel Bottom Hem',
              variant: selectedVariant?.name || null
            }
          }
        ],
        totalAmount: grandTotal,
        paymentMethod,
        paymentStatus: 'paid',
        isByog,
        isImmediate: true,
        executionMode: 'immediate',
        personalizationText: cleanText,
        threadColor,
        notes: [
          selectedVariant ? `Color: ${selectedVariant.name}` : '',
          customerContact ? `Contact: ${customerContact}` : '',
          gcashRef.trim() ? `GCash Ref: ${gcashRef.trim()}` : '',
          `Counter Intake Ticket (Pacific Mall)`
        ].filter(Boolean).join(' | ')
      };

      const res = await api.post<{ success: boolean; message: string; order: any }>('/api/admin/orders/walk-in', payload);

      if (res && res.order) {
        showToast(`Ticket #${res.order.orderId} registered!`, 'success');
        setCreatedOrderTicket({
          ...res.order,
          clientName: payload.clientName,
          itemName,
          quantity,
          personalizationText: cleanText,
          threadColor,
          grandTotal,
          paymentMethod,
          readyBy: estimatedReadyTime,
          verificationCode: `#${res.order.orderId.replace('WI-', 'A-')}`
        });
        await refreshData();
      }
    } catch (err: any) {
      console.error('Walk-in intake error:', err);
      setIntakeError(err.message || 'Failed to register order');
      showToast(err.message || 'Failed to register order', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick Slip Punch
  const sessionCashTotal = useMemo(() => {
    return punchedSlipsToday
      .filter(s => s.method === 'Cash')
      .reduce((sum, s) => sum + s.amount, 0);
  }, [punchedSlipsToday]);

  const handleQuickSlipPunch = async () => {
    setQuickPunchError(null);
    const itemName = activeQuickItem.name;
    const totalAmount = (quickPrice || 0) * (quickQuantity || 1);
    const cleanText = quickText.trim().toUpperCase();
    const tempSlipId = `temp-${Date.now()}`;
    const tempOrderId = `WI-${Math.floor(1000 + Math.random() * 9000)}`;

    const newSlip = {
      id: tempSlipId,
      orderId: tempOrderId,
      itemName,
      text: cleanText,
      amount: totalAmount,
      method: quickPayment,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    // 1. Optimistic instant addition to Nanay's cash tin & recent slips (0ms)
    setPunchedSlipsToday(prev => [newSlip, ...prev]);
    setQuickText('');
    setQuickQuantity(1);
    showToast(`Recorded ₱${totalAmount.toFixed(2)} ${itemName}!`, 'success');

    // 2. Dispatch to server in background
    try {
      const payload = {
        clientName: cleanText ? `Walk-In (${cleanText})` : 'Walk-In Customer',
        design: `${itemName} — "${cleanText || 'Monogram'}"`,
        items: [
          {
            productId: activeQuickItem.isByog ? undefined : activeQuickItem.id,
            name: itemName,
            quantity: quickQuantity,
            price: quickPrice,
            isByog: activeQuickItem.isByog,
            personalization: { text: cleanText }
          }
        ],
        totalAmount,
        paymentMethod: quickPayment,
        paymentStatus: 'paid',
        isAlreadyCompleted: true,
        personalizationText: cleanText,
        notes: `Quick Slip Punch from Nanay's cash tin`
      };

      const res = await api.post<{ success: boolean; message: string; order: any }>('/api/admin/orders/walk-in', payload);
      if (res && res.order) {
        // Reconcile temporary orderId with real DB orderId
        setPunchedSlipsToday(prev => prev.map(s => s.id === tempSlipId ? { ...s, id: res.order.id, orderId: res.order.orderId } : s));
        refreshData().catch(() => {});
      }
    } catch (err: any) {
      // 3. Rollback on error
      setPunchedSlipsToday(prev => prev.filter(s => s.id !== tempSlipId));
      console.error('Quick punch error:', err);
      setQuickPunchError(err.message || 'Failed to punch slip. Reverted.');
      showToast(err.message || 'Failed to punch slip. Reverted.', 'error');
    }
  };

  // Turn-Over Desk & Queue Progression
  const allActiveQueueOrders = useMemo(() => {
    return (orders || []).filter((o) => {
      return ['Preparing Order', 'In Production', 'Processing', 'In Queue', 'Ready For Pick Up', 'Ready for Pickup'].includes(o.status);
    });
  }, [orders]);

  const walkInActiveOrders = useMemo(() => {
    return allActiveQueueOrders.filter((o) => {
      return o.orderId?.startsWith('WI-') || o.deliveryTime?.toLowerCase().includes('walk-in') || o.deliveryTime?.toLowerCase().includes('wait');
    });
  }, [allActiveQueueOrders]);

  const inQueueCount = useMemo(() => {
    return allActiveQueueOrders.filter(o => o.status === 'In Queue').length;
  }, [allActiveQueueOrders]);

  const stitchingCount = useMemo(() => {
    return allActiveQueueOrders.filter(o => ['Preparing Order', 'In Production', 'Processing'].includes(o.status)).length;
  }, [allActiveQueueOrders]);

  const readyCount = useMemo(() => {
    return allActiveQueueOrders.filter(o => ['Ready For Pick Up', 'Ready for Pickup'].includes(o.status)).length;
  }, [allActiveQueueOrders]);

  const filteredTurnOverOrders = useMemo(() => {
    let base = queueScope === 'all' ? allActiveQueueOrders : walkInActiveOrders;

    if (queueFilterStage === 'in_queue') {
      base = base.filter(o => o.status === 'In Queue');
    } else if (queueFilterStage === 'stitching') {
      base = base.filter(o => ['Preparing Order', 'In Production', 'Processing'].includes(o.status));
    } else if (queueFilterStage === 'ready') {
      base = base.filter(o => ['Ready For Pick Up', 'Ready for Pickup'].includes(o.status));
    }

    if (!turnOverSearch.trim()) return base;
    const q = turnOverSearch.toLowerCase().trim();
    return base.filter((o) =>
      o.orderId?.toLowerCase().includes(q) ||
      o.client?.toLowerCase().includes(q) ||
      o.design?.toLowerCase().includes(q)
    );
  }, [allActiveQueueOrders, walkInActiveOrders, queueScope, queueFilterStage, turnOverSearch]);

  const handleStartStitching = async (order: any) => {
    const prevOrders = [...orders];
    const targetStatus = 'Preparing Order';
    setActionInProgressId(order.id);

    // Play pleasant cue for Nanay
    playQueueChime('start');

    // 1. Optimistic instant UI update (0ms)
    if (setOrders) {
      setOrders(prev => prev.map(o => (o.id === order.id || o._id === order.id) ? { ...o, status: targetStatus } : o));
    }
    showToast(`Started stitching #${order.orderId} on machine!`, 'success');

    // 2. Dispatch to server in background
    try {
      await api.post('/api/admin/orders/batch-status', {
        ids: [order.id || order._id],
        status: targetStatus,
        note: `Stitching initiated on Nanay's machine.`
      });
      refreshData().catch(() => {});
    } catch (err: any) {
      // 3. Rollback on error
      if (setOrders) setOrders(prevOrders);
      showToast(err.message || 'Failed to start stitching. Reverted.', 'error');
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleMarkStitchingDone = async (order: any) => {
    const prevOrders = [...orders];
    const targetStatus = 'Ready For Pick Up';
    setActionInProgressId(order.id);

    // Play ready chime
    playQueueChime('ready');

    // 1. Optimistic instant UI update (0ms)
    if (setOrders) {
      setOrders(prev => prev.map(o => (o.id === order.id || o._id === order.id) ? { ...o, status: targetStatus } : o));
    }
    showToast(`Stitching complete! #${order.orderId} ready for claim.`, 'success');

    // 2. Dispatch to server in background
    try {
      await api.post('/api/admin/orders/batch-status', {
        ids: [order.id || order._id],
        status: targetStatus,
        note: `Stitching finished on machine for ${order.client}.`
      });
      refreshData().catch(() => {});
    } catch (err: any) {
      // 3. Rollback on error
      if (setOrders) setOrders(prevOrders);
      showToast(err.message || 'Failed to update order status. Reverted.', 'error');
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleTurnOverToCustomer = async (order: any) => {
    const prevOrders = [...orders];
    const targetStatus = 'Completed';
    setActionInProgressId(order.id);

    // 1. Optimistic instant UI update (0ms)
    if (setOrders) {
      setOrders(prev => prev.map(o => (o.id === order.id || o._id === order.id) ? { ...o, status: targetStatus } : o));
    }
    showToast(`Item handed over to ${order.client}!`, 'success');

    // 2. Dispatch to server in background
    try {
      await api.post('/api/admin/orders/batch-status', {
        ids: [order.id || order._id],
        status: targetStatus,
        note: `Turned over to customer (${order.client}).`
      });
      refreshData().catch(() => {});
    } catch (err: any) {
      // 3. Rollback on error
      if (setOrders) setOrders(prevOrders);
      showToast(err.message || 'Failed to turn over item. Reverted.', 'error');
    } finally {
      setActionInProgressId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 text-left max-w-6xl mx-auto pb-4 font-sans">
      {/* Print stylesheet targeting only thermal claim stub */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #thermal-claim-stub-print, #thermal-claim-stub-print * {
            visibility: visible !important;
          }
          #thermal-claim-stub-print {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 76mm !important;
            margin: 0 !important;
            padding: 8px !important;
            background: #ffffff !important;
            color: #000000 !important;
          }
        }
      `}</style>

      {/* Clean Top Tab Switcher */}
      <div className="flex flex-row items-center justify-start pb-2 border-b border-border-glass mb-1">
        {/* Tab Switcher */}
        <div className="flex bg-bg-surface border border-border-glass rounded-lg p-0.5 gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('register')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'register'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-dim hover:text-text-main'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span>Customer Intake</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('quick_punch')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'quick_punch'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-dim hover:text-text-main'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Nanay Slips</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('turnover')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'turnover'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-dim hover:text-text-main'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span>Queue &amp; Claim Desk</span>
            {allActiveQueueOrders.length > 0 && (
              <span className="bg-primary/20 text-primary border border-primary/30 px-1.5 py-0.2 rounded-full text-[10px] font-bold">
                {allActiveQueueOrders.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 1: CUSTOMER INTAKE (SPACIOUS, UN-TRUNCATED, COMPACT)       */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'register' && (
        <form onSubmit={handleSubmitOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start animate-fade">
          {/* Main Column: Item Selector & Monogram Text (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-3">
            <div className="bg-bg-surface border border-border-glass rounded-xl p-4 shadow-sm">
              {/* Category Pills Header */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-extrabold text-text-dim uppercase tracking-wider">
                  1. Pick Store Item
                </span>
                <div className="flex gap-1">
                  {(['Towels', 'Fans', 'Custom', 'All'] as const).map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                        selectedCategory === cat
                          ? 'bg-primary text-white'
                          : 'bg-white/5 text-text-dim hover:text-white'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Spacious, Un-Truncated Item Cards */}
              <div className="grid grid-cols-2 gap-2.5">
                {displayedCatalog.map((item) => {
                  const isSelected = selectedProductId === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectItem(item)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between min-h-[62px] ${
                        isSelected
                          ? 'bg-primary/20 border-primary text-white shadow-sm ring-1 ring-primary/50'
                          : 'bg-white/[0.03] border-border-glass text-text-main hover:border-primary/40'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <span className="font-bold text-xs leading-snug">{item.name}</span>
                        <span className="font-mono font-bold text-xs text-primary shrink-0">₱{item.price}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-text-dim mt-1.5 pt-1 border-t border-white/5">
                        <span>{item.category}</span>
                        <span>{item.isByog ? 'Customer Item' : `${item.stock} in stock`}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Variant Swatches (if available) */}
              {activeSelectedItem.variants && activeSelectedItem.variants.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-border-glass flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-text-dim">Color:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {activeSelectedItem.variants.map((v: ProductVariant, vIdx: number) => {
                      const isVarSelected = selectedVariant?.name === v.name;
                      return (
                        <button
                          key={vIdx}
                          type="button"
                          onClick={() => {
                            setSelectedVariant(v);
                            if (v.priceOverride) setUnitPrice(v.priceOverride);
                          }}
                          className={`px-2.5 py-1 rounded-lg border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                            isVarSelected
                              ? 'bg-primary text-white border-primary shadow-sm'
                              : 'bg-white/5 border-border-glass text-text-dim hover:text-white'
                          }`}
                        >
                          {v.color && (
                            <span
                              className="w-3 h-3 rounded-full border border-white/30"
                              style={{ backgroundColor: v.color }}
                            />
                          )}
                          <span>{v.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* BYOG Custom Note */}
              {activeSelectedItem.isByog && (
                <div className="mt-3 pt-2.5 border-t border-border-glass">
                  <input
                    type="text"
                    placeholder="Describe item brought by customer (e.g. Uniform, Polo)..."
                    value={customByogName}
                    onChange={(e) => setCustomByogName(e.target.value)}
                    className="w-full bg-bg-surface border border-border-glass p-2.5 rounded-lg text-text-main text-xs outline-none focus:border-primary/50"
                  />
                </div>
              )}

              {/* STEP 2: EMBROIDERY TEXT */}
              <div className="mt-3.5 pt-3 border-t border-border-glass">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-extrabold text-text-dim uppercase tracking-wider">
                    2. Name / Word to Embroider
                  </span>
                  {monogramText.trim() && (
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono font-bold">
                      "{monogramText.trim()}" ✓
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="TYPE NAME FROM PAPER SLIP (e.g. SOPHIA)"
                  value={monogramText}
                  onChange={(e) => {
                    setMonogramText(e.target.value.toUpperCase());
                    if (intakeError) setIntakeError(null);
                  }}
                  className="w-full bg-white/[0.03] border border-border-glass px-3.5 py-2.5 rounded-xl text-text-main text-sm font-extrabold tracking-wider outline-none font-mono focus:border-primary/60 transition"
                />
              </div>
            </div>
          </div>

          {/* Right Column: Payment & Ticket Actions (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-3">
            <div className="bg-bg-surface border border-border-glass rounded-xl p-4 shadow-sm flex flex-col gap-3.5">
              <span className="text-xs font-extrabold text-text-dim uppercase tracking-wider">
                3. Payment &amp; Queue Ticket
              </span>

              {/* Compact Quantity & Price Block */}
              <div className="bg-white/[0.03] border border-border-glass rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-dim font-medium">Qty:</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setQuantity(q => Math.max(1, q - 1))}
                      className="w-7 h-7 rounded bg-white/5 hover:bg-white/10 text-white font-bold text-xs cursor-pointer"
                    >
                      -
                    </button>
                    <span className="font-mono font-bold text-sm px-2">{quantity}</span>
                    <button
                      type="button"
                      onClick={() => setQuantity(q => q + 1)}
                      className="w-7 h-7 rounded bg-white/5 hover:bg-white/10 text-white font-bold text-xs cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[11px] text-text-dim block">Total Due:</span>
                  <span className="text-2xl font-black font-mono text-emerald-400">
                    ₱{grandTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Payment Method Selector */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('Cash')}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    paymentMethod === 'Cash'
                      ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                      : 'bg-white/5 border-border-glass text-text-dim hover:text-white'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <rect x="2" y="6" width="20" height="12" rx="2" />
                    <circle cx="12" cy="12" r="2" />
                    <path d="M6 12h.01M18 12h.01" />
                  </svg>
                  <span>Cash</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('GCash')}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    paymentMethod === 'GCash'
                      ? 'bg-primary text-white border-primary shadow-sm'
                      : 'bg-white/5 border-border-glass text-text-dim hover:text-white'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                    <line x1="12" y1="18" x2="12.01" y2="18" />
                  </svg>
                  <span>GCash</span>
                </button>
              </div>

              {/* GCash Counter QR Standee Info & Optional Ref # */}
              {paymentMethod === 'GCash' && (
                <div className="bg-white/5 border border-border-glass rounded-xl p-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="16" rx="2" />
                      <line x1="7" y1="8" x2="7.01" y2="8" />
                      <line x1="11" y1="8" x2="17" y2="8" />
                      <line x1="7" y1="12" x2="17" y2="12" />
                      <line x1="7" y1="16" x2="13" y2="16" />
                    </svg>
                    <div>
                      <span className="text-xs font-bold text-white block">
                        Customer scans printed counter QR standee
                      </span>
                      <span className="text-[11px] text-text-dim">
                        Customer scans counter QR Ph, pays ₱{grandTotal.toFixed(2)}, and shows receipt.
                      </span>
                    </div>
                  </div>
                  <input
                    type="text"
                    placeholder="GCash Ref # (optional, e.g. 8492)"
                    value={gcashRef}
                    onChange={(e) => setGcashRef(e.target.value)}
                    className="w-full bg-black/40 border border-border-glass px-3 py-1.5 rounded-lg text-text-main text-xs font-mono outline-none placeholder:text-text-dim/40 focus:border-primary"
                  />
                </div>
              )}

              {/* Optional: Single Customer Contact Line */}
              <div>
                <input
                  type="text"
                  placeholder="Customer Phone or Google Email (optional)"
                  value={customerContact}
                  onChange={(e) => setCustomerContact(e.target.value)}
                  className="w-full bg-bg-surface border border-border-glass px-3 py-2 rounded-xl text-text-main text-xs outline-none"
                />
              </div>

              {/* Big Action Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 rounded-xl bg-primary hover:bg-primary/90 active:scale-[0.99] text-white font-extrabold text-sm shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                <span>{isSubmitting ? 'Queueing...' : 'Punch Order & Print Claim Stub'}</span>
              </button>
              <InlineError error={intakeError} />
            </div>
          </div>
        </form>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 0: QUICK SLIP PUNCH (FOR NANAY FINISHED PAPER SLIPS)      */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'quick_punch' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start animate-fade">
          {/* Main Column: Slip Punch Form (8 cols) */}
          <div className="lg:col-span-8 flex flex-col gap-3">
            <div className="bg-bg-surface border border-border-glass rounded-xl p-4 shadow-sm">
              {/* Header with Category Pills */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-extrabold text-text-dim uppercase tracking-wider">
                  1. Pick Stitched Item from Slip
                </span>
                <div className="flex gap-1">
                  {(['Towels', 'Fans', 'Custom', 'All'] as const).map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                        selectedCategory === cat
                          ? 'bg-primary text-white shadow-sm'
                          : 'bg-white/5 text-text-dim hover:text-white'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Spacious, Un-Truncated Item Cards */}
              <div className="grid grid-cols-2 gap-2.5 mb-3.5">
                {displayedCatalog.map((item) => {
                  const isSelected = quickProductId === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectQuickItem(item)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between min-h-[62px] ${
                        isSelected
                          ? 'bg-primary/10 border-primary text-white shadow-sm ring-1 ring-primary/40'
                          : 'bg-white/[0.03] border-border-glass text-text-main hover:border-primary/40'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <span className="font-bold text-xs leading-snug">{item.name}</span>
                        <span className="font-mono font-bold text-xs text-text-main shrink-0">₱{item.price}</span>
                      </div>
                      <span className="text-[11px] text-text-dim mt-1.5 pt-1 border-t border-white/5">{item.category}</span>
                    </button>
                  );
                })}
              </div>

              {/* Step 2: Monogram text from slip */}
              <div className="mb-3.5">
                <input
                  type="text"
                  placeholder="NAME / MONOGRAM FROM SLIP (e.g. SOPHIA)"
                  value={quickText}
                  onChange={(e) => setQuickText(e.target.value.toUpperCase())}
                  className="w-full bg-bg-surface border border-border-glass px-3.5 py-2.5 rounded-xl text-text-main text-xs font-mono font-bold tracking-wider outline-none focus:border-primary/50"
                />
              </div>

              {/* Step 3: Quantity & Payment */}
              <div className="grid grid-cols-2 gap-3 mb-4 items-center">
                <div className="flex items-center gap-2 bg-white/[0.03] border border-border-glass rounded-xl p-1.5">
                  <span className="text-xs text-text-dim font-medium ml-1">Qty:</span>
                  <button
                    type="button"
                    onClick={() => setQuickQuantity(q => Math.max(1, q - 1))}
                    className="w-7 h-7 rounded bg-white/5 text-text-main font-bold hover:bg-white/10 cursor-pointer text-xs"
                  >
                    -
                  </button>
                  <span className="flex-1 text-center font-mono font-bold text-sm text-text-main">
                    {quickQuantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuickQuantity(q => q + 1)}
                    className="w-7 h-7 rounded bg-white/5 text-text-main font-bold hover:bg-white/10 cursor-pointer text-xs"
                  >
                    +
                  </button>
                </div>

                <div className="flex rounded-xl border border-border-glass p-1 bg-white/[0.03]">
                  <button
                    type="button"
                    onClick={() => setQuickPayment('Cash')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      quickPayment === 'Cash' ? 'bg-primary text-white shadow-sm' : 'text-text-dim hover:text-white'
                    }`}
                  >
                    Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickPayment('GCash')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      quickPayment === 'GCash' ? 'bg-primary text-white shadow-sm' : 'text-text-dim hover:text-white'
                    }`}
                  >
                    GCash
                  </button>
                </div>
              </div>

              {/* Action Button */}
              <button
                type="button"
                disabled={isPunchSubmitting}
                onClick={handleQuickSlipPunch}
                className="w-full py-3 px-4 rounded-xl bg-primary hover:bg-primary/90 active:scale-[0.99] text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span>
                  {isPunchSubmitting
                    ? 'Recording...'
                    : `Log Finished Sale — ₱${((quickPrice || 0) * (quickQuantity || 1)).toFixed(2)} (${quickPayment})`}
                </span>
              </button>
              <InlineError error={quickPunchError} />
            </div>
          </div>

          {/* Right Column: Live Shift Tally (4 cols) */}
          <div className="lg:col-span-4 flex flex-col gap-3">
            <div className="bg-bg-surface border border-border-glass rounded-xl p-4 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-xs uppercase tracking-wider font-bold text-text-dim block">
                  Nanay's Cash Tin
                </span>
                <span className="text-[11px] text-text-dim">
                  {punchedSlipsToday.length} slip(s) logged
                </span>
              </div>
              <div className="text-2xl font-extrabold font-mono text-text-main">
                ₱{sessionCashTotal.toFixed(2)}
              </div>
            </div>

            {punchedSlipsToday.length > 0 && (
              <div className="bg-bg-surface border border-border-glass rounded-xl p-3 shadow-sm flex flex-col gap-1.5 max-h-[220px] overflow-y-auto">
                <span className="text-[10px] font-bold text-text-dim uppercase tracking-wider mb-1">
                  Recent Slips Logged
                </span>
                {punchedSlipsToday.map((slip, sIdx) => (
                  <div
                    key={sIdx}
                    className="p-2 rounded-lg bg-white/[0.03] border border-border-glass flex justify-between items-center text-xs"
                  >
                    <div className="flex flex-col text-left">
                      <span className="font-bold text-text-main text-xs">
                        {slip.itemName} {slip.text ? `"${slip.text}"` : ''}
                      </span>
                      <span className="text-[10px] text-text-dim font-mono">
                        #{slip.orderId} • {slip.time} • {slip.method}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-emerald-400 text-xs">
                      +₱{slip.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 2: QUEUE PROGRESSION & CLAIM DESK (PICKUP SHELF)          */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'turnover' && (
        <div className="flex flex-col gap-4">
          {/* Controls Bar: Search, Scope Switcher, & Stage Filters */}
          <div className="bg-bg-surface border border-border-glass rounded-xl p-4 flex flex-col gap-3 shadow-sm">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="w-full sm:w-80">
                <input
                  type="text"
                  placeholder="Search ticket # (e.g. WI-A12B), claim #, or customer..."
                  value={turnOverSearch}
                  onChange={(e) => setTurnOverSearch(e.target.value)}
                  className="w-full bg-white/[0.03] border border-border-glass focus:border-primary/60 px-3 py-2 rounded-lg text-text-main text-xs outline-none"
                />
              </div>

              {/* Scope Switcher: All vs Walk-In Only */}
              <div className="flex bg-white/5 border border-border-glass rounded-lg p-0.5 text-xs font-bold self-stretch sm:self-auto">
                <button
                  type="button"
                  onClick={() => setQueueScope('all')}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-md transition cursor-pointer ${
                    queueScope === 'all'
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-text-dim hover:text-white'
                  }`}
                >
                  All Shop Orders ({allActiveQueueOrders.length})
                </button>
                <button
                  type="button"
                  onClick={() => setQueueScope('walkin_only')}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-md transition cursor-pointer ${
                    queueScope === 'walkin_only'
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-text-dim hover:text-white'
                  }`}
                >
                  Walk-In Slips Only ({walkInActiveOrders.length})
                </button>
              </div>
            </div>

            {/* Stage Filter Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border-glass">
              <span className="text-[11px] font-bold text-text-dim uppercase tracking-wider mr-1">
                Stage:
              </span>
              <button
                type="button"
                onClick={() => setQueueFilterStage('all')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  queueFilterStage === 'all'
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-white/5 text-text-dim hover:text-white'
                }`}
              >
                All Stages ({queueScope === 'all' ? allActiveQueueOrders.length : walkInActiveOrders.length})
              </button>
              <button
                type="button"
                onClick={() => setQueueFilterStage('in_queue')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  queueFilterStage === 'in_queue'
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-white/5 text-text-dim hover:text-white'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                <span>In Queue</span>
                <span className="font-mono text-[11px] opacity-80">({inQueueCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setQueueFilterStage('stitching')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  queueFilterStage === 'stitching'
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-white/5 text-text-dim hover:text-white'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                <span>Now Stitching</span>
                <span className="font-mono text-[11px] opacity-80">({stitchingCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setQueueFilterStage('ready')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  queueFilterStage === 'ready'
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-white/5 text-text-dim hover:text-white'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                <span>Ready for Claim</span>
                <span className="font-mono text-[11px] opacity-80">({readyCount})</span>
              </button>
            </div>
          </div>

          {/* Orders Cards Grid */}
          {filteredTurnOverOrders.length === 0 ? (
            <div className="bg-bg-surface border border-border-glass rounded-xl p-12 text-center text-xs text-text-dim flex flex-col items-center gap-2">
              <svg className="w-8 h-8 text-text-dim opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>No active orders match this filter right now.</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredTurnOverOrders.map((order) => {
                const isReady = order.status === 'Ready For Pick Up' || order.status === 'Ready for Pickup';
                const isStitching = ['Preparing Order', 'In Production', 'Processing'].includes(order.status);
                const isInQueue = order.status === 'In Queue';
                const personalization = order.personalization || {};
                const textToStitch = personalization.text || '';
                const isBusy = actionInProgressId === order.id;
                const qty = getOrderQuantity(order);
                const isExpress = qty === 1;
                const claimCode = getVerificationCode(order.orderId);

                return (
                  <div
                    key={order.id}
                    className={`bg-bg-surface rounded-xl p-4 shadow-sm flex flex-col justify-between gap-3 border transition ${
                      isReady
                        ? 'border-emerald-500/40'
                        : isStitching
                        ? 'border-primary/40'
                        : 'border-border-glass'
                    }`}
                  >
                    <div>
                      {/* Top Row: IDs, Claim Badge, & Stage Indicator */}
                      <div className="flex justify-between items-start mb-2.5">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-base font-extrabold text-text-main font-mono tracking-wider">
                              #{order.orderId}
                            </span>
                            {/* Visual Anti-Fraud Claim Code */}
                            <span className="px-2 py-0.5 rounded bg-white/10 font-mono text-xs font-bold text-text-main border border-white/10">
                              {claimCode}
                            </span>
                          </div>
                          <span className="text-xs text-text-dim block mt-0.5 font-medium">
                            Customer: <strong className="text-white">{order.client}</strong>
                          </span>
                        </div>

                        {/* Stage Badge */}
                        <div className="flex flex-col items-end gap-1">
                          <span
                            className={`text-xs px-2.5 py-1 rounded-md font-bold border flex items-center gap-1.5 ${
                              isReady
                                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                                : isStitching
                                ? 'bg-primary/15 border-primary/30 text-primary-light'
                                : 'bg-white/5 border-border-glass text-text-muted'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${isReady ? 'bg-emerald-400' : isStitching ? 'bg-primary-light' : 'bg-text-dim'}`} />
                            <span>
                              {isReady ? 'Ready for Claim' : isStitching ? 'Now Stitching' : 'In Queue'}
                            </span>
                          </span>

                          {/* Express vs Bulk Badge */}
                          {isExpress ? (
                            <span className="text-[10px] font-bold text-text-dim px-2 py-0.5 rounded bg-white/5 border border-border-glass flex items-center gap-1">
                              <svg className="w-3 h-3 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              Express (~15m)
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-text-dim px-2 py-0.5 rounded bg-white/5 border border-border-glass flex items-center gap-1">
                              <svg className="w-3 h-3 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              Bulk ({qty} pcs)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Detail Box */}
                      <div className="bg-black/25 border border-white/5 p-3 rounded-lg flex flex-col gap-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-text-dim">Item Blank:</span>
                          <span className="font-semibold text-text-main">{order.design}</span>
                        </div>
                        {textToStitch && (
                          <div className="flex justify-between items-center bg-white/[0.02] p-1.5 rounded border border-white/5">
                            <span className="text-text-dim text-[11px]">Monogram Text:</span>
                            <span className="font-bold text-primary-light uppercase font-mono text-sm tracking-wider">
                              "{textToStitch}"
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between pt-1 border-t border-white/5">
                          <span className="text-text-dim">Payment:</span>
                          <span className="font-mono text-emerald-400 font-bold">
                            ₱{order.totalAmount?.toFixed(2)} ({order.paymentStatus === 'paid' ? 'PAID' : 'UNPAID'})
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 3-State 1-Tap Action Progression Buttons */}
                    <div className="flex items-center gap-2 pt-2 border-t border-border-glass">
                      {isInQueue && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleStartStitching(order)}
                          className="flex-1 py-2.5 px-3 rounded-lg bg-primary hover:bg-primary/90 active:scale-[0.99] text-white text-xs font-bold transition shadow-sm cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polygon points="5 3 19 12 5 21 5 3" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          <span>{isBusy ? 'Starting...' : 'Start Stitching (Nanay)'}</span>
                        </button>
                      )}

                      {isStitching && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleMarkStitchingDone(order)}
                          className="flex-1 py-2.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white text-xs font-bold transition shadow-sm cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          <span>{isBusy ? 'Updating...' : 'Mark Ready for Claim'}</span>
                        </button>
                      )}

                      {isReady && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setVerifyingOrderForRelease(order)}
                          className="flex-1 py-2.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white text-xs font-bold transition shadow-sm cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          <span>{isBusy ? 'Releasing...' : `Verify Claim & Release (${claimCode})`}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────── */}
          {/* ANTI-FRAUD VERIFICATION POPUP MODAL (1-TAP TURNOVER)          */}
          {/* ───────────────────────────────────────────────────────────── */}
          {verifyingOrderForRelease && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade">
              <div className="bg-bg-surface border-2 border-emerald-500/50 rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4 text-left">
                <div className="flex items-center justify-between pb-3 border-b border-border-glass">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                    <h3 className="text-base font-extrabold text-white">
                      Anti-Fraud Claim Verification
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setVerifyingOrderForRelease(null)}
                    className="text-text-dim hover:text-white text-sm cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-300 block mb-1">
                    Match Customer Paper Stub Code
                  </span>
                  <div className="text-4xl font-black font-mono tracking-widest text-emerald-300 my-1">
                    {getVerificationCode(verifyingOrderForRelease.orderId)}
                  </div>
                  <span className="text-xs text-text-dim">
                    Inspect customer's paper stub and verify it matches the bag tag.
                  </span>
                </div>

                <div className="bg-black/30 border border-white/5 rounded-xl p-3 flex flex-col gap-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-text-dim">Order ID:</span>
                    <span className="font-mono font-bold text-white">#{verifyingOrderForRelease.orderId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-dim">Customer:</span>
                    <span className="font-bold text-white">{verifyingOrderForRelease.client}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-dim">Item Blank:</span>
                    <span className="font-semibold text-text-main">{verifyingOrderForRelease.design}</span>
                  </div>
                  {verifyingOrderForRelease.personalization?.text && (
                    <div className="flex justify-between">
                      <span className="text-text-dim">Monogram:</span>
                      <span className="font-mono font-bold text-primary-light">"{verifyingOrderForRelease.personalization.text}"</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-1 border-t border-white/5">
                    <span className="text-text-dim">Payment:</span>
                    <span className="font-bold text-emerald-400">
                      ₱{verifyingOrderForRelease.totalAmount?.toFixed(2)} (PAID IN FULL)
                    </span>
                  </div>
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setVerifyingOrderForRelease(null)}
                    className="flex-1 py-2.5 rounded-xl border border-border-glass bg-white/5 hover:bg-white/10 text-text-main text-xs font-bold transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const ord = verifyingOrderForRelease;
                      setVerifyingOrderForRelease(null);
                      await handleTurnOverToCustomer(ord);
                    }}
                    className="flex-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span>Stub Matches — Complete Turnover</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* THERMAL CLAIM STUB MODAL (ANTI-FRAUD PROTECTION)            */}
      {/* ───────────────────────────────────────────────────────────── */}
      {createdOrderTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-bg-surface border border-border-glass rounded-xl max-w-sm w-full p-5 shadow-2xl flex flex-col gap-4">
            <div
              id="thermal-claim-stub-print"
              className="bg-white text-zinc-950 p-5 rounded font-mono text-center flex flex-col gap-2 text-xs border border-zinc-200 shadow-sm"
            >
              <div className="border-b border-dashed border-zinc-400 pb-2">
                <div className="text-[10px] font-bold tracking-widest uppercase text-zinc-700">
                  CLAIM STUB &amp; INTAKE RECEIPT
                </div>
                <div className="text-base font-extrabold text-black mt-0.5 tracking-wider">
                  EDS TOWELS &amp; CAPS
                </div>
                <div className="text-[10px] text-zinc-600">
                  Pacific Mall Lucena • Ground Floor
                </div>
              </div>

              <div className="py-2.5 border-b border-dashed border-zinc-400">
                <div className="text-[10px] uppercase tracking-wider text-zinc-600 font-bold">
                  CLAIM TICKET NUMBER
                </div>
                <div className="text-3xl font-extrabold text-black tracking-widest my-1">
                  #{createdOrderTicket.orderId}
                </div>
                <div className="text-[11px] font-semibold text-zinc-800">
                  Ready for Claim: ~20 mins ({createdOrderTicket.readyBy})
                </div>
              </div>

              <div className="text-left flex flex-col gap-1 py-1.5 text-[11px] border-b border-dashed border-zinc-400">
                <div className="flex justify-between">
                  <span className="text-zinc-600">Customer:</span>
                  <span className="font-bold text-black">{createdOrderTicket.clientName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600">Item:</span>
                  <span className="font-bold text-black">
                    {createdOrderTicket.quantity}x {createdOrderTicket.itemName}
                  </span>
                </div>
                {createdOrderTicket.personalizationText && (
                  <div className="flex justify-between">
                    <span className="text-zinc-600">Embroidery:</span>
                    <span className="font-bold text-black">"{createdOrderTicket.personalizationText}"</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-zinc-600">Verification:</span>
                  <span className="font-bold text-black">{createdOrderTicket.verificationCode}</span>
                </div>
              </div>

              <div className="flex flex-col gap-1 py-1 text-[11px] border-b border-dashed border-zinc-400">
                <div className="flex justify-between font-bold text-xs">
                  <span>TOTAL DUE:</span>
                  <span>₱{createdOrderTicket.grandTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-zinc-700">
                  <span>Payment:</span>
                  <span className="font-semibold">
                    {createdOrderTicket.paymentMethod} (PAID IN FULL)
                  </span>
                </div>
              </div>

              {/* DYNAMIC QR CODE FOR LIVE MOBILE TRACKING */}
              <div className="py-2.5 border-b border-dashed border-zinc-400 flex flex-col items-center justify-center gap-1">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(typeof window !== 'undefined' ? `${window.location.origin}/track?id=${createdOrderTicket.orderId}` : `http://localhost:3000/track?id=${createdOrderTicket.orderId}`)}`}
                  alt="Track Order QR Code"
                  className="w-20 h-20 border border-zinc-300 p-0.5 bg-white rounded"
                />
                <div className="text-[9px] font-bold text-zinc-800 uppercase tracking-wider">
                  Scan QR to Track On Your Phone
                </div>
                <div className="text-[8px] text-zinc-500 font-mono">
                  /track?id={createdOrderTicket.orderId}
                </div>
              </div>

              <div className="pt-2 text-[10px] text-zinc-700 font-bold uppercase leading-relaxed">
                Pakiprisinta ang claim stub na ito sa pag-claim.
                <div className="font-normal normal-case text-zinc-500 text-[9px] mt-0.5">
                  Anti-fraud verification protection.
                </div>
              </div>
            </div>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2.5 rounded-lg bg-bg-surface border border-border-glass text-text-main text-xs font-semibold hover:bg-white/5 transition cursor-pointer"
              >
                Print Thermal Stub
              </button>
              <button
                type="button"
                onClick={handleResetForm}
                className="flex-1 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-white text-xs font-bold transition cursor-pointer"
              >
                Next Customer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
