'use client';

import { useState, useEffect } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import { useAuthStore } from '@/stores/useAuthStore';
import type { SavedAddress } from '@/lib/types';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';

interface AddressBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAddress?: (address: SavedAddress) => void;
  selectedAddressId?: string;
}

export default function AddressBookModal({
  isOpen,
  onClose,
  onSelectAddress,
  selectedAddressId
}: AddressBookModalProps) {
  const { user, setUser } = useAuthStore();
  
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'form'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form State
  const [recipientName, setRecipientName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [barangay, setBarangay] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [label, setLabel] = useState<'Home' | 'Work' | 'Other'>('Home');
  const [isDefault, setIsDefault] = useState(false);

  // Sync addresses from user store
  useEffect(() => {
    if (user?.savedAddresses && Array.isArray(user.savedAddresses)) {
      setAddresses(user.savedAddresses);
    } else if (user?.address) {
      // Create initial address entry from existing profile address
      const initial: SavedAddress = {
        id: 'addr_default_1',
        recipientName: user.username || 'Customer',
        phoneNumber: user.phoneNumber || '',
        streetAddress: user.address,
        fullAddress: user.address,
        label: 'Home',
        isDefault: true,
      };
      setAddresses([initial]);
    } else {
      setAddresses([]);
    }
  }, [user, isOpen]);

  const resetForm = () => {
    setRecipientName(user?.username || '');
    setPhoneNumber(user?.phoneNumber || '');
    setStreetAddress('');
    setCity('');
    setProvince('');
    setBarangay('');
    setPostalCode('');
    setLabel('Home');
    setIsDefault(addresses.length === 0);
    setEditingId(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setViewMode('form');
  };

  const handleOpenEdit = (addr: SavedAddress) => {
    setEditingId(addr.id);
    setRecipientName(addr.recipientName || user?.username || '');
    setPhoneNumber(addr.phoneNumber || user?.phoneNumber || '');
    setStreetAddress(addr.streetAddress || '');
    setCity(addr.city || '');
    setProvince(addr.province || '');
    setBarangay(addr.barangay || '');
    setPostalCode(addr.postalCode || '');
    setLabel(addr.label || 'Home');
    setIsDefault(!!addr.isDefault);
    setViewMode('form');
  };

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!recipientName.trim()) {
      showToast('Recipient name is required', 'error');
      return;
    }
    if (!phoneNumber.trim()) {
      showToast('Phone number is required for delivery couriers', 'error');
      return;
    }
    if (!streetAddress.trim()) {
      showToast('Street address / Unit / House No. is required', 'error');
      return;
    }

    setIsSaving(true);

    try {
      // Build full address string (Philippine format)
      const parts = [
        streetAddress.trim(),
        barangay.trim() ? `Brgy. ${barangay.trim()}` : '',
        city.trim(),
        province.trim(),
        postalCode.trim()
      ].filter(Boolean);
      const computedFullAddress = parts.join(', ');

      let updatedList: SavedAddress[] = [];

      if (editingId) {
        // Edit existing
        updatedList = addresses.map((addr) => {
          if (addr.id === editingId) {
            return {
              ...addr,
              recipientName: recipientName.trim(),
              phoneNumber: phoneNumber.trim(),
              streetAddress: streetAddress.trim(),
              barangay: barangay.trim(),
              city: city.trim(),
              province: province.trim(),
              postalCode: postalCode.trim(),
              fullAddress: computedFullAddress,
              label,
              isDefault: isDefault || addresses.length === 1,
            };
          }
          return isDefault ? { ...addr, isDefault: false } : addr;
        });
      } else {
        // Add new address
        const newAddress: SavedAddress = {
          id: `addr_${Date.now()}`,
          recipientName: recipientName.trim(),
          phoneNumber: phoneNumber.trim(),
          streetAddress: streetAddress.trim(),
          barangay: barangay.trim(),
          city: city.trim(),
          province: province.trim(),
          postalCode: postalCode.trim(),
          fullAddress: computedFullAddress,
          label,
          isDefault: isDefault || addresses.length === 0,
        };

        if (newAddress.isDefault) {
          updatedList = addresses.map((a) => ({ ...a, isDefault: false }));
          updatedList.unshift(newAddress);
        } else {
          updatedList = [...addresses, newAddress];
        }
      }

      // Identify default address for legacy field synchronization
      const primary = updatedList.find((a) => a.isDefault) || updatedList[0];

      // Save to backend
      const res = await api.patch<{ message: string; user: any }>('/api/customer/settings', {
        savedAddresses: updatedList,
        ...(primary ? { address: primary.fullAddress, phoneNumber: primary.phoneNumber } : {})
      });

      if (user) {
        setUser({
          ...user,
          savedAddresses: updatedList,
          ...(primary ? { address: primary.fullAddress, phoneNumber: primary.phoneNumber } : {})
        });
      }

      setAddresses(updatedList);
      showToast(editingId ? 'Address updated successfully!' : 'New address added to your address book!', 'success');
      setViewMode('list');
      setEditingId(null);

      // If called from checkout and we just added/edited, auto-select it
      if (onSelectAddress && primary) {
        onSelectAddress(editingId ? updatedList.find(a => a.id === editingId) || primary : primary);
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to save address', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetDefault = async (addrId: string) => {
    const updated = addresses.map((a) => ({
      ...a,
      isDefault: a.id === addrId
    }));
    const primary = updated.find((a) => a.id === addrId);

    try {
      await api.patch('/api/customer/settings', {
        savedAddresses: updated,
        ...(primary ? { address: primary.fullAddress, phoneNumber: primary.phoneNumber } : {})
      });

      if (user) {
        setUser({
          ...user,
          savedAddresses: updated,
          ...(primary ? { address: primary.fullAddress, phoneNumber: primary.phoneNumber } : {})
        });
      }
      setAddresses(updated);
      showToast(`Set "${primary?.recipientName}" as default address`, 'success');
    } catch {
      showToast('Failed to set default address', 'error');
    }
  };

  const handleDeleteAddress = async (addrId: string) => {
    if (addresses.length <= 1) {
      showToast('You must keep at least one delivery address.', 'error');
      return;
    }

    if (!confirm('Are you sure you want to remove this delivery address?')) return;

    const filtered = addresses.filter((a) => a.id !== addrId);
    // If deleted was default, make the first one default
    if (!filtered.some((a) => a.isDefault) && filtered.length > 0) {
      filtered[0].isDefault = true;
    }
    const primary = filtered.find((a) => a.isDefault) || filtered[0];

    try {
      await api.patch('/api/customer/settings', {
        savedAddresses: filtered,
        ...(primary ? { address: primary.fullAddress, phoneNumber: primary.phoneNumber } : {})
      });

      if (user) {
        setUser({
          ...user,
          savedAddresses: filtered,
          ...(primary ? { address: primary.fullAddress, phoneNumber: primary.phoneNumber } : {})
        });
      }
      setAddresses(filtered);
      showToast('Address removed', 'info');
    } catch {
      showToast('Failed to delete address', 'error');
    }
  };

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={() => {
        setViewMode('list');
        onClose();
      }}
      title={viewMode === 'list' ? 'My Delivery Addresses' : editingId ? 'Edit Address' : 'Add New Address'}
      maxWidth="max-w-[560px]"
    >
      <div className="flex flex-col gap-4 text-text-main max-h-[75vh] overflow-y-auto pr-1">
        {viewMode === 'list' ? (
          <>
            {/* Top Action Bar */}
            <div className="flex justify-between items-center bg-bg-surface/80 p-3.5 rounded-2xl border border-border-glass">
              <div>
                <p className="text-xs text-text-dim m-0">Shopee-Style Fast Courier Addressing</p>
                <p className="text-sm font-bold m-0 text-text-main">
                  {addresses.length} {addresses.length === 1 ? 'Saved Location' : 'Saved Locations'}
                </p>
              </div>
              <button
                onClick={handleOpenAdd}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-white font-bold text-xs hover:bg-primary/90 transition-all shadow-sm cursor-pointer border-none"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Add Address</span>
              </button>
            </div>

            {/* Address List */}
            {addresses.length === 0 ? (
              <div className="border-2 border-dashed border-border-glass rounded-2xl p-8 flex flex-col items-center justify-center text-center text-text-dim">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2 opacity-50">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <p className="font-bold text-sm text-text-main m-0">No addresses saved yet</p>
                <p className="text-xs mt-1 max-w-[280px]">Add your home, office, or branch location for 1-click checkout delivery.</p>
                <button
                  onClick={handleOpenAdd}
                  className="mt-3 px-4 py-2 rounded-xl bg-primary text-white font-bold text-xs hover:bg-primary/90 transition-all cursor-pointer border-none"
                >
                  + Add First Address
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {addresses.map((addr) => {
                  const isSelected = selectedAddressId === addr.id;

                  return (
                    <div
                      key={addr.id}
                      className={`
                        p-4 rounded-2xl border transition-all duration-200 flex flex-col gap-2.5 relative
                        ${isSelected
                          ? 'border-primary bg-primary/10 shadow-sm'
                          : addr.isDefault
                            ? 'border-primary/40 bg-bg-surface/90'
                            : 'border-border-glass bg-bg-surface/50 hover:bg-bg-surface'}
                      `}
                    >
                      {/* Card Header: Recipient, Phone & Tags */}
                      <div className="flex justify-between items-start flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-[0.95rem] text-text-main">{addr.recipientName}</span>
                          <span className="text-xs text-text-dim">| {addr.phoneNumber}</span>
                          
                          {/* Label tag */}
                          <span className="px-2 py-0.5 rounded-md text-[0.65rem] font-bold uppercase tracking-wider bg-white/10 text-text-dim border border-border-glass">
                            {addr.label || 'Home'}
                          </span>

                          {/* Default tag */}
                          {addr.isDefault && (
                            <span className="px-2 py-0.5 rounded-md text-[0.65rem] font-bold uppercase tracking-wider bg-primary/20 text-primary border border-primary/30">
                              Default
                            </span>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenEdit(addr)}
                            className="text-xs text-text-dim hover:text-primary transition-colors cursor-pointer bg-transparent border-none p-1"
                            title="Edit Address"
                          >
                            Edit
                          </button>
                          {addresses.length > 1 && (
                            <button
                              onClick={() => handleDeleteAddress(addr.id)}
                              className="text-xs text-text-dim hover:text-danger transition-colors cursor-pointer bg-transparent border-none p-1"
                              title="Delete Address"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Full Address */}
                      <p className="text-xs text-text-dim leading-relaxed m-0">
                        {addr.fullAddress || addr.streetAddress}
                      </p>

                      {/* Bottom Options */}
                      <div className="flex justify-between items-center pt-2 border-t border-border-glass/40 mt-1">
                        {!addr.isDefault ? (
                          <button
                            onClick={() => handleSetDefault(addr.id)}
                            className="text-[0.75rem] text-text-dim hover:text-text-main hover:underline bg-transparent border-none p-0 cursor-pointer"
                          >
                            Set as Default
                          </button>
                        ) : (
                          <span className="text-[0.7rem] text-primary font-medium">Primary Shipping Address</span>
                        )}

                        {onSelectAddress && (
                          <button
                            onClick={() => {
                              onSelectAddress(addr);
                              onClose();
                            }}
                            className={`
                              px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer border-none transition-all
                              ${isSelected
                                ? 'bg-primary text-white shadow-sm'
                                : 'bg-primary/15 text-primary hover:bg-primary hover:text-white'}
                            `}
                          >
                            {isSelected ? '✓ Selected' : 'Deliver Here'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          /* Add / Edit Form */
          <form onSubmit={handleSaveAddress} className="flex flex-col gap-3.5">
            <div className="grid grid-cols-2 gap-3 max-[500px]:grid-cols-1">
              <div>
                <label className="block text-[0.75rem] font-bold text-text-dim uppercase tracking-wider mb-1">
                  Recipient Name <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Juan Dela Cruz"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="w-full bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-xs outline-none focus:border-primary transition-all"
                />
              </div>

              <div>
                <label className="block text-[0.75rem] font-bold text-text-dim uppercase tracking-wider mb-1">
                  Contact Phone Number <span className="text-danger">*</span>
                </label>
                <input
                  type="tel"
                  required
                  placeholder="0917 123 4567"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-xs outline-none focus:border-primary transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 max-[500px]:grid-cols-1">
              <div>
                <label className="block text-[0.75rem] font-bold text-text-dim uppercase tracking-wider mb-1">
                  City / Municipality
                </label>
                <input
                  type="text"
                  placeholder="e.g. Quezon City / Manila"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-xs outline-none focus:border-primary transition-all"
                />
              </div>

              <div>
                <label className="block text-[0.75rem] font-bold text-text-dim uppercase tracking-wider mb-1">
                  Barangay
                </label>
                <input
                  type="text"
                  placeholder="e.g. Brgy. Commonwealth"
                  value={barangay}
                  onChange={(e) => setBarangay(e.target.value)}
                  className="w-full bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-xs outline-none focus:border-primary transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 max-[500px]:grid-cols-1">
              <div>
                <label className="block text-[0.75rem] font-bold text-text-dim uppercase tracking-wider mb-1">
                  Province / Region
                </label>
                <input
                  type="text"
                  placeholder="e.g. Metro Manila / Rizal"
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  className="w-full bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-xs outline-none focus:border-primary transition-all"
                />
              </div>

              <div>
                <label className="block text-[0.75rem] font-bold text-text-dim uppercase tracking-wider mb-1">
                  Postal Code
                </label>
                <input
                  type="text"
                  placeholder="e.g. 1121"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  className="w-full bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-xs outline-none focus:border-primary transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-[0.75rem] font-bold text-text-dim uppercase tracking-wider mb-1">
                Detailed Address (House No., Building, Street Name) <span className="text-danger">*</span>
              </label>
              <textarea
                required
                rows={2}
                placeholder="e.g. Unit 4B, Sunrise Heights Condominium, 14 Katipunan Avenue"
                value={streetAddress}
                onChange={(e) => setStreetAddress(e.target.value)}
                className="w-full bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-xs outline-none focus:border-primary resize-none transition-all"
              />
            </div>

            {/* Label Selector: Home vs Work vs Other */}
            <div>
              <label className="block text-[0.75rem] font-bold text-text-dim uppercase tracking-wider mb-1.5">
                Address Label
              </label>
              <div className="flex gap-2">
                {(['Home', 'Work', 'Other'] as const).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setLabel(tag)}
                    className={`
                      px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer border flex items-center gap-2
                      ${label === tag
                        ? 'bg-primary text-white border-primary shadow-sm'
                        : 'bg-bg-surface text-text-dim border-border-glass hover:bg-white/5'}
                    `}
                  >
                    {tag === 'Home' && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                        <polyline points="9 22 9 12 15 12 15 22"/>
                      </svg>
                    )}
                    {tag === 'Work' && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
                        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
                      </svg>
                    )}
                    {tag === 'Other' && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                        <circle cx="12" cy="10" r="3"/>
                      </svg>
                    )}
                    <span>{tag}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Default Address Checkbox */}
            <label className="flex items-center gap-2.5 cursor-pointer mt-1">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer accent-primary"
              />
              <span className="text-xs font-medium text-text-main">
                Set as my default shipping address
              </span>
            </label>

            {/* Buttons */}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border-glass">
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white font-bold text-xs hover:bg-primary/90 transition-all cursor-pointer border-none shadow-sm disabled:opacity-50"
              >
                {isSaving ? 'Saving Address...' : editingId ? 'Update Address' : 'Save Address'}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                disabled={isSaving}
                className="px-4 py-2.5 rounded-xl bg-transparent border border-border-glass text-text-dim font-bold text-xs hover:bg-white/5 transition-all cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </GlassModal>
  );
}
