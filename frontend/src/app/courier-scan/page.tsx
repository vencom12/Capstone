'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import Link from 'next/link';

function CourierScanContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialOrderId = searchParams.get('orderId') || '';

  const [orderIdInput, setOrderIdInput] = useState(initialOrderId);
  const [order, setOrder] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [courierName, setCourierName] = useState('Mark Anthony R.');
  const [vehicle, setVehicle] = useState('Honda Click 125 (Plate: 429-QZ)');
  const [courierPhone, setCourierPhone] = useState('0917 882 1490');

  const fetchOrder = async (id: string) => {
    if (!id.trim()) return;
    setIsLoading(true);
    try {
      const data = await api.get<any>('/api/customer/dashboard-state');
      if (data && data.orders) {
        const found = data.orders.find(
          (o: any) => o.orderId.toLowerCase() === id.trim().toLowerCase() || o.id === id.trim()
        );
        if (found) {
          setOrder(found);
          setOrderIdInput(found.orderId);
        } else {
          setOrder(null);
          showToast(`Order "${id}" not found in database`, 'error');
        }
      }
    } catch (err) {
      showToast('Failed to fetch order information', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialOrderId) {
      fetchOrder(initialOrderId);
    }
  }, [initialOrderId]);

  // Action 1: Courier scans package at hub to pick up and start delivery
  const handleConfirmPickup = async () => {
    if (!order) return;
    setIsUpdating(true);
    try {
      const payload = {
        status: 'Out for Delivery',
        progress: 80,
        courierName,
        courierVehicle: vehicle,
        courierPhone,
        lat: 13.9350,
        lng: 121.6160
      };

      // Update backend
      await api.patch(`/api/orders/${order.orderId}/location`, payload).catch(() => {});

      // Synchronize locally for instant customer view update
      localStorage.setItem(
        `stitch-rider-gps-${order.orderId}`,
        JSON.stringify({
          orderId: order.orderId,
          lat: 13.9350,
          lng: 121.6160,
          speed: 30,
          timestamp: new Date().toISOString(),
          courierName,
          vehicle,
          phone: courierPhone,
          status: 'Out for Delivery'
        })
      );
      window.dispatchEvent(new Event('storage'));

      setOrder({ ...order, status: 'Out for Delivery', progress: 80 });
      showToast(`Package #${order.orderId} is now OUT FOR DELIVERY!`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to update delivery status', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  // Action 2: Courier confirms delivery at customer doorstep
  const handleConfirmDelivered = async () => {
    if (!order) return;
    if (!confirm(`Confirm successful delivery and handover for order #${order.orderId}?`)) return;

    setIsUpdating(true);
    try {
      const payload = {
        status: 'Completed',
        progress: 100
      };

      await api.patch(`/api/orders/${order.orderId}/location`, payload).catch(() => {});

      localStorage.removeItem(`stitch-rider-gps-${order.orderId}`);
      window.dispatchEvent(new Event('storage'));

      setOrder({ ...order, status: 'Completed', progress: 100 });
      showToast(`Order #${order.orderId} marked as DELIVERED & COMPLETED!`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to complete order', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-white flex flex-col p-4 max-w-md mx-auto font-sans">
      {/* Top Header */}
      <div className="flex justify-between items-center pb-3 border-b border-white/10 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center font-bold text-sm shadow-sm">
            📦
          </div>
          <div>
            <h1 className="text-sm font-extrabold m-0 leading-tight">Courier Scanner Terminal</h1>
            <p className="text-[0.7rem] text-white/50 m-0">Logistics Barcode & Waybill Verification</p>
          </div>
        </div>

        <Link
          href="/dashboard"
          className="text-xs text-primary font-bold px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 no-underline hover:bg-white/10 transition-all"
        >
          Customer Portal ↗
        </Link>
      </div>

      {/* Manual / Scan Input Bar */}
      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-3 flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Scan or enter Order ID (e.g. ORD-F29AD4DA)..."
          value={orderIdInput}
          onChange={(e) => setOrderIdInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') fetchOrder(orderIdInput);
          }}
          className="flex-1 bg-black/40 border border-white/10 px-3 py-2 rounded-xl text-xs text-white outline-none focus:border-primary font-mono"
        />
        <button
          onClick={() => fetchOrder(orderIdInput)}
          disabled={isLoading || !orderIdInput.trim()}
          className="px-4 py-2 rounded-xl bg-primary text-white font-bold text-xs border-none cursor-pointer hover:bg-primary/90 transition-all disabled:opacity-50"
        >
          {isLoading ? 'Searching...' : 'Scan'}
        </button>
      </div>

      {/* Order Scanned Details */}
      {order ? (
        <div className="flex flex-col gap-4">
          {/* Status Banner */}
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[0.68rem] uppercase font-bold text-white/40 tracking-wider">
                  Waybill Package
                </span>
                <h2 className="text-base font-extrabold text-primary m-0 mt-0.5 font-mono">
                  {order.orderId}
                </h2>
                <p className="text-xs text-white/60 m-0 mt-0.5">
                  Placed {new Date(order.date).toLocaleDateString()} • {order.paymentMethod?.toUpperCase()}
                </p>
              </div>

              <span
                className={`px-3 py-1 rounded-full text-[0.7rem] font-bold uppercase tracking-wider ${
                  order.status === 'Completed'
                    ? 'bg-success/20 text-success border border-success/30'
                    : order.status === 'Out for Delivery'
                      ? 'bg-secondary/20 text-secondary border border-secondary/30'
                      : 'bg-amber-500/20 text-amber-500 border border-amber-500/30'
                }`}
              >
                {order.status}
              </span>
            </div>

            {/* Recipient Details */}
            <div className="bg-black/30 rounded-xl p-3 flex flex-col gap-2 text-xs">
              <div>
                <span className="text-white/40 block text-[0.68rem] font-semibold uppercase">
                  Recipient Name
                </span>
                <span className="font-bold text-white">{order.client || 'Customer Recipient'}</span>
              </div>

              <div>
                <span className="text-white/40 block text-[0.68rem] font-semibold uppercase">
                  Delivery Destination
                </span>
                <span className="text-white/90 leading-relaxed block">
                  {order.address || 'Purok Matahimik, Lucena City, Quezon'}
                </span>
              </div>

              {order.notes && (
                <div className="pt-1 border-t border-white/10">
                  <span className="text-white/40 block text-[0.68rem] font-semibold uppercase">
                    Landmark / Notes
                  </span>
                  <span className="text-secondary italic">"{order.notes}"</span>
                </div>
              )}

              {/* Action Buttons for Rider */}
              <div className="flex gap-2 pt-2 border-t border-white/10">
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                    order.address || 'Lucena City, Quezon'
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-center py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs no-underline transition-all"
                >
                  📍 Open Route in Google Maps
                </a>
                <a
                  href="tel:09171234567"
                  className="px-3.5 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs no-underline transition-all flex items-center justify-center"
                  title="Call Recipient"
                >
                  📞 Call
                </a>
              </div>
            </div>
          </div>

          {/* Courier Identity */}
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 flex flex-col gap-2.5 text-xs">
            <span className="text-[0.68rem] uppercase font-bold text-white/40 tracking-wider">
              Assigned Delivery Service Provider
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[0.65rem] text-white/50 block mb-0.5">Rider Name</label>
                <input
                  type="text"
                  value={courierName}
                  onChange={(e) => setCourierName(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 px-2.5 py-1.5 rounded-lg text-white text-xs outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-[0.65rem] text-white/50 block mb-0.5">Vehicle / Plate No.</label>
                <input
                  type="text"
                  value={vehicle}
                  onChange={(e) => setVehicle(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 px-2.5 py-1.5 rounded-lg text-white text-xs outline-none focus:border-primary"
                />
              </div>
            </div>
          </div>

          {/* Logistics Status Update Buttons */}
          <div className="flex flex-col gap-2.5 mt-2">
            {order.status !== 'Out for Delivery' && order.status !== 'Completed' && (
              <button
                onClick={handleConfirmPickup}
                disabled={isUpdating}
                className="w-full py-3.5 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-sm border-none cursor-pointer shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <span>📦 Scan Pickup → Mark Out for Delivery</span>
              </button>
            )}

            {order.status === 'Out for Delivery' && (
              <button
                onClick={handleConfirmDelivered}
                disabled={isUpdating}
                className="w-full py-3.5 rounded-xl bg-success hover:bg-success/90 text-white font-bold text-sm border-none cursor-pointer shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <span>✓ Confirm Drop-off → Mark Delivered & Signed</span>
              </button>
            )}

            {order.status === 'Completed' && (
              <div className="p-3 rounded-xl bg-success/10 border border-success/30 text-success text-center font-bold text-xs">
                ✓ This parcel was delivered and verified.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="border-2 border-dashed border-white/10 rounded-2xl p-8 flex flex-col items-center justify-center text-center text-white/40 my-auto">
          <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-2xl mb-2">
            📷
          </div>
          <p className="font-bold text-sm text-white/80 m-0">Awaiting Package Barcode / QR Scan</p>
          <p className="text-xs text-white/40 mt-1 max-w-[260px]">
            Scan the QR code printed on the parcel shipping waybill, or enter the order ID above.
          </p>
        </div>
      )}
    </div>
  );
}

export default function CourierScanPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0d1117] text-white flex items-center justify-center text-xs">
          Loading Scanner Terminal...
        </div>
      }
    >
      <CourierScanContent />
    </Suspense>
  );
}
