'use client';

import GlassModal from '@/components/ui/GlassModal';
import OfficialClaimSlip from '@/components/dashboard/OfficialClaimSlip';

interface ClaimStubModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any | null;
}

export default function ClaimStubModal({ isOpen, onClose, order }: ClaimStubModalProps) {
  if (!order) return null;

  const rawStatus = (order.status || '').toLowerCase();
  const isCanceled = rawStatus.includes('cancel');
  const isReadyForPickup = !isCanceled && rawStatus.includes('ready');
  const isClaimed = !isCanceled && (rawStatus === 'completed' || rawStatus === 'order delivered' || Number(order.progress) >= 100);

  const isDirectSale = order.isDirectSale || (!order.personalizationText && (!order.items || !Array.isArray(order.items) || !order.items.some((i: any) => i.personalization?.text)) && isClaimed);

  const modalTitle = isCanceled
    ? 'Store Counter Claim Slip (Voided)'
    : isDirectSale
      ? 'Official Sales Receipt'
      : isReadyForPickup
        ? 'Counter Claim Slip (Ready for Pick-up)'
        : isClaimed
          ? 'Store Counter Receipt (Claimed)'
          : 'Order Ticket & Intake Claim Slip';

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      maxWidth="max-w-[420px]"
    >
      <OfficialClaimSlip order={order} />
    </GlassModal>
  );
}
