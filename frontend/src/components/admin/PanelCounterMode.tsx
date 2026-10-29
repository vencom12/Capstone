'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import GlassModal from '@/components/ui/GlassModal';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import InlineError from '@/components/ui/InlineError';
import OfficialClaimSlip from '@/components/dashboard/OfficialClaimSlip';
import QuantityInput from '@/components/ui/QuantityInput';
import type { Product, ProductVariant } from '@/lib/types';
import {
  MAX_CHARS_PER_LINE,
  resolveProductGarmentSize,
  sanitizeSingleLineText,
  sanitizeBulkMultilineText,
  calculateLetteringCost,
  parseBulkLetteringLines,
} from '@/lib/letteringPricing';
import Pagination from '@/components/ui/Pagination';

interface PanelCounterModeProps {
  orders: any[];
  refreshData: () => Promise<void>;
  isSyncing?: boolean;
  setOrders?: React.Dispatch<React.SetStateAction<any[]>>;
}

export interface CounterTicketItem {
  id: string;
  productId?: string;
  name: string;
  category: string;
  isByog: boolean;
  byogType?: 'small' | 'big';
  variantName?: string;
  text: string;
  namesList?: string[];
  isBulkList?: boolean;
  isPreOrder?: boolean;
  threadColor: string;
  quantity: number;
  basePrice: number;
  extraLetteringCost: number;
  totalExtraLetteringCost?: number;
  ratePerLetter: number;
  extraLettersCount: number;
  totalPrice: number;
}

export const THREAD_COLORS = [
  { name: 'Metallic Gold', hex: '#d4af37' },
  { name: 'Pure White', hex: '#ffffff' },
  { name: 'Obsidian Black', hex: '#1c1917' },
  { name: 'Silver Platinum', hex: '#e2e8f0' },
  { name: 'Royal Navy', hex: '#1e3a8a' },
  { name: 'Crimson Red', hex: '#b91c1c' },
  { name: 'Emerald Green', hex: '#047857' },
  { name: 'Rose Blush', hex: '#fb7185' },
];



export default function PanelCounterMode({ orders, refreshData, setOrders }: PanelCounterModeProps) {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

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
  const [byogGarmentType, setByogGarmentType] = useState<'small' | 'big'>('small');
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState<number>(250);

  // Step 2: Monogram text & Bulk Multi-Line Paste
  const [monogramText, setMonogramText] = useState('');
  const [intakeLetteringMode, setIntakeLetteringMode] = useState<'single' | 'bulk'>('single');
  const [intakeBulkText, setIntakeBulkText] = useState('');
  const [isHoldForPickup, setIsHoldForPickup] = useState(false);

  // Admin-configured Small/Big Garment Lettering Rates
  const [letteringRates, setLetteringRates] = useState<{ smallRate: number; bigRate: number }>({
    smallRate: 7,
    bigRate: 10,
  });

  // Step 3: Payment & Optional Google Link
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'GCash'>('Cash');
  const [gcashRef, setGcashRef] = useState('');
  const [customerContact, setCustomerContact] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [threadColor, setThreadColor] = useState('Metallic Gold');
  const [activeThreadColors, setActiveThreadColors] = useState<Array<{ name: string; hex: string; isAvailable?: boolean }>>(THREAD_COLORS);

  // Sync available thread colors from studio settings in real-time
  const syncSettingsColors = (colors: any[]) => {
    if (!Array.isArray(colors) || colors.length === 0) return;
    const mapped = colors.map((c: any) => ({
      name: c.name,
      hex: c.hex,
      isAvailable: c.isAvailable !== false,
    }));
    setActiveThreadColors(mapped);
    setThreadColor((prev) => {
      const matching = mapped.find((c: any) => c.name === prev);
      if (!matching || matching.isAvailable === false) {
        const firstAvail = mapped.find((c: any) => c.isAvailable !== false);
        return firstAvail ? firstAvail.name : prev;
      }
      return prev;
    });
  };

  useEffect(() => {
    const fetchColors = () => {
      api.get<any>('/api/customer/settings')
        .then((res) => {
          if (res?.availableThreadColors) {
            syncSettingsColors(res.availableThreadColors);
          }
          if (res) {
            setLetteringRates((prev) => ({
              smallRate: Number(res.smallGarmentLetterRate) || prev.smallRate || 7,
              bigRate: Number(res.bigGarmentLetterRate) || prev.bigRate || 10,
            }));
          }
        })
        .catch(() => { });
    };

    fetchColors();

    const handleSettingsEvent = (e: any) => {
      if (e.detail?.availableThreadColors) {
        syncSettingsColors(e.detail.availableThreadColors);
      } else {
        fetchColors();
      }
    };

    const handleDataChanged = (e: any) => {
      if (e.detail?.entity === 'SETTINGS') {
        fetchColors();
      }
    };

    window.addEventListener('settingsUpdated', handleSettingsEvent);
    window.addEventListener('dataChanged', handleDataChanged);
    window.addEventListener('focus', fetchColors);

    // Live counter poll every 2.5 seconds to keep counter and workshop in absolute sync
    const interval = setInterval(fetchColors, 2500);

    return () => {
      window.removeEventListener('settingsUpdated', handleSettingsEvent);
      window.removeEventListener('dataChanged', handleDataChanged);
      window.removeEventListener('focus', fetchColors);
      clearInterval(interval);
    };
  }, []);

  // Multi-Item Ticket Cart
  const [ticketItems, setTicketItems] = useState<CounterTicketItem[]>([]);

  // Quick Slip Punch Form fields (Solution 1: Nanay Slips)
  const [quickProductId, setQuickProductId] = useState<string>('');
  const [quickByogGarmentType, setQuickByogGarmentType] = useState<'small' | 'big'>('small');
  const [quickLetteringMode, setQuickLetteringMode] = useState<'single' | 'bulk'>('single');
  const [quickText, setQuickText] = useState('');
  const [quickBulkText, setQuickBulkText] = useState('');
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

  // Claim & Handover Desk state
  const [turnOverSearch, setTurnOverSearch] = useState('');
  const [turnOverPage, setTurnOverPage] = useState(1);
  const [turnOverPageSize, setTurnOverPageSize] = useState(8);
  const [verifyingOrderForRelease, setVerifyingOrderForRelease] = useState<any | null>(null);
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);

  useEffect(() => {
    setTurnOverPage(1);
  }, [turnOverSearch]);

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

  // Merged Catalog (strictly live database products + BYOG option)
  const storeCatalog = useMemo(() => {
    const items = liveProducts.map(p => {
      const tagLower = (p.tag || '').toLowerCase();
      const nameLower = (p.name || '').toLowerCase();
      let cat = 'Towels';
      if (tagLower.includes('fan') || nameLower.includes('fan')) cat = 'Fans';
      else if (tagLower.includes('towel') || nameLower.includes('towel')) cat = 'Towels';
      else if (p.category) cat = p.category;
      else cat = 'Custom';

      return {
        id: p.id,
        name: p.name,
        category: cat,
        price: p.price,
        stock: p.availableStock !== undefined ? p.availableStock : (p.count ?? 0),
        variants: p.variants || [],
        garmentSize: p.garmentSize,
        tags: p.tags,
        tag: p.tag,
        isByog: false
      };
    });

    items.push({
      id: 'byog_client_item',
      name: 'Client-Provided Garment (BYOG)',
      category: 'Custom',
      price: 0,
      stock: 999,
      variants: [],
      garmentSize: undefined,
      tags: [],
      tag: 'Custom',
      isByog: true
    });

    return items;
  }, [liveProducts]);

  // Filtered by Category (Towels, Fans, Custom, All) so only 4 items show at a time without squishing!
  const displayedCatalog = useMemo(() => {
    if (selectedCategory === 'All') return storeCatalog;
    return storeCatalog.filter(i => i.category === selectedCategory);
  }, [storeCatalog, selectedCategory]);

  const byogItem = useMemo(() => {
    return storeCatalog.find(i => i.isByog) || storeCatalog[storeCatalog.length - 1];
  }, [storeCatalog]);

  const activeSelectedItem = useMemo(() => {
    if (selectedCategory === 'Custom') {
      return byogItem;
    }
    return storeCatalog.find(i => i.id === selectedProductId) || storeCatalog[0];
  }, [storeCatalog, selectedProductId, selectedCategory, byogItem]);

  const activeQuickItem = useMemo(() => {
    if (selectedCategory === 'Custom') {
      return byogItem;
    }
    return storeCatalog.find(i => i.id === quickProductId) || storeCatalog[0];
  }, [storeCatalog, quickProductId, selectedCategory, byogItem]);

  const handleSelectCategory = (cat: 'Towels' | 'Fans' | 'Custom' | 'All') => {
    setSelectedCategory(cat);
    if (cat === 'Custom') {
      if (byogItem) {
        setSelectedProductId(byogItem.id);
        setSelectedVariant(null);
        setUnitPrice(byogItem.price);
      }
    } else if (cat !== 'All') {
      const firstInCat = storeCatalog.find(i => i.category === cat && !i.isByog);
      if (firstInCat && (!activeSelectedItem || activeSelectedItem.isByog || activeSelectedItem.category !== cat)) {
        setSelectedProductId(firstInCat.id);
        setSelectedVariant(null);
        setUnitPrice(firstInCat.price);
      }
    }
  };

  const handleSelectQuickCategory = (cat: 'Towels' | 'Fans' | 'Custom' | 'All') => {
    setSelectedCategory(cat);
    if (cat === 'Custom') {
      if (byogItem) {
        setQuickProductId(byogItem.id);
        setQuickPrice(byogItem.price);
      }
    } else if (cat !== 'All') {
      const firstInCat = storeCatalog.find(i => i.category === cat && !i.isByog);
      if (firstInCat && (!activeQuickItem || activeQuickItem.isByog || activeQuickItem.category !== cat)) {
        setQuickProductId(firstInCat.id);
        setQuickPrice(firstInCat.price);
      }
    }
  };

  const handleSelectItem = (item: any) => {
    setSelectedProductId(item.id);
    setSelectedVariant(null);
    setUnitPrice(item.price);
  };

  const handleSelectQuickItem = (item: any) => {
    setQuickProductId(item.id);
    setQuickPrice(item.price);
  };

  // Lettering extra pricing rule:
  // Store products: First word is included in base price. Subsequent words (after space) cost admin-configured Small or Big rate per letter.
  // BYOG: Customer brings garment. Every single letter has a fee (admin-configured Small or Big rate). No free first word.
  const isSelectedBigGarment = useMemo(() => {
    if (activeSelectedItem?.isByog) {
      return byogGarmentType === 'big';
    }
    return (
      resolveProductGarmentSize({
        garmentSize: (activeSelectedItem as any)?.garmentSize,
        tags: (activeSelectedItem as any)?.tags,
        tag: (activeSelectedItem as any)?.tag,
        category: activeSelectedItem?.category,
        name: activeSelectedItem?.name || customByogName,
      }) === 'big'
    );
  }, [activeSelectedItem, customByogName, byogGarmentType]);

  const counterLettering = useMemo(() => {
    return calculateLetteringCost(
      monogramText,
      isSelectedBigGarment,
      letteringRates,
      Boolean(activeSelectedItem?.isByog)
    );
  }, [monogramText, isSelectedBigGarment, letteringRates, activeSelectedItem?.isByog]);

  const intakeBulkSummary = useMemo(() => {
    return parseBulkLetteringLines(
      intakeBulkText,
      isSelectedBigGarment,
      letteringRates,
      Boolean(activeSelectedItem?.isByog)
    );
  }, [intakeBulkText, isSelectedBigGarment, letteringRates, activeSelectedItem?.isByog]);

  // Auto-sync quantity to bulk line count when in Bulk mode
  useEffect(() => {
    if (intakeLetteringMode === 'bulk' && intakeBulkSummary.lineCount > 0) {
      setQuantity(intakeBulkSummary.lineCount);
    }
  }, [intakeLetteringMode, intakeBulkSummary.lineCount]);

  const effectiveIntakeQty =
    intakeLetteringMode === 'bulk' && intakeBulkSummary.lineCount > 0
      ? intakeBulkSummary.lineCount
      : Math.max(1, quantity);

  const effectiveUnitPrice =
    intakeLetteringMode === 'bulk'
      ? (unitPrice || 0) + intakeBulkSummary.averageExtraCostPerUnit
      : (unitPrice || 0) + counterLettering.extraCost;

  const grandTotal = useMemo(() => {
    if (intakeLetteringMode === 'bulk' && intakeBulkSummary.lineCount > 0) {
      return Number(((unitPrice || 0) * intakeBulkSummary.lineCount + intakeBulkSummary.totalExtraCost).toFixed(2));
    }
    return Number((effectiveUnitPrice * effectiveIntakeQty).toFixed(2));
  }, [intakeLetteringMode, intakeBulkSummary, unitPrice, effectiveUnitPrice, effectiveIntakeQty]);

  const selectedAvailableStock = useMemo(() => {
    if (!activeSelectedItem || activeSelectedItem.isByog) return 999999;
    if (selectedVariant) {
      return (selectedVariant as any).availableStock !== undefined
        ? (selectedVariant as any).availableStock
        : (selectedVariant.stock ?? 0);
    }
    return activeSelectedItem.stock ?? 0;
  }, [activeSelectedItem, selectedVariant]);

  const intakeExceedsStock =
    !activeSelectedItem?.isByog && selectedAvailableStock < 999999 && effectiveIntakeQty > selectedAvailableStock;

  // Quick Slip Punch lettering
  const isQuickBigGarment = useMemo(() => {
    if (activeQuickItem?.isByog) {
      return quickByogGarmentType === 'big';
    }
    return (
      resolveProductGarmentSize({
        garmentSize: (activeQuickItem as any)?.garmentSize,
        tags: (activeQuickItem as any)?.tags,
        tag: (activeQuickItem as any)?.tag,
        category: activeQuickItem?.category,
        name: activeQuickItem?.name,
      }) === 'big'
    );
  }, [activeQuickItem, quickByogGarmentType]);

  const quickLettering = useMemo(() => {
    return calculateLetteringCost(
      quickText,
      isQuickBigGarment,
      letteringRates,
      Boolean(activeQuickItem?.isByog)
    );
  }, [quickText, isQuickBigGarment, letteringRates, activeQuickItem?.isByog]);

  const quickBulkSummary = useMemo(() => {
    return parseBulkLetteringLines(
      quickBulkText,
      isQuickBigGarment,
      letteringRates,
      Boolean(activeQuickItem?.isByog)
    );
  }, [quickBulkText, isQuickBigGarment, letteringRates, activeQuickItem?.isByog]);

  useEffect(() => {
    if (quickLetteringMode === 'bulk' && quickBulkSummary.lineCount > 0) {
      setQuickQuantity(quickBulkSummary.lineCount);
    }
  }, [quickLetteringMode, quickBulkSummary.lineCount]);

  const effectiveQuickQty =
    quickLetteringMode === 'bulk' && quickBulkSummary.lineCount > 0
      ? quickBulkSummary.lineCount
      : Math.max(1, quickQuantity);

  const effectiveQuickPrice =
    quickLetteringMode === 'bulk'
      ? (quickPrice || 0) + quickBulkSummary.averageExtraCostPerUnit
      : (quickPrice || 0) + quickLettering.extraCost;

  const quickGrandTotal = useMemo(() => {
    if (quickLetteringMode === 'bulk' && quickBulkSummary.lineCount > 0) {
      return Number(((quickPrice || 0) * quickBulkSummary.lineCount + quickBulkSummary.totalExtraCost).toFixed(2));
    }
    return Number((effectiveQuickPrice * effectiveQuickQty).toFixed(2));
  }, [quickLetteringMode, quickBulkSummary, quickPrice, effectiveQuickPrice, effectiveQuickQty]);

  const estimatedReadyTime = useMemo(() => {
    const readyDate = new Date(Date.now() + 20 * 60000);
    return readyDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, []);

  const ticketGrandTotal = useMemo(() => {
    if (ticketItems.length > 0) {
      return ticketItems.reduce((sum, it) => sum + it.totalPrice, 0);
    }
    return grandTotal;
  }, [ticketItems, grandTotal]);

  const ticketTotalPieces = useMemo(() => {
    if (ticketItems.length > 0) {
      return ticketItems.reduce((sum, it) => sum + it.quantity, 0);
    }
    return effectiveIntakeQty;
  }, [ticketItems, effectiveIntakeQty]);

  const hasAnyEmbroidery = useMemo(() => {
    if (ticketItems.length > 0) {
      return ticketItems.some(it => (it.text || '').trim().length > 0 || (it.namesList && it.namesList.length > 0));
    }
    if (intakeLetteringMode === 'bulk') {
      return intakeBulkSummary.lineCount > 0;
    }
    return monogramText.trim().length > 0;
  }, [ticketItems, intakeLetteringMode, intakeBulkSummary.lineCount, monogramText]);

  const handleAddCurrentItemToTicket = () => {
    const isByog = Boolean(activeSelectedItem.isByog);
    const byogTag = byogGarmentType === 'big' ? 'Big Item' : 'Small Item';
    const itemName = isByog
      ? `BYOG [${byogTag}]${customByogName.trim() ? ` (${customByogName.trim()})` : ''}`
      : selectedVariant
        ? `${activeSelectedItem.name} - ${selectedVariant.name}`
        : activeSelectedItem.name;

    const isBulk = intakeLetteringMode === 'bulk' && intakeBulkSummary.lineCount > 0;
    const namesArr = isBulk
      ? intakeBulkSummary.namesList.map((n) => n.toUpperCase())
      : monogramText.trim()
      ? [sanitizeSingleLineText(monogramText).trim().toUpperCase()]
      : [];

    const cleanText = isBulk
      ? namesArr.length === 1
        ? namesArr[0]
        : `${namesArr.length} Names (${namesArr.slice(0, 3).join(', ')}${namesArr.length > 3 ? '...' : ''})`
      : sanitizeSingleLineText(monogramText).trim().toUpperCase();

    const finalQty = isBulk ? intakeBulkSummary.lineCount : Math.max(1, quantity);
    const avgExtra = isBulk ? intakeBulkSummary.averageExtraCostPerUnit : counterLettering.extraCost;
    const totalExtra = isBulk ? intakeBulkSummary.totalExtraCost : counterLettering.extraCost * finalQty;
    const totalLetters = isBulk ? intakeBulkSummary.totalExtraLetters : counterLettering.extraLettersCount;
    const itemSubtotal = Number(((unitPrice || 0) * finalQty + totalExtra).toFixed(2));

    const newItem: CounterTicketItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      productId: isByog ? undefined : activeSelectedItem.id,
      name: itemName,
      category: activeSelectedItem.category,
      isByog,
      byogType: byogGarmentType,
      variantName: selectedVariant?.name,
      text: cleanText,
      namesList: namesArr,
      isBulkList: isBulk && namesArr.length > 1,
      isPreOrder: intakeExceedsStock,
      threadColor: cleanText ? threadColor : 'None (Plain)',
      quantity: finalQty,
      basePrice: unitPrice,
      extraLetteringCost: Number(avgExtra.toFixed(2)),
      totalExtraLetteringCost: Number(totalExtra.toFixed(2)),
      ratePerLetter: isBulk ? intakeBulkSummary.ratePerLetter : counterLettering.ratePerLetter,
      extraLettersCount: totalLetters,
      totalPrice: itemSubtotal
    };

    setTicketItems(prev => [...prev, newItem]);
    showToast(`Added ${newItem.quantity}x ${newItem.name}${cleanText ? ` ("${cleanText}")` : ''} to ticket`, 'success');

    // Reset input fields for next garment
    setMonogramText('');
    setIntakeBulkText('');
    setIntakeLetteringMode('single');
    setCustomByogName('');
    setQuantity(1);
    setSelectedVariant(null);
  };

  const handleRemoveTicketItem = (itemId: string) => {
    setTicketItems(prev => prev.filter(it => it.id !== itemId));
  };

  const handleUpdateTicketItemQuantity = (itemId: string, newQty: number) => {
    const validQty = Math.max(1, newQty);
    setTicketItems(prev => prev.map(it => {
      if (it.id !== itemId) return it;
      if (it.isBulkList && it.namesList && it.namesList.length > 1) {
        showToast('Bulk Name List quantity is synced to its pasted lines.', 'info');
        return it;
      }
      const unitPrice = (it.basePrice || 0) + (it.extraLetteringCost || 0);
      return {
        ...it,
        quantity: validQty,
        totalPrice: unitPrice * validQty
      };
    }));
  };

  const resetIntakeInputs = () => {
    setMonogramText('');
    setIntakeBulkText('');
    setIntakeLetteringMode('single');
    setCustomerName('');
    setCustomerContact('');
    setGcashRef('');
    setQuantity(1);
    setSelectedVariant(null);
    setCustomByogName('');
    setTicketItems([]);
    setIsHoldForPickup(false);
  };

  const handleResetForm = () => {
    resetIntakeInputs();
    setCreatedOrderTicket(null);
  };

  // Submit Intake Order
  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setIntakeError(null);

    setIsSubmitting(true);
    try {
      const isMulti = ticketItems.length > 0;
      let finalItems: any[] = [];
      let totalAmountToSubmit = 0;
      let primaryDesign = '';
      let defaultClientName = '';

      if (isMulti) {
        finalItems = ticketItems.map(item => ({
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          price: item.totalPrice / item.quantity,
          isByog: item.isByog,
          isPreOrder: item.isPreOrder,
          selectedVariant: item.variantName || null,
          personalization: {
            text: item.text,
            namesList: item.namesList || (item.text ? [item.text] : []),
            isBulkList: Boolean(item.isBulkList),
            threadColor: { name: item.threadColor },
            color: item.threadColor,
            placement: item.category === 'Fans' ? 'Fan Blade' : 'Towel Bottom Hem',
            variant: item.variantName || null,
            extraLetteringCost: item.extraLetteringCost,
            totalExtraLetteringCost: item.totalExtraLetteringCost,
            extraLettersCount: item.extraLettersCount,
          }
        }));
        totalAmountToSubmit = ticketGrandTotal;
        primaryDesign = ticketItems.map(it => `${it.name}${it.text ? ` — "${it.text}"` : ''}`).join(' + ');
        defaultClientName = `Walk-In (${ticketItems.map(i => i.text).filter(Boolean).slice(0, 2).join(' & ')}${ticketItems.length > 2 ? ' +' : ''})`;
      } else {
        const isByog = activeSelectedItem.isByog;
        const byogTag = byogGarmentType === 'big' ? 'Big Item' : 'Small Item';
        const itemName = isByog
          ? `BYOG [${byogTag}]${customByogName.trim() ? ` (${customByogName.trim()})` : ''}`
          : selectedVariant
            ? `${activeSelectedItem.name} - ${selectedVariant.name}`
            : activeSelectedItem.name;

        const isBulk = intakeLetteringMode === 'bulk' && intakeBulkSummary.lineCount > 0;
        const namesArr = isBulk
          ? intakeBulkSummary.namesList.map((n) => n.toUpperCase())
          : monogramText.trim()
          ? [sanitizeSingleLineText(monogramText).trim().toUpperCase()]
          : [];

        const cleanText = isBulk
          ? namesArr.length === 1
            ? namesArr[0]
            : `${namesArr.length} Names (${namesArr.slice(0, 3).join(', ')}${namesArr.length > 3 ? '...' : ''})`
          : sanitizeSingleLineText(monogramText).trim().toUpperCase();

        finalItems = [
          {
            productId: activeSelectedItem.isByog ? undefined : activeSelectedItem.id,
            name: itemName,
            quantity: effectiveIntakeQty,
            price: effectiveUnitPrice,
            isByog,
            isPreOrder: intakeExceedsStock,
            selectedVariant: selectedVariant?.name || null,
            personalization: {
              text: cleanText,
              namesList: namesArr,
              isBulkList: isBulk && namesArr.length > 1,
              threadColor: cleanText ? { name: threadColor } : null,
              color: cleanText ? threadColor : 'None (Plain)',
              placement: activeSelectedItem.category === 'Fans' ? 'Fan Blade' : 'Towel Bottom Hem',
              variant: selectedVariant?.name || null,
              extraLetteringCost: isBulk ? intakeBulkSummary.averageExtraCostPerUnit : counterLettering.extraCost,
              totalExtraLetteringCost: isBulk ? intakeBulkSummary.totalExtraCost : counterLettering.extraCost * effectiveIntakeQty,
              extraLettersCount: isBulk ? intakeBulkSummary.totalExtraLetters : counterLettering.extraLettersCount,
            }
          }
        ];
        totalAmountToSubmit = grandTotal;
        primaryDesign = cleanText ? `${itemName} — "${cleanText}"` : `${itemName} (Plain)`;
        defaultClientName = cleanText ? `Walk-In (${namesArr[0] || cleanText})` : 'Walk-In Customer';
      }

      const isEmail = customerContact.includes('@');
      const isPhone = customerContact.replace(/\D/g, '').length >= 7;

      const isPlainOrder = !hasAnyEmbroidery;
      const isDirectComplete = isPlainOrder && !isHoldForPickup;

      const payload = {
        clientName: customerName.trim() || defaultClientName,
        clientPhone: isPhone ? customerContact.trim() : undefined,
        clientEmail: isEmail ? customerContact.trim() : undefined,
        design: primaryDesign,
        items: finalItems,
        totalAmount: totalAmountToSubmit,
        paymentMethod,
        paymentStatus: 'paid',
        isByog: finalItems.some(i => i.isByog),
        isImmediate: true,
        executionMode: 'immediate',
        isAlreadyCompleted: isDirectComplete,
        isHoldForPickup: isPlainOrder && isHoldForPickup,
        personalizationText: finalItems[0]?.personalization?.text || '',
        threadColor: hasAnyEmbroidery ? (finalItems[0]?.personalization?.threadColor?.name || finalItems[0]?.personalization?.threadColor || threadColor) : 'None (Plain)',
        notes: [
          isPlainOrder ? (isHoldForPickup ? 'Plain Walk-In (Packaged & held on side for pickup)' : 'Plain Walk-In (Direct off-the-shelf sale)') : '',
          finalItems.length > 1 ? `Multi-item batch (${finalItems.length} items)` : '',
          customerContact ? `Contact: ${customerContact}` : '',
          gcashRef.trim() ? `GCash Ref: ${gcashRef.trim()}` : '',
          `Counter Intake Ticket (Pacific Mall)`
        ].filter(Boolean).join(' | ')
      };

      const res = await api.post<{ success: boolean; message: string; order: any }>('/api/admin/orders/walk-in', payload);

      if (res && res.order) {
        if (typeof window !== 'undefined') {
          (window as any).__lastSelfCreatedOrderId = res.order.orderId;
          (window as any).__lastSelfCreatedOrderTime = Date.now();
        }
        showToast(`Ticket #${res.order.orderId} registered!`, 'success');
        setCreatedOrderTicket({
          ...res.order,
          clientName: payload.clientName,
          items: finalItems,
          totalAmount: totalAmountToSubmit,
          paymentMethod,
          readyBy: estimatedReadyTime,
          verificationCode: `#${res.order.orderId.replace('WI-', 'A-')}`,
          isDirectSale: isDirectComplete,
          isHoldForPickup: isPlainOrder && isHoldForPickup,
          status: isDirectComplete ? 'Completed' : (res.order.status || 'In Queue')
        });
        resetIntakeInputs();
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
    const isByog = Boolean(activeQuickItem.isByog);
    const byogTag = quickByogGarmentType === 'big' ? 'Big Item' : 'Small Item';
    const itemName = isByog ? `BYOG [${byogTag}]` : activeQuickItem.name;
    const isBulk = quickLetteringMode === 'bulk' && quickBulkSummary.lineCount > 0;
    const namesArr = isBulk
      ? quickBulkSummary.namesList.map((n) => n.toUpperCase())
      : quickText.trim()
      ? [sanitizeSingleLineText(quickText).trim().toUpperCase()]
      : [];
    const cleanText = isBulk
      ? namesArr.length === 1
        ? namesArr[0]
        : `${namesArr.length} Names (${namesArr.slice(0, 3).join(', ')}${namesArr.length > 3 ? '...' : ''})`
      : sanitizeSingleLineText(quickText).trim().toUpperCase();
    const totalAmount = quickGrandTotal;
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
    setQuickBulkText('');
    setQuickLetteringMode('single');
    setQuickQuantity(1);
    showToast(`Recorded ₱${totalAmount.toFixed(2)} ${itemName}!`, 'success');

    // 2. Dispatch to server in background
    try {
      const hasEmbroidery = cleanText.length > 0;
      const payload = {
        clientName: cleanText ? `Walk-In (${namesArr[0] || cleanText})` : 'Walk-In Customer',
        design: cleanText ? `${itemName} — "${cleanText}"` : `${itemName} (Plain)`,
        items: [
          {
            productId: activeQuickItem.isByog ? undefined : activeQuickItem.id,
            name: itemName,
            quantity: effectiveQuickQty,
            price: effectiveQuickPrice,
            isByog: activeQuickItem.isByog,
            personalization: {
              text: cleanText,
              namesList: namesArr,
              isBulkList: isBulk && namesArr.length > 1,
              extraLetteringCost: isBulk ? quickBulkSummary.averageExtraCostPerUnit : quickLettering.extraCost,
              totalExtraLetteringCost: isBulk ? quickBulkSummary.totalExtraCost : quickLettering.extraCost * effectiveQuickQty,
              extraLettersCount: isBulk ? quickBulkSummary.totalExtraLetters : quickLettering.extraLettersCount,
            }
          }
        ],
        totalAmount,
        paymentMethod: quickPayment,
        paymentStatus: 'paid',
        isAlreadyCompleted: !hasEmbroidery,
        personalizationText: cleanText,
        notes: hasEmbroidery ? `Quick Slip Punch (Stitching required)` : `Quick Slip Punch: Plain sale`
      };

      const res = await api.post<{ success: boolean; message: string; order: any }>('/api/admin/orders/walk-in', payload);
      if (res && res.order) {
        // Reconcile temporary orderId with real DB orderId
        setPunchedSlipsToday(prev => prev.map(s => s.id === tempSlipId ? { ...s, id: res.order.id, orderId: res.order.orderId } : s));
        refreshData().catch(() => { });
      }
    } catch (err: any) {
      // 3. Rollback on error
      setPunchedSlipsToday(prev => prev.filter(s => s.id !== tempSlipId));
      console.error('Quick punch error:', err);
      setQuickPunchError(err.message || 'Failed to punch slip. Reverted.');
      showToast(err.message || 'Failed to punch slip. Reverted.', 'error');
    }
  };

  // Claim & Handover Desk (Cashier Counter Pickup)
  const readyForClaimOrders = useMemo(() => {
    return (orders || []).filter((o) => {
      return ['Ready For Pick Up', 'Ready for Pickup'].includes(o.status);
    });
  }, [orders]);

  const filteredClaimOrders = useMemo(() => {
    if (!turnOverSearch.trim()) {
      return readyForClaimOrders;
    }
    const q = turnOverSearch.toLowerCase().trim();
    const cleanQ = q.replace(/^#/, '');

    return (orders || []).filter((o) => {
      const claimCode = (o.claimCode || o.personalization?.claimCode || getVerificationCode(o.orderId) || '').toLowerCase();
      const orderId = (o.orderId || '').toLowerCase();
      const client = (o.client || '').toLowerCase();
      const text = (o.personalization?.text || o.design || '').toLowerCase();

      return (
        claimCode.includes(q) ||
        claimCode.includes(cleanQ) ||
        orderId.includes(q) ||
        orderId.includes(cleanQ) ||
        client.includes(q) ||
        text.includes(q)
      );
    });
  }, [orders, readyForClaimOrders, turnOverSearch]);

  const paginatedClaimOrders = useMemo(() => {
    const start = (turnOverPage - 1) * turnOverPageSize;
    return filteredClaimOrders.slice(start, start + turnOverPageSize);
  }, [filteredClaimOrders, turnOverPage, turnOverPageSize]);

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
      refreshData().catch(() => { });
    } catch (err: any) {
      // 3. Rollback on error
      if (setOrders) setOrders(prevOrders);
      showToast(err.message || 'Failed to turn over item. Reverted.', 'error');
    } finally {
      setActionInProgressId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 text-left max-w-6xl w-full mx-auto pb-4 font-sans overflow-x-hidden">
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
      <div className="flex flex-row items-center justify-start pb-2 border-b border-border-glass mb-1 overflow-x-auto no-scrollbar w-full max-w-full">
        {/* Tab Switcher */}
        <div className="flex bg-bg-surface border border-border-glass rounded-lg p-0.5 gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('register')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shrink-0 ${activeTab === 'register'
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
            className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shrink-0 ${activeTab === 'quick_punch'
              ? 'bg-primary text-white shadow-sm'
              : 'text-text-dim hover:text-text-main'
              }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Quick Slips</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('turnover')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 ${activeTab === 'turnover'
              ? 'bg-primary text-white shadow-sm'
              : 'text-text-dim hover:text-text-main'
              }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span>Claim &amp; Handover</span>
            {readyForClaimOrders.length > 0 && (
              <span className="bg-white/15 text-current border border-white/20 px-1.5 py-0.2 rounded-full text-[10px] font-bold">
                {readyForClaimOrders.length} Ready
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
                  {selectedCategory === 'Custom' ? '1. Customer Garment (BYOG)' : '1. Pick Store Item'}
                </span>
                <div className="flex gap-1">
                  {(['Towels', 'Fans', 'Custom', 'All'] as const).map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => handleSelectCategory(cat)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${selectedCategory === cat
                        ? 'bg-primary text-white shadow-sm'
                        : 'bg-bg-card border border-border-glass text-text-dim hover:text-text-main'
                        }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* If Custom is selected: Directly show BYOG Garment Size & Rate without redundant card selection! */}
              {selectedCategory === 'Custom' ? (
                <div className="space-y-3">
                  {/* Clean BYOG Status & Base Price Header */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/30">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                      <div>
                        <span className="font-bold text-xs text-text-main block">Client-Provided Garment (BYOG)</span>
                        <span className="text-[11px] text-text-dim">Customer brings their own item (Cap, Shirt, Towel, Uniform)</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] text-text-dim block uppercase font-bold">Base Service</span>
                      <span className="font-mono font-bold text-xs text-primary">₱{activeSelectedItem?.price || 100}</span>
                    </div>
                  </div>

                  {/* Garment Size & Lettering Rate Buttons - Instantly Available */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-bold text-text-dim uppercase tracking-wider">
                        Garment Size &amp; Lettering Rate
                      </label>
                      <span className="text-[10px] text-text-dim">1st word included in base price</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setByogGarmentType('small')}
                        className={`p-2.5 rounded-lg border text-left cursor-pointer transition ${byogGarmentType === 'small'
                            ? 'bg-primary/20 border-primary text-text-main ring-1 ring-primary/40'
                            : 'bg-white/[0.03] border-border-glass text-text-dim hover:text-text-main'
                          }`}
                      >
                        <div className="font-bold text-xs flex items-center justify-between">
                          <span>Small Garment</span>
                          <span className="font-mono text-primary text-[11px]">₱7/letter</span>
                        </div>
                        <div className="text-[10px] text-text-dim mt-0.5">Cap, Face Towel, Hand Towel, Fan, Handkerchief</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setByogGarmentType('big')}
                        className={`p-2.5 rounded-lg border text-left cursor-pointer transition ${byogGarmentType === 'big'
                            ? 'bg-primary/20 border-primary text-text-main ring-1 ring-primary/40'
                            : 'bg-white/[0.03] border-border-glass text-text-dim hover:text-text-main'
                          }`}
                      >
                        <div className="font-bold text-xs flex items-center justify-between">
                          <span>Big Garment</span>
                          <span className="font-mono text-primary text-[11px]">₱10/letter</span>
                        </div>
                        <div className="text-[10px] text-text-dim mt-0.5">Shirt, Polo, Jacket, Bath Towel, Hoodie</div>
                      </button>
                    </div>
                  </div>

                  {/* Description Input */}
                  <div>
                    <input
                      type="text"
                      placeholder="Describe item brought by customer (e.g. Uniform, Polo, Baby Bib)..."
                      value={customByogName}
                      onChange={(e) => setCustomByogName(e.target.value)}
                      className="w-full bg-bg-surface border border-border-glass p-2.5 rounded-lg text-text-main text-xs outline-none focus:border-primary/50"
                    />
                  </div>
                </div>
              ) : (
                <>
                  {/* Spacious, Un-Truncated Item Cards */}
                  <div className="grid grid-cols-2 gap-2.5">
                    {displayedCatalog.map((item) => {
                      const isSelected = selectedProductId === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleSelectItem(item)}
                          className={`p-3 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between min-h-[62px] ${isSelected
                            ? 'bg-primary/10 border-primary text-text-main shadow-sm ring-1 ring-primary/40'
                            : 'bg-bg-card border-border-glass text-text-main hover:border-primary/40'
                            }`}
                        >
                          <div className="flex justify-between items-start gap-2">
                            <span className="font-bold text-xs leading-snug">{item.name}</span>
                            <span className="font-mono font-bold text-xs text-text-main shrink-0">₱{item.price}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-text-dim mt-1.5 pt-1 border-t border-white/5 gap-1.5 min-w-0">
                            <span className="truncate">{item.category}</span>
                            <span className="shrink-0 font-medium">{item.isByog ? 'Customer Item' : `• ${item.stock} in stock`}</span>
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
                          const vStock = (v as any).availableStock !== undefined ? (v as any).availableStock : (v.stock ?? 0);
                          const isVarOutOfStock = vStock <= 0;
                          return (
                            <button
                              key={vIdx}
                              type="button"
                              disabled={isVarOutOfStock}
                              onClick={() => {
                                if (isVarOutOfStock) return;
                                setSelectedVariant(v);
                                if (v.priceOverride) setUnitPrice(v.priceOverride);
                              }}
                              className={`px-2.5 py-1 rounded-lg border text-xs font-bold transition flex items-center gap-1.5 ${isVarOutOfStock
                                ? 'opacity-40 cursor-not-allowed bg-white/5 border-border-glass text-text-dim line-through'
                                : isVarSelected
                                  ? 'bg-primary text-white border-primary shadow-sm cursor-pointer'
                                  : 'bg-white/5 border-border-glass text-text-dim hover:text-text-main cursor-pointer'
                                }`}
                            >
                              {v.color && (
                                <span
                                  className="w-3 h-3 rounded-full border border-white/30"
                                  style={{ backgroundColor: v.color }}
                                />
                              )}
                              <span>{v.name}</span>
                              <span className={`text-[10px] font-mono ${isVarOutOfStock ? 'text-danger font-bold' : 'opacity-75'}`}>
                                ({isVarOutOfStock ? '0' : vStock})
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* BYOG Custom Note & Garment Size (if user clicked BYOG card in 'All' tab) */}
                  {activeSelectedItem.isByog && (
                    <div className="mt-3 pt-2.5 border-t border-border-glass space-y-2.5">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-[11px] font-bold text-text-dim uppercase tracking-wider">
                            Garment Size &amp; Lettering Rate
                          </label>
                          <span className="text-[10px] text-primary font-semibold">No free 1st word • All letters charged</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setByogGarmentType('small')}
                            className={`p-2.5 rounded-lg border text-left cursor-pointer transition ${byogGarmentType === 'small'
                                ? 'bg-primary/20 border-primary text-text-main ring-1 ring-primary/40'
                                : 'bg-white/[0.03] border-border-glass text-text-dim hover:text-text-main'
                              }`}
                          >
                            <div className="font-bold text-xs flex items-center justify-between">
                              <span>Small Garment</span>
                              <span className="font-mono text-primary text-[11px]">₱7/letter</span>
                            </div>
                            <div className="text-[10px] text-text-dim mt-0.5">Cap, Face Towel, Hand Towel, Fan, Handkerchief</div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setByogGarmentType('big')}
                            className={`p-2.5 rounded-lg border text-left cursor-pointer transition ${byogGarmentType === 'big'
                                ? 'bg-primary/20 border-primary text-text-main ring-1 ring-primary/40'
                                : 'bg-white/[0.03] border-border-glass text-text-dim hover:text-text-main'
                              }`}
                          >
                            <div className="font-bold text-xs flex items-center justify-between">
                              <span>Big Garment</span>
                              <span className="font-mono text-primary text-[11px]">₱10/letter</span>
                            </div>
                            <div className="text-[10px] text-text-dim mt-0.5">Shirt, Polo, Jacket, Bath Towel, Hoodie</div>
                          </button>
                        </div>
                      </div>
                      <input
                        type="text"
                        placeholder="Describe item brought by customer (e.g. Uniform, Polo, Baby Bib)..."
                        value={customByogName}
                        onChange={(e) => setCustomByogName(e.target.value)}
                        className="w-full bg-bg-surface border border-border-glass p-2.5 rounded-lg text-text-main text-xs outline-none focus:border-primary/50"
                      />
                    </div>
                  )}
                </>
              )}

              {/* STEP 2: EMBROIDERY TEXT (SINGLE OR BULK MULTI-LINE PASTE) */}
              <div className="mt-3.5 pt-3 border-t border-border-glass">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div>
                    <span className="text-xs font-extrabold text-text-dim uppercase tracking-wider block">
                      2. Name / Word to Embroider <span className="normal-case font-normal text-text-dim/60">(Optional • Max {MAX_CHARS_PER_LINE} chars/line)</span>
                    </span>
                    <span className="text-[10px] text-text-dim">
                      Tier: <strong className="text-primary">{isSelectedBigGarment ? `Big Garment (+₱${letteringRates.bigRate}/extra letter)` : `Small Garment (+₱${letteringRates.smallRate}/extra letter)`}</strong>
                    </span>
                  </div>

                  {/* Single vs Bulk List Toggle */}
                  <div className="flex bg-bg-card border border-border-glass rounded-lg p-0.5 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (intakeLetteringMode === 'bulk' && intakeBulkSummary.namesList[0]) {
                          setMonogramText(sanitizeSingleLineText(intakeBulkSummary.namesList[0]).toUpperCase());
                        }
                        setIntakeLetteringMode('single');
                      }}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                        intakeLetteringMode === 'single'
                          ? 'bg-primary text-white shadow-sm'
                          : 'text-text-dim hover:text-text-main'
                      }`}
                    >
                      Single Name
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (intakeLetteringMode === 'single' && monogramText.trim() && !intakeBulkText.trim()) {
                          setIntakeBulkText(sanitizeSingleLineText(monogramText).toUpperCase());
                        }
                        setIntakeLetteringMode('bulk');
                      }}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                        intakeLetteringMode === 'bulk'
                          ? 'bg-primary text-white shadow-sm'
                          : 'text-text-dim hover:text-text-main'
                      }`}
                    >
                      📋 Bulk List (Paste)
                    </button>
                  </div>
                </div>

                {intakeLetteringMode === 'single' ? (
                  <>
                    <div className="relative">
                      <input
                        type="text"
                        maxLength={MAX_CHARS_PER_LINE}
                        placeholder={`OPTIONAL: e.g. SOPHIA (Max ${MAX_CHARS_PER_LINE} chars incl. spaces; paste multiple lines for Bulk)`}
                        value={monogramText}
                        onPaste={(e) => {
                          const pasted = e.clipboardData.getData('text');
                          if (pasted && /\r?\n/.test(pasted.trim())) {
                            e.preventDefault();
                            setIntakeBulkText(sanitizeBulkMultilineText(pasted.toUpperCase()));
                            setIntakeLetteringMode('bulk');
                          }
                        }}
                        onChange={(e) => {
                          setMonogramText(sanitizeSingleLineText(e.target.value.toUpperCase()));
                          if (intakeError) setIntakeError(null);
                        }}
                        className="w-full bg-bg-card border border-border-glass px-3.5 py-2.5 rounded-lg text-text-main text-sm font-extrabold tracking-wider outline-none font-mono focus:border-primary/60 transition pr-16"
                      />
                      <span
                        className={`absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono font-bold ${
                          monogramText.length >= MAX_CHARS_PER_LINE ? 'text-primary' : 'text-text-dim'
                        }`}
                      >
                        {monogramText.length}/{MAX_CHARS_PER_LINE}
                      </span>
                    </div>
                    {monogramText.trim() && (
                      <div className="mt-2 text-xs flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/5 border border-border-glass">
                        <span className="text-text-dim text-[11px]">
                          {activeSelectedItem.isByog ? (
                            counterLettering.extraCost > 0 ? (
                              <>
                                BYOG Lettering: <strong className="text-primary">{counterLettering.extraLettersCount} letters × ₱{counterLettering.ratePerLetter}</strong> ({isSelectedBigGarment ? 'big garment' : 'small garment'} • every letter charged)
                              </>
                            ) : (
                              <span>BYOG: ₱{counterLettering.ratePerLetter}/letter ({isSelectedBigGarment ? 'big garment' : 'small garment'} • all letters charged)</span>
                            )
                          ) : counterLettering.extraCost > 0 ? (
                            <>
                              First word included. Additional letters: <strong className="text-primary">+{counterLettering.extraLettersCount} letters × ₱{counterLettering.ratePerLetter}</strong> ({isSelectedBigGarment ? 'big garment' : 'small garment'})
                            </>
                          ) : (
                            <span>First word included in base price (₱0 extra)</span>
                          )}
                        </span>
                        {counterLettering.extraCost > 0 && (
                          <span className="font-mono font-bold text-primary text-xs shrink-0 ml-2">
                            +₱{counterLettering.extraCost.toFixed(2)}
                          </span>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center text-[11px] text-text-dim">
                      <span>Paste or type 1 name per line (strictly max {MAX_CHARS_PER_LINE} chars per line incl. spaces):</span>
                      <span className="font-mono font-bold text-primary">
                        {intakeBulkSummary.lineCount} {intakeBulkSummary.lineCount === 1 ? 'line' : 'lines'} = {intakeBulkSummary.lineCount} pcs
                      </span>
                    </div>
                    <textarea
                      rows={4}
                      value={intakeBulkText}
                      onChange={(e) => {
                        setIntakeBulkText(sanitizeBulkMultilineText(e.target.value.toUpperCase()));
                        if (intakeError) setIntakeError(null);
                      }}
                      placeholder={`COACH 1\nCOACH 2\nPLAYER 3 A\n(Max ${MAX_CHARS_PER_LINE} chars per line)`}
                      className="w-full bg-bg-card border border-border-glass px-3.5 py-2.5 rounded-lg text-text-main text-xs font-mono font-bold tracking-wider outline-none focus:border-primary/60 transition resize-y"
                    />
                    {intakeBulkSummary.lines.length > 0 && (
                      <div className="bg-bg-surface border border-border-glass rounded-lg p-2 max-h-32 overflow-y-auto flex flex-col gap-1">
                        {intakeBulkSummary.lines.map((line) => (
                          <div
                            key={line.lineIndex}
                            className="flex items-center justify-between text-[11px] py-0.5 border-b border-border-glass/40 last:border-none"
                          >
                            <span className="font-mono text-text-main truncate">
                              <strong className="text-text-dim mr-1.5">#{line.lineIndex}</strong>
                              &ldquo;{line.sanitizedLine}&rdquo;{' '}
                              <span className="text-[10px] text-text-dim">({line.charCount}/{MAX_CHARS_PER_LINE})</span>
                            </span>
                            <span className={`font-mono font-bold shrink-0 ${line.extraCost > 0 ? 'text-primary' : 'text-text-dim'}`}>
                              {line.extraCost > 0 ? `+₱${line.extraCost} (${line.extraLettersCount} extra)` : 'Included'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Thread Color Selector - Only shown when text is entered */}
                {(intakeLetteringMode === 'bulk' ? intakeBulkSummary.lineCount > 0 : Boolean(monogramText.trim())) ? (
                  <div className="mt-3 pt-3 border-t border-border-glass animate-in fade-in duration-200">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-extrabold text-text-dim uppercase tracking-wider">
                        Thread Color
                      </span>
                      <span className="text-xs font-mono font-semibold text-text-main">
                        {threadColor}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                      {activeThreadColors.map(tc => {
                        const isSelected = threadColor === tc.name;
                        const isAvailable = tc.isAvailable !== false;
                        return (
                          <button
                            key={tc.name}
                            type="button"
                            disabled={!isAvailable}
                            onClick={() => {
                              if (isAvailable) setThreadColor(tc.name);
                            }}
                            title={isAvailable ? tc.name : `${tc.name} (Temporarily Out of Stock)`}
                            className={`relative flex flex-col items-center gap-1 p-1.5 rounded-lg border text-[10px] font-medium transition overflow-hidden ${!isAvailable
                                ? 'opacity-30 grayscale cursor-not-allowed border-dashed border-border-glass bg-bg-surface/50'
                                : isSelected
                                  ? 'bg-white/10 border-primary text-text-main ring-1 ring-primary cursor-pointer'
                                  : 'bg-bg-card border-border-glass text-text-dim hover:text-text-main hover:border-white/20 cursor-pointer'
                              }`}
                          >
                            {!isAvailable && (
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="w-[130%] h-[1.5px] bg-danger/80 rotate-45 transform" />
                              </div>
                            )}
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-black/30 dark:border-white/20 shrink-0 shadow-sm"
                              style={{ backgroundColor: tc.hex }}
                            />
                            <span className="truncate w-full text-center text-[10px] leading-tight">
                              {tc.name.split(' ')[0]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 pt-3 border-t border-border-glass">
                    <div className="px-3 py-2 rounded-lg bg-white/[0.02] border border-dashed border-border-glass text-[11px] text-text-dim flex items-center justify-between">
                      <span>No letters entered • <strong>Plain product (No thread needed)</strong></span>
                      <span className="text-[10px] text-text-dim/60">Type a name above to pick thread color</span>
                    </div>
                  </div>
                )}

                {/* Item Quantity & Staging Section */}
                <div className="mt-3.5 pt-3 border-t border-border-glass flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-text-main block">Item Quantity</span>
                      <span className="text-[10px] text-text-dim">
                        {intakeLetteringMode === 'bulk' && intakeBulkSummary.lineCount > 0
                          ? `Auto-synced to ${intakeBulkSummary.lineCount} pasted lines`
                          : 'Type or step for bulk quantity'}
                      </span>
                    </div>
                    {intakeLetteringMode === 'bulk' && intakeBulkSummary.lineCount > 0 ? (
                      <span className="px-3 py-1 rounded-lg bg-primary/15 border border-primary/30 text-primary font-mono font-bold text-xs">
                        {effectiveIntakeQty} pcs
                      </span>
                    ) : (
                      <QuantityInput
                        value={quantity}
                        onChange={(q) => setQuantity(q)}
                        min={1}
                        size="sm"
                        showPresets={true}
                        presets={[10, 25, 50, 100]}
                        ariaLabel="Item Quantity"
                      />
                    )}
                  </div>

                  {/* Stock Warning if Quantity Exceeds On-Hand Stock */}
                  {intakeExceedsStock && (
                    <div className="p-2.5 rounded-lg bg-bg-surface border border-border-glass text-[11px] text-text-dim flex items-center gap-2">
                      <span>⚠️</span>
                      <span>
                        <strong>Stock Warning:</strong> Quantity ({effectiveIntakeQty} pcs) exceeds current on-hand stock ({Math.max(0, selectedAvailableStock)} pcs). Order will be queued as a <strong>Pre-Order</strong> with extended workshop preparation &amp; production schedule.
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-border-glass/40">
                    <div className="text-[11px] text-text-dim">
                      <span className="font-medium text-text-main">
                        Item Subtotal ({effectiveIntakeQty} pcs):{' '}
                        <strong className="text-primary font-mono">
                          ₱{grandTotal.toFixed(2)}
                        </strong>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddCurrentItemToTicket}
                      className="py-2 px-3.5 rounded-lg bg-bg-surface hover:bg-white/10 active:scale-[0.98] border border-border-glass text-text-main text-xs font-extrabold shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      <span>+ Add to Order Ticket ({effectiveIntakeQty}x)</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Payment & Ticket Actions (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-3">
            <div className="bg-bg-surface border border-border-glass rounded-xl p-4 shadow-sm flex flex-col gap-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-text-dim uppercase tracking-wider">
                  3. Payment &amp; Queue Ticket
                </span>
                {ticketItems.length > 0 && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-bold font-mono">
                    {ticketItems.length} {ticketItems.length === 1 ? 'item' : 'items'} staged
                  </span>
                )}
              </div>

              {/* Multi-Item Staged Basket */}
              {ticketItems.length > 0 ? (
                <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
                  <div className="text-[11px] font-bold text-text-dim flex justify-between items-center px-1">
                    <span>Staged Items ({ticketTotalPieces} pcs total)</span>
                    <button
                      type="button"
                      onClick={() => setTicketItems([])}
                      className="text-[10px] text-text-dim hover:text-red-400 underline cursor-pointer"
                    >
                      Clear Staged
                    </button>
                  </div>
                  {ticketItems.map((item, idx) => (
                    <div
                      key={item.id}
                      className="bg-bg-card border border-border-glass rounded-lg p-2.5 flex items-start justify-between gap-2 text-xs"
                    >
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-text-dim">#{idx + 1}</span>
                          <span className="font-bold text-text-main truncate">{item.name}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/5 border border-border-glass text-text-dim font-mono">
                            {item.quantity}x
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px]">
                          {item.text ? (
                            <span className="font-mono font-bold text-primary truncate">"{item.text}"</span>
                          ) : (
                            <span className="italic text-text-dim/60">Plain item</span>
                          )}
                          {item.threadColor && (
                            <span className="text-[10px] text-text-dim/70">• {item.threadColor}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <QuantityInput
                          value={item.quantity}
                          onChange={(newQty) => handleUpdateTicketItemQuantity(item.id, newQty)}
                          min={1}
                          size="sm"
                          ariaLabel={`Quantity for ${item.name}`}
                        />
                        <span className="font-mono font-bold text-primary text-xs min-w-[3.5rem] text-right">
                          ₱{item.totalPrice.toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTicketItem(item.id)}
                          title="Remove item"
                          className="text-text-dim hover:text-red-400 p-1 cursor-pointer transition"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Compact Quantity & Price Block */}
              <div className="bg-bg-card border border-border-glass rounded-xl p-3 flex items-center justify-between">
                {ticketItems.length === 0 ? (
                  <div className="flex flex-col">
                    <span className="text-[11px] text-text-dim">Current Item:</span>
                    <span className="text-xs font-bold text-text-main">
                      {activeSelectedItem?.name || 'Custom Garment'} ({effectiveIntakeQty} {effectiveIntakeQty === 1 ? 'pc' : 'pcs'})
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    <span className="text-[11px] text-text-dim">Combined Total:</span>
                    <span className="text-xs font-bold text-text-main">
                      {ticketItems.length} items ({ticketTotalPieces} pcs)
                    </span>
                  </div>
                )}

                <div className="text-right">
                  <span className="text-[11px] text-text-dim block">Total Due:</span>
                  <span className="text-2xl font-black font-mono text-primary">
                    ₱{ticketGrandTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Payment Method Selector */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('Cash')}
                  className={`py-2.5 px-3 rounded-lg border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${paymentMethod === 'Cash'
                    ? 'bg-primary text-white border-primary shadow-sm'
                    : 'bg-bg-card border-border-glass text-text-dim hover:text-text-main'
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
                  className={`py-2.5 px-3 rounded-lg border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${paymentMethod === 'GCash'
                    ? 'bg-primary text-white border-primary shadow-sm'
                    : 'bg-bg-card border-border-glass text-text-dim hover:text-text-main'
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
                <div className="bg-bg-card border border-border-glass rounded-xl p-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="16" rx="2" />
                      <line x1="7" y1="8" x2="7.01" y2="8" />
                      <line x1="11" y1="8" x2="17" y2="8" />
                      <line x1="7" y1="12" x2="17" y2="12" />
                      <line x1="7" y1="16" x2="13" y2="16" />
                    </svg>
                    <div>
                      <span className="text-xs font-bold text-text-main block">
                        Customer scans printed counter QR standee
                      </span>
                      <span className="text-[11px] text-text-dim">
                        Customer scans counter QR Ph, pays ₱{ticketGrandTotal.toFixed(2)}, and shows receipt.
                      </span>
                    </div>
                  </div>
                  <input
                    type="text"
                    placeholder="GCash Ref # (optional, e.g. 8492)"
                    value={gcashRef}
                    onChange={(e) => setGcashRef(e.target.value)}
                    className="w-full bg-bg-surface border border-border-glass px-3 py-2 rounded-lg text-text-main text-xs font-mono outline-none placeholder:text-text-dim/60 focus:border-primary"
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
                  className="w-full bg-bg-card border border-border-glass px-3.5 py-2.5 rounded-lg text-text-main text-xs outline-none focus:border-primary transition"
                />
              </div>

              {/* Plain Item Direct Sale Indicator */}
              {!hasAnyEmbroidery && (
                <div className="bg-bg-card border border-border-glass rounded-xl p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-text-main">
                        {isHoldForPickup ? 'Hold on Side for Pickup Later' : 'Direct Off-the-Shelf Sale'}
                      </span>
                      <span className="text-[11px] text-text-dim">
                        {isHoldForPickup
                          ? 'Bag order now with claim slip and place on the side.'
                          : 'Plain item (no embroidery) — hand over directly at counter.'}
                      </span>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer pt-1.5 border-t border-border-glass text-xs font-medium text-text-dim hover:text-text-main select-none">
                    <input
                      type="checkbox"
                      checked={isHoldForPickup}
                      onChange={(e) => setIsHoldForPickup(e.target.checked)}
                      className="rounded border-border-glass accent-primary"
                    />
                    <span>Customer will pick up later (Hold on side with claim slip)</span>
                  </label>
                </div>
              )}

              {/* Big Action Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 rounded-lg bg-primary hover:bg-primary/90 active:scale-[0.99] text-white font-extrabold text-sm shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                <span>
                  {isSubmitting
                    ? 'Processing...'
                    : !hasAnyEmbroidery
                      ? (isHoldForPickup ? 'Bag Order & Print Claim Slip' : 'Direct Sale & Hand Over (Complete)')
                      : (ticketItems.length > 0
                        ? `Punch ${ticketTotalPieces} Item${ticketTotalPieces > 1 ? 's' : ''} & Queue for Stitching`
                        : 'Punch Order & Queue for Stitching')}
                </span>
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
                  {selectedCategory === 'Custom' ? '1. Customer Garment from Slip (BYOG)' : '1. Pick Stitched Item from Slip'}
                </span>
                <div className="flex gap-1">
                  {(['Towels', 'Fans', 'Custom', 'All'] as const).map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => handleSelectQuickCategory(cat)}
                      className={`px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer ${selectedCategory === cat
                        ? 'bg-primary text-white shadow-sm'
                        : 'bg-white/5 text-text-dim hover:text-text-main'
                        }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {selectedCategory === 'Custom' ? (
                <div className="mb-3 space-y-2">
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-primary/10 border border-primary/30">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                      <span className="font-bold text-xs text-text-main">Client-Provided Garment (BYOG)</span>
                    </div>
                    <span className="font-mono font-bold text-xs text-primary">Base: ₱{activeQuickItem?.price || 100}</span>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-bold text-text-dim uppercase tracking-wider">
                        Slip Garment Rate
                      </span>
                      <span className="text-[10px] text-text-dim">1st word included</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setQuickByogGarmentType('small')}
                        className={`p-2 rounded-lg border text-left cursor-pointer transition ${quickByogGarmentType === 'small'
                            ? 'bg-primary/20 border-primary text-text-main ring-1 ring-primary/40'
                            : 'bg-white/[0.03] border-border-glass text-text-dim hover:text-text-main'
                          }`}
                      >
                        <div className="font-bold text-xs flex items-center justify-between">
                          <span>Small Item</span>
                          <span className="font-mono text-primary text-[11px]">₱7/letter</span>
                        </div>
                        <div className="text-[10px] text-text-dim">Cap, Hand/Face Towel, Fan</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickByogGarmentType('big')}
                        className={`p-2 rounded-lg border text-left cursor-pointer transition ${quickByogGarmentType === 'big'
                            ? 'bg-primary/20 border-primary text-text-main ring-1 ring-primary/40'
                            : 'bg-white/[0.03] border-border-glass text-text-dim hover:text-text-main'
                          }`}
                      >
                        <div className="font-bold text-xs flex items-center justify-between">
                          <span>Big Item</span>
                          <span className="font-mono text-primary text-[11px]">₱10/letter</span>
                        </div>
                        <div className="text-[10px] text-text-dim">Shirt, Polo, Jacket, Bath Towel</div>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Spacious, Un-Truncated Item Cards */}
                  <div className="grid grid-cols-2 gap-2.5 mb-3.5">
                    {displayedCatalog.map((item) => {
                      const isSelected = quickProductId === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleSelectQuickItem(item)}
                          className={`p-3 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between min-h-[62px] ${isSelected
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
                  {activeQuickItem?.isByog && (
                    <div className="mb-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-bold text-text-dim uppercase tracking-wider">
                          Slip Garment Rate
                        </span>
                        <span className="text-[10px] text-primary font-semibold">No free 1st word • All letters charged</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setQuickByogGarmentType('small')}
                          className={`p-2 rounded-lg border text-left cursor-pointer transition ${quickByogGarmentType === 'small'
                              ? 'bg-primary/20 border-primary text-text-main ring-1 ring-primary/40'
                              : 'bg-white/[0.03] border-border-glass text-text-dim hover:text-text-main'
                            }`}
                        >
                          <div className="font-bold text-xs flex items-center justify-between">
                            <span>Small Item</span>
                            <span className="font-mono text-primary text-[11px]">₱7/letter</span>
                          </div>
                          <div className="text-[10px] text-text-dim">Cap, Hand/Face Towel, Fan</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuickByogGarmentType('big')}
                          className={`p-2 rounded-lg border text-left cursor-pointer transition ${quickByogGarmentType === 'big'
                              ? 'bg-primary/20 border-primary text-text-main ring-1 ring-primary/40'
                              : 'bg-white/[0.03] border-border-glass text-text-dim hover:text-text-main'
                            }`}
                        >
                          <div className="font-bold text-xs flex items-center justify-between">
                            <span>Big Item</span>
                            <span className="font-mono text-primary text-[11px]">₱10/letter</span>
                          </div>
                          <div className="text-[10px] text-text-dim">Shirt, Polo, Jacket, Bath Towel</div>
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
              <div className="mb-3.5">
                <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                  <span className="text-[11px] font-bold text-text-dim uppercase tracking-wider">
                    2. Name(s) from Slip <span className="normal-case font-normal">(Max {MAX_CHARS_PER_LINE} chars/line)</span>
                  </span>
                  <div className="flex bg-bg-card border border-border-glass rounded-lg p-0.5 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (quickLetteringMode === 'bulk' && quickBulkSummary.namesList[0]) {
                          setQuickText(sanitizeSingleLineText(quickBulkSummary.namesList[0]).toUpperCase());
                        }
                        setQuickLetteringMode('single');
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                        quickLetteringMode === 'single'
                          ? 'bg-primary text-white shadow-sm'
                          : 'text-text-dim hover:text-text-main'
                      }`}
                    >
                      Single Name
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (quickLetteringMode === 'single' && quickText.trim() && !quickBulkText.trim()) {
                          setQuickBulkText(sanitizeSingleLineText(quickText).toUpperCase());
                        }
                        setQuickLetteringMode('bulk');
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                        quickLetteringMode === 'bulk'
                          ? 'bg-primary text-white shadow-sm'
                          : 'text-text-dim hover:text-text-main'
                      }`}
                    >
                      📋 Bulk List
                    </button>
                  </div>
                </div>

                {quickLetteringMode === 'single' ? (
                  <>
                    <div className="relative">
                      <input
                        type="text"
                        maxLength={MAX_CHARS_PER_LINE}
                        placeholder={`NAME / MONOGRAM FROM SLIP (Max ${MAX_CHARS_PER_LINE} chars)`}
                        value={quickText}
                        onPaste={(e) => {
                          const pasted = e.clipboardData.getData('text');
                          if (pasted && /\r?\n/.test(pasted.trim())) {
                            e.preventDefault();
                            setQuickBulkText(sanitizeBulkMultilineText(pasted.toUpperCase()));
                            setQuickLetteringMode('bulk');
                          }
                        }}
                        onChange={(e) => setQuickText(sanitizeSingleLineText(e.target.value.toUpperCase()))}
                        className="w-full bg-bg-surface border border-border-glass px-3.5 py-2.5 rounded-lg text-text-main text-xs font-mono font-bold tracking-wider outline-none focus:border-primary/50 pr-14"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-text-dim">
                        {quickText.length}/{MAX_CHARS_PER_LINE}
                      </span>
                    </div>
                    {quickText.trim() && (
                      <div className="mt-1.5 text-xs flex items-center justify-between px-2 py-1 rounded bg-white/5 border border-border-glass">
                        <span className="text-text-dim text-[11px]">
                          {activeQuickItem?.isByog ? (
                            quickLettering.extraCost > 0 ? (
                              <>
                                BYOG: <strong className="text-primary">{quickLettering.extraLettersCount} letters × ₱{quickLettering.ratePerLetter}</strong> ({isQuickBigGarment ? 'big garment' : 'small garment'} • every letter charged)
                              </>
                            ) : (
                              <span>BYOG: ₱{quickLettering.ratePerLetter}/letter • all letters charged</span>
                            )
                          ) : quickLettering.extraCost > 0 ? (
                            <>
                              First word included. Extra: <strong className="text-primary">+{quickLettering.extraLettersCount} letters × ₱{quickLettering.ratePerLetter}</strong>
                            </>
                          ) : (
                            <span>First word included in base price (₱0 extra)</span>
                          )}
                        </span>
                        {quickLettering.extraCost > 0 && (
                          <span className="font-mono font-bold text-primary text-xs shrink-0 ml-1">
                            +₱{quickLettering.extraCost.toFixed(2)}
                          </span>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <textarea
                      rows={3}
                      value={quickBulkText}
                      onChange={(e) => setQuickBulkText(sanitizeBulkMultilineText(e.target.value.toUpperCase()))}
                      placeholder={`Paste 1 name per line (Max ${MAX_CHARS_PER_LINE} chars/line)`}
                      className="w-full bg-bg-surface border border-border-glass px-3.5 py-2 rounded-lg text-text-main text-xs font-mono font-bold tracking-wider outline-none focus:border-primary/50 resize-y"
                    />
                    {quickBulkSummary.lineCount > 0 && (
                      <div className="text-[11px] text-text-dim flex justify-between px-2 py-1 rounded bg-white/5 border border-border-glass">
                        <span>{quickBulkSummary.lineCount} lines = {quickBulkSummary.lineCount} pcs</span>
                        <span className="font-mono font-bold text-primary">
                          {quickBulkSummary.totalExtraCost > 0 ? `+₱${quickBulkSummary.totalExtraCost.toFixed(2)} extra letters` : '₱0 extra letters'}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Step 3: Quantity & Payment */}
              <div className="grid grid-cols-2 gap-3 mb-4 items-center">
                <div className="flex flex-col gap-1 bg-white/[0.03] border border-border-glass rounded-lg p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-dim font-medium">Qty:</span>
                    {quickLetteringMode === 'bulk' && quickBulkSummary.lineCount > 0 ? (
                      <span className="px-2.5 py-1 rounded bg-primary/15 border border-primary/30 text-primary font-mono font-bold text-xs">
                        {effectiveQuickQty} pcs (Bulk)
                      </span>
                    ) : (
                      <QuantityInput
                        value={quickQuantity}
                        onChange={(q) => setQuickQuantity(q)}
                        min={1}
                        size="sm"
                        showPresets={true}
                        presets={[10, 25, 50, 100]}
                        ariaLabel="Quick sale quantity"
                      />
                    )}
                  </div>
                </div>

                <div className="flex rounded-lg border border-border-glass p-1 bg-white/[0.03]">
                  <button
                    type="button"
                    onClick={() => setQuickPayment('Cash')}
                    className={`flex-1 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${quickPayment === 'Cash' ? 'bg-primary text-white shadow-sm' : 'text-text-dim hover:text-text-main'
                      }`}
                  >
                    Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickPayment('GCash')}
                    className={`flex-1 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${quickPayment === 'GCash' ? 'bg-primary text-white shadow-sm' : 'text-text-dim hover:text-text-main'
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
                className="w-full py-3 px-4 rounded-lg bg-primary hover:bg-primary/90 active:scale-[0.99] text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span>
                  {isPunchSubmitting
                    ? 'Recording...'
                    : `Log Finished Sale — ₱${quickGrandTotal.toFixed(2)} (${quickPayment})`}
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
                  Register Cash Tin
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
                    <span className="font-mono font-bold text-primary text-xs">
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
      {/* TAB 3: CUSTOMER CLAIM & HANDOVER DESK                         */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'turnover' && (
        <div className="flex flex-col gap-4 animate-fade">
          {/* Controls Bar: Search & Status Count */}
          <div className="bg-bg-surface border border-border-glass rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
            <div className="w-full sm:w-96 relative">
              <input
                type="text"
                placeholder="🔍 Search Claim Code (#A-XXXX), Ticket #, or Customer..."
                value={turnOverSearch}
                onChange={(e) => {
                  setTurnOverSearch(e.target.value);
                  setTurnOverPage(1);
                }}
                className="w-full bg-white/[0.03] border border-border-glass focus:border-primary/60 px-3.5 py-2 rounded-lg text-text-main text-xs outline-none font-mono"
              />
              {turnOverSearch && (
                <button
                  type="button"
                  onClick={() => setTurnOverSearch('')}
                  className="absolute right-2.5 top-2 text-xs text-text-dim hover:text-text-main cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-primary font-mono text-xs font-bold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span>{readyForClaimOrders.length} Packaged Bag(s) Waiting on Side</span>
              </div>
            </div>
          </div>

          {/* Orders Cards Grid */}
          {filteredClaimOrders.length === 0 ? (
            <div className="bg-bg-surface border border-border-glass rounded-xl p-12 text-center text-xs text-text-dim flex flex-col items-center gap-2">
              <svg className="w-10 h-10 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-bold text-text-main text-sm">
                {turnOverSearch ? 'No matching order found for this search.' : 'All packaged orders have been claimed!'}
              </span>
              <span className="text-[11px] text-text-dim">
                {turnOverSearch ? 'Check the claim slip code or order number on the customer slip.' : 'No bags currently waiting on the side for pickup.'}
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {paginatedClaimOrders.map((order) => {
                const isReady = order.status === 'Ready For Pick Up' || order.status === 'Ready for Pickup';
                const isStitching = ['Preparing Order', 'In Production', 'Processing'].includes(order.status);
                const isCompleted = order.status === 'Completed' || order.status === 'Order Delivered';
                const personalization = order.personalization || {};
                const textToStitch = personalization.text || '';
                const isBusy = actionInProgressId === order.id;
                const qty = getOrderQuantity(order);
                const claimCode = getVerificationCode(order.orderId);

                return (
                  <div
                    key={order.id}
                    className={`bg-bg-card rounded-xl p-4 shadow-sm flex flex-col justify-between gap-3 border transition ${isReady
                        ? 'border-primary/40 bg-primary/[0.02]'
                        : isCompleted
                          ? 'border-border-glass opacity-70'
                          : 'border-border-glass'
                      }`}
                  >
                    <div>
                      {/* Top Row: Claim Slip Code & Status */}
                      <div className="flex justify-between items-start mb-2.5">
                        <div>
                          <div className="flex items-center gap-2">
                            {/* Big visual claim code to match the bag tag */}
                            <span className="px-2.5 py-1 rounded-md bg-primary/15 text-primary font-mono text-sm font-extrabold border border-primary/30">
                              {claimCode}
                            </span>
                            <span className="text-xs font-mono font-bold text-text-dim">
                              #{order.orderId}
                            </span>
                          </div>
                          <span className="text-xs text-text-dim block mt-1.5 font-medium">
                            Customer: <strong className="text-text-main font-bold text-sm">{order.client || 'Walk-In Customer'}</strong>
                          </span>
                        </div>

                        {/* Status Indicator */}
                        <div>
                          {isReady ? (
                            <span className="text-xs px-2.5 py-1 rounded-md font-bold border border-primary/30 bg-primary/10 text-primary flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                              <span>Bagged • Ready for Handover</span>
                            </span>
                          ) : isCompleted ? (
                            <span className="text-xs px-2.5 py-1 rounded-md font-bold border border-border-glass bg-white/5 text-text-dim">
                              ✓ Already Handed Over
                            </span>
                          ) : isStitching ? (
                            <span className="text-xs px-2.5 py-1 rounded-md font-bold border border-primary/30 bg-primary/10 text-primary-light">
                              In Workshop Stitching
                            </span>
                          ) : (
                            <span className="text-xs px-2.5 py-1 rounded-md font-bold border border-border-glass bg-bg-surface text-text-dim">
                              In Workshop Queue
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Item Details */}
                      <div className="bg-bg-surface border border-border-glass p-3 rounded-lg flex flex-col gap-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-text-dim">Item(s):</span>
                          <span className="font-semibold text-text-main text-right">{order.design || `${qty} item(s)`}</span>
                        </div>
                        {textToStitch && (
                          <div className="flex justify-between items-center bg-bg-card p-1.5 rounded-md border border-border-glass">
                            <span className="text-text-dim text-[11px]">Embroidery:</span>
                            <span className="font-bold text-primary uppercase font-mono text-xs tracking-wider">
                              "{textToStitch}"
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between pt-1 border-t border-border-glass">
                          <span className="text-text-dim">Payment Status:</span>
                          <span className="font-mono text-primary font-bold">
                            ₱{order.totalAmount?.toFixed(2)} ({order.paymentStatus === 'paid' ? 'PAID' : 'COLLECT AT COUNTER'})
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Button: Only Handover if ready, or workshop hint if in progress */}
                    <div className="pt-2 border-t border-border-glass">
                      {isReady ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setVerifyingOrderForRelease(order)}
                          className="w-full py-2.5 px-3 rounded-lg bg-primary hover:bg-primary/90 active:scale-[0.99] text-white text-xs font-bold transition shadow-sm cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          <span>{isBusy ? 'Processing...' : `Hand Over to Customer (${claimCode})`}</span>
                        </button>
                      ) : isCompleted ? (
                        <div className="text-center text-[11px] text-text-dim py-1">
                          Order was previously handed over and completed.
                        </div>
                      ) : (
                        <div className="text-center text-[11px] text-text-dim py-1 bg-bg-surface border border-border-glass rounded-md">
                          ⏳ Currently being stitched in workshop. Not yet bagged.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {filteredClaimOrders.length > turnOverPageSize && (
            <Pagination
              currentPage={turnOverPage}
              totalItems={filteredClaimOrders.length}
              pageSize={turnOverPageSize}
              onPageChange={setTurnOverPage}
              pageSizeOptions={[4, 8, 12, 24]}
              onPageSizeChange={(newSize) => {
                setTurnOverPageSize(newSize);
                setTurnOverPage(1);
              }}
              itemLabel="claim orders"
            />
          )}


          {/* ───────────────────────────────────────────────────────────── */}
          {/* ANTI-FRAUD VERIFICATION POPUP MODAL (1-TAP TURNOVER)          */}
          {/* ───────────────────────────────────────────────────────────── */}
          {verifyingOrderForRelease && isClient && createPortal(
            <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
              <div className="bg-bg-surface border border-border-glass rounded-xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4 text-left my-auto max-h-[calc(100vh-2rem)] overflow-y-auto">
                <div className="flex items-center justify-end -mb-1">
                  <button
                    type="button"
                    onClick={() => setVerifyingOrderForRelease(null)}
                    className="text-text-dim hover:text-text-main text-sm cursor-pointer p-1"
                    title="Close"
                  >
                    ✕
                  </button>
                </div>

                <div className="bg-bg-card border border-border-glass rounded-xl p-4 text-center">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-primary block mb-1">
                    Match Claim Slip Code on Bag
                  </span>
                  <div className="text-4xl font-black font-mono tracking-widest text-primary my-1">
                    {getVerificationCode(verifyingOrderForRelease.orderId)}
                  </div>
                  <span className="text-xs text-text-dim">
                    Find the packaged bag on the side matching this claim code, hand it to the customer, and confirm below.
                  </span>
                </div>

                <div className="bg-bg-surface border border-border-glass rounded-xl p-3 flex flex-col gap-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-text-dim">Order ID:</span>
                    <span className="font-mono font-bold text-text-main">#{verifyingOrderForRelease.orderId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-dim">Customer:</span>
                    <span className="font-bold text-text-main">{verifyingOrderForRelease.client}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-dim">Item Blank:</span>
                    <span className="font-semibold text-text-main">{verifyingOrderForRelease.design}</span>
                  </div>
                  {verifyingOrderForRelease.personalization?.text && (
                    <div className="flex justify-between">
                      <span className="text-text-dim">Monogram:</span>
                      <span className="font-mono font-bold text-primary">"{verifyingOrderForRelease.personalization.text}"</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-1 border-t border-border-glass">
                    <span className="text-text-dim">Payment:</span>
                    <span className="font-bold text-primary">
                      ₱{verifyingOrderForRelease.totalAmount?.toFixed(2)} (PAID IN FULL)
                    </span>
                  </div>
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setVerifyingOrderForRelease(null)}
                    className="flex-1 py-2.5 rounded-lg border border-border-glass bg-white/5 hover:bg-white/10 text-text-main text-xs font-bold transition cursor-pointer"
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
                    className="flex-2 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-white text-xs font-bold shadow-sm transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>Claim Slip Matches — Hand Over</span>
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
        </div>
      )}



      {/* ───────────────────────────────────────────────────────────── */}
      {/* THERMAL CLAIM STUB MODAL (ANTI-FRAUD PROTECTION)            */}
      {/* ───────────────────────────────────────────────────────────── */}
      {createdOrderTicket && isClient && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-bg-surface border border-border-glass rounded-2xl max-w-sm w-full p-4 shadow-2xl flex flex-col gap-3 text-left my-auto max-h-[calc(100vh-2rem)] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-border-glass">
              <span className="text-xs font-bold uppercase tracking-wider text-text-dim">
                {createdOrderTicket.isDirectSale || createdOrderTicket.status === 'Completed' ? 'Official Sales Receipt' : 'Counter Claim Slip'}
              </span>
              <button
                type="button"
                onClick={handleResetForm}
                className="text-text-dim hover:text-text-main text-xs p-1 rounded hover:bg-white/5 cursor-pointer"
                title="Close"
              >
                ✕
              </button>
            </div>
            <OfficialClaimSlip order={createdOrderTicket} showPrintAction={true} />
            <button
              type="button"
              onClick={handleResetForm}
              className="w-full py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-white text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              Next Customer &rarr;
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
