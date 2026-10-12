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

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title="Store Counter Claim Slip"
      maxWidth="max-w-[420px]"
    >
      <OfficialClaimSlip order={order} />
    </GlassModal>
  );
}
