'use client';

import InvoiceModal from './InvoiceModal';

interface ReceiptModalProps {
  transactionId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function ReceiptModal({ transactionId, isOpen, onClose }: ReceiptModalProps) {
  return (
    <InvoiceModal
      isOpen={isOpen}
      onClose={onClose}
      transactionId={transactionId}
    />
  );
}
