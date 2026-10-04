'use client';

import { useState, useEffect } from 'react';
import { api, apiFetch } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';

interface PanelSettingsProps {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  giftPrice: number;
  setGiftPrice: (price: number) => void;
  handleUpdateGiftPrice: () => Promise<void>;
  isUpdatingSettings: boolean;
}

type SettingsTab = 'store' | 'fulfillment' | 'ai' | 'appearance';

export default function PanelSettings({
  theme,
  toggleTheme,
  giftPrice,
  setGiftPrice,
  handleUpdateGiftPrice,
  isUpdatingSettings: isGiftLoading
}: PanelSettingsProps) {
  // Active Navigation Tab
  const [activeTab, setActiveTab] = useState<SettingsTab>('store');

  // AI Settings State
  const [aiChatModel, setAiChatModel] = useState('llama-3.3-70b-versatile');
  const [aiVisionModel, setAiVisionModel] = useState('llama-3.2-11b-vision-preview');
  const [aiProviderUrl, setAiProviderUrl] = useState('https://api.groq.com/openai/v1/chat/completions');
  const [minConfidenceScore, setMinConfidenceScore] = useState(75); // displayed as percentage (0-100)
  
  // Business Profile Settings State
  const [businessName, setBusinessName] = useState('STITCH-OPT DESIGNS');
  const [receiptTagline, setReceiptTagline] = useState('Premium Embroidery Services');
  const [businessAddress, setBusinessAddress] = useState('123 Digital Thread Lane, Manila');
  const [businessContact, setBusinessContact] = useState('+63 (02) 888-THREAD');
  const [businessEmail, setBusinessEmail] = useState('contact@stitch-opt.com');
  const [businessWebsite, setBusinessWebsite] = useState('www.stitch-opt.com');
  const [businessLogoUrl, setBusinessLogoUrl] = useState('');
  const [gcashQrCodeUrl, setGcashQrCodeUrl] = useState('');
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);
  const [isUpdatingDelivery, setIsUpdatingDelivery] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingBiz, setIsSavingBiz] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingQr, setIsUploadingQr] = useState(false);

  // Suggested Model Options
  const chatModelSuggestions = [
    { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile (Recommended)' },
    { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant (Ultra-Fast)' },
    { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B (High Context)' }
  ];

  const visionModelSuggestions = [
    { value: 'qwen/qwen3.8-27b', label: 'Qwen 3.8 27B Vision (Recommended • Active)' },
    { value: 'qwen/qwen3.6-27b', label: 'Qwen 3.6 27B Vision' }
  ];

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const res = await api.get<any>('/api/admin/settings');
      if (res) {
        if (res.aiChatModel) setAiChatModel(res.aiChatModel);
        if (res.aiVisionModel) setAiVisionModel(res.aiVisionModel);
        if (res.aiProviderUrl) setAiProviderUrl(res.aiProviderUrl);
        if (res.minConfidenceScore !== undefined) {
          setMinConfidenceScore(Math.round(res.minConfidenceScore * 100));
        }
        if (res.businessName) setBusinessName(res.businessName);
        if (res.receiptTagline) setReceiptTagline(res.receiptTagline);
        if (res.businessAddress) setBusinessAddress(res.businessAddress);
        if (res.businessContact) setBusinessContact(res.businessContact);
        if (res.businessEmail) setBusinessEmail(res.businessEmail);
        if (res.businessWebsite) setBusinessWebsite(res.businessWebsite);
        if (res.businessLogoUrl) setBusinessLogoUrl(res.businessLogoUrl);
        if (res.gcashQrCodeUrl) setGcashQrCodeUrl(res.gcashQrCodeUrl);
        if (res.deliveryEnabled !== undefined) setDeliveryEnabled(res.deliveryEnabled);
      }
    } catch (e) {
      console.error('[Settings] Failed to fetch settings:', e);
      showToast('Failed to load system settings from backend', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSaveAISettings = async () => {
    setIsSaving(true);
    try {
      await api.put('/api/admin/settings', {
        aiChatModel: aiChatModel.trim(),
        aiVisionModel: aiVisionModel.trim(),
        aiProviderUrl: aiProviderUrl.trim(),
        minConfidenceScore: parseFloat((minConfidenceScore / 100).toFixed(2))
      });
      showToast('AI settings saved successfully!', 'success');
    } catch (e: any) {
      console.error(e);
      showToast(e.message || 'Failed to save AI configuration', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetAISettings = () => {
    setAiChatModel('llama-3.3-70b-versatile');
    setAiVisionModel('llama-3.2-11b-vision-preview');
    setAiProviderUrl('https://api.groq.com/openai/v1/chat/completions');
    setMinConfidenceScore(75);
    setPingResult(null);
    showToast('AI settings reset to defaults. Remember to click Save.', 'info');
  };

  const handleSaveBizSettings = async () => {
    setIsSavingBiz(true);
    try {
      await api.put('/api/admin/settings', {
        businessName: businessName.trim(),
        receiptTagline: receiptTagline.trim(),
        businessAddress: businessAddress.trim(),
        businessContact: businessContact.trim(),
        businessEmail: businessEmail.trim(),
        businessWebsite: businessWebsite.trim(),
        businessLogoUrl: businessLogoUrl || null
      });
      showToast('Store profile updated successfully!', 'success');
    } catch (e: any) {
      console.error(e);
      showToast(e.message || 'Failed to save store profile', 'error');
    } finally {
      setIsSavingBiz(false);
    }
  };

  const handleToggleDelivery = async (enabled: boolean) => {
    setIsUpdatingDelivery(true);
    try {
      await api.put('/api/admin/settings', {
        deliveryEnabled: enabled
      });
      setDeliveryEnabled(enabled);
      showToast(
        enabled 
          ? 'Courier delivery enabled. Customers can now choose delivery or store pickup.' 
          : 'Store pickup only is now active. Courier delivery is disabled.',
        'success'
      );
    } catch (e: any) {
      console.error(e);
      showToast(e.message || 'Failed to update delivery settings', 'error');
    } finally {
      setIsUpdatingDelivery(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingLogo(true);
    const formData = new FormData();
    formData.append('logo', file);

    try {
      const res = await apiFetch<any>('/api/admin/settings/logo', {
        method: 'POST',
        body: formData,
      });
      if (res && res.businessLogoUrl) {
        setBusinessLogoUrl(res.businessLogoUrl);
        showToast('Store logo uploaded successfully!', 'success');
      }
    } catch (error: any) {
      console.error(error);
      showToast(error.message || 'Failed to upload logo', 'error');
    } finally {
      setIsUploadingLogo(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingQr(true);
    const formData = new FormData();
    formData.append('qr', file);

    try {
      const res = await apiFetch<any>('/api/admin/settings/gcash-qr', {
        method: 'POST',
        body: formData,
      });
      if (res && res.gcashQrCodeUrl) {
        setGcashQrCodeUrl(res.gcashQrCodeUrl);
        showToast('GCash QR uploaded successfully!', 'success');
      }
    } catch (error: any) {
      console.error(error);
      showToast(error.message || 'Failed to upload GCash QR', 'error');
    } finally {
      setIsUploadingQr(false);
      if (e.target) e.target.value = '';
    }
  };

  const [isTestingPing, setIsTestingPing] = useState(false);
  const [pingResult, setPingResult] = useState<{
    success: boolean;
    message: string;
    reply?: string;
    latency?: number;
  } | null>(null);

  const handleTestConnection = async () => {
    setIsTestingPing(true);
    setPingResult(null);
    const startTime = performance.now();
    try {
      const res = await api.post<any>('/api/admin/settings/test-ai', {
        aiChatModel: aiChatModel.trim(),
        aiProviderUrl: aiProviderUrl.trim()
      });
      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);
      
      if (res && res.success) {
        setPingResult({
          success: true,
          message: res.message || 'AI service connected and responding properly.',
          reply: res.reply,
          latency
        });
        showToast('AI connection test passed!', 'success');
      } else {
        setPingResult({
          success: false,
          message: res?.message || 'Connection test failed.',
          latency
        });
        showToast(res?.message || 'Connection test failed', 'error');
      }
    } catch (e: any) {
      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);
      console.error(e);
      setPingResult({
        success: false,
        message: e.message || 'Network request failed or was rejected by backend.',
        latency
      });
      showToast(e.message || 'Unable to reach AI service', 'error');
    } finally {
      setIsTestingPing(false);
    }
  };

  const navigationTabs = [
    {
      id: 'store' as SettingsTab,
      label: 'Store & Branding',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      )
    },
    {
      id: 'fulfillment' as SettingsTab,
      label: 'Fulfillment & Pricing',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="3" width="15" height="13" />
          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
          <circle cx="5.5" cy="18.5" r="2.5" />
          <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
      )
    },
    {
      id: 'ai' as SettingsTab,
      label: 'AI & Automation',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <rect x="9" y="9" width="6" height="6" />
          <line x1="9" y1="1" x2="9" y2="4" />
          <line x1="15" y1="1" x2="15" y2="4" />
          <line x1="9" y1="20" x2="9" y2="23" />
          <line x1="15" y1="20" x2="15" y2="23" />
          <line x1="20" y1="9" x2="23" y2="9" />
          <line x1="20" y1="14" x2="23" y2="14" />
          <line x1="1" y1="9" x2="4" y2="9" />
          <line x1="1" y1="14" x2="4" y2="14" />
        </svg>
      )
    },
    {
      id: 'appearance' as SettingsTab,
      label: 'Theme & Appearance',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5"/>
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        </svg>
      )
    }
  ];

  return (
    <section className="animate-[fadeIn_0.3s_ease-out] flex flex-col min-h-full text-left font-sans max-w-[1020px] w-full pb-12">
      {/* Top Header */}
      <header className="mb-6 flex flex-col">
        <h1 className="text-3xl font-extrabold mb-1 tracking-tight text-text-main">Settings &amp; Configuration</h1>
        <p className="text-text-dim text-sm m-0">
          Manage your store branding, shipping channels, AI models, and dashboard appearance.
        </p>
      </header>

      {/* Sub-Tab Navigation Bar */}
      <div className="flex items-center gap-2 p-1.5 bg-white/5 border border-border-glass rounded-2xl mb-6 overflow-x-auto scrollbar-none">
        {navigationTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm transition-all whitespace-nowrap cursor-pointer border ${
                isActive
                  ? 'bg-primary text-white border-primary shadow-sm shadow-primary/20'
                  : 'bg-transparent text-text-dim border-transparent hover:text-text-main hover:bg-white/5'
              }`}
            >
              <span className={`flex items-center justify-center ${isActive ? 'text-white' : 'text-text-dim'}`}>
                {tab.icon}
              </span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="py-24 text-center text-text-dim flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          <span className="text-sm">Loading settings...</span>
        </div>
      ) : (
        <div className="flex flex-col gap-6">

          {/* ========================================================================= */}
          {/* TAB 1: STORE & BRANDING                                                  */}
          {/* ========================================================================= */}
          {activeTab === 'store' && (
            <div className="glass-card p-6 md:p-8 border border-border-glass rounded-[24px] flex flex-col animate-[fadeIn_0.2s_ease-out]">
              <div className="flex items-center gap-3 mb-2 pb-4 border-b border-border-glass">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                    <polyline points="9 22 9 12 15 12 15 22"/>
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold m-0 text-text-main">Store Profile &amp; Receipts</h3>
                  <p className="text-xs text-text-dim m-0 mt-0.5">
                    Details printed on invoices, receipts, and shown during customer checkout.
                  </p>
                </div>
              </div>

              {/* Form Input Rows */}
              <div className="flex flex-col gap-4 mt-4">
                {/* Row 1: Name & Tagline */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col bg-white/5 border border-border-glass p-4 rounded-xl gap-2">
                    <label className="font-bold text-xs text-text-main flex items-center justify-between">
                      <span>Business Name</span>
                      <span className="text-[11px] text-text-dim font-normal">Header on receipts</span>
                    </label>
                    <input
                      type="text"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className="bg-bg-surface border border-border-glass rounded-lg py-2 px-3 text-text-main text-sm outline-none focus:border-primary transition-all font-sans"
                      placeholder="e.g. STITCH-OPT DESIGNS"
                    />
                  </div>

                  <div className="flex flex-col bg-white/5 border border-border-glass p-4 rounded-xl gap-2">
                    <label className="font-bold text-xs text-text-main flex items-center justify-between">
                      <span>Store Tagline</span>
                      <span className="text-[11px] text-text-dim font-normal">Subtitle on receipts</span>
                    </label>
                    <input
                      type="text"
                      value={receiptTagline}
                      onChange={(e) => setReceiptTagline(e.target.value)}
                      className="bg-bg-surface border border-border-glass rounded-lg py-2 px-3 text-text-main text-sm outline-none focus:border-primary transition-all font-sans"
                      placeholder="e.g. Premium Embroidery Services"
                    />
                  </div>
                </div>

                {/* Row 2: Address & Phone */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col bg-white/5 border border-border-glass p-4 rounded-xl gap-2">
                    <label className="font-bold text-xs text-text-main flex items-center justify-between">
                      <span>Store Address</span>
                      <span className="text-[11px] text-text-dim font-normal">Physical pickup location</span>
                    </label>
                    <input
                      type="text"
                      value={businessAddress}
                      onChange={(e) => setBusinessAddress(e.target.value)}
                      className="bg-bg-surface border border-border-glass rounded-lg py-2 px-3 text-text-main text-sm outline-none focus:border-primary transition-all font-sans"
                      placeholder="e.g. 123 Digital Thread Lane, Manila"
                    />
                  </div>

                  <div className="flex flex-col bg-white/5 border border-border-glass p-4 rounded-xl gap-2">
                    <label className="font-bold text-xs text-text-main flex items-center justify-between">
                      <span>Contact Number</span>
                      <span className="text-[11px] text-text-dim font-normal">Customer support line</span>
                    </label>
                    <input
                      type="text"
                      value={businessContact}
                      onChange={(e) => setBusinessContact(e.target.value)}
                      className="bg-bg-surface border border-border-glass rounded-lg py-2 px-3 text-text-main text-sm outline-none focus:border-primary transition-all font-sans"
                      placeholder="e.g. +63 (02) 888-THREAD"
                    />
                  </div>
                </div>

                {/* Row 3: Email & Website */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col bg-white/5 border border-border-glass p-4 rounded-xl gap-2">
                    <label className="font-bold text-xs text-text-main flex items-center justify-between">
                      <span>Support Email</span>
                      <span className="text-[11px] text-text-dim font-normal">Printed in receipt footer</span>
                    </label>
                    <input
                      type="email"
                      value={businessEmail}
                      onChange={(e) => setBusinessEmail(e.target.value)}
                      className="bg-bg-surface border border-border-glass rounded-lg py-2 px-3 text-text-main text-sm outline-none focus:border-primary transition-all font-sans"
                      placeholder="e.g. contact@stitch-opt.com"
                    />
                  </div>

                  <div className="flex flex-col bg-white/5 border border-border-glass p-4 rounded-xl gap-2">
                    <label className="font-bold text-xs text-text-main flex items-center justify-between">
                      <span>Website Address</span>
                      <span className="text-[11px] text-text-dim font-normal">Official store link</span>
                    </label>
                    <input
                      type="text"
                      value={businessWebsite}
                      onChange={(e) => setBusinessWebsite(e.target.value)}
                      className="bg-bg-surface border border-border-glass rounded-lg py-2 px-3 text-text-main text-sm outline-none focus:border-primary transition-all font-sans"
                      placeholder="e.g. www.stitch-opt.com"
                    />
                  </div>
                </div>

                {/* Row 4: Logo & GCash QR Upload Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                  {/* Store Logo Card */}
                  <div className="bg-white/5 border border-border-glass p-4 rounded-xl flex flex-col justify-between gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="font-bold text-xs text-text-main block">Store Logo</span>
                        <span className="text-[11px] text-text-dim block mt-0.5">
                          Shown on receipts and website header.
                        </span>
                      </div>
                      {businessLogoUrl ? (
                        <div className="relative group w-14 h-14 rounded-lg bg-white/10 p-1 border border-border-glass flex items-center justify-center shrink-0">
                          <img src={businessLogoUrl} alt="Store Logo" className="w-full h-full object-contain rounded" />
                          <button 
                            type="button"
                            onClick={() => setBusinessLogoUrl('')}
                            className="absolute -top-1.5 -right-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs cursor-pointer shadow-md transition-transform active:scale-90"
                            title="Remove Logo"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-white/5 border border-dashed border-border-glass flex items-center justify-center text-text-dim shrink-0">
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                            <circle cx="8.5" cy="8.5" r="1.5"/>
                            <polyline points="21 15 16 10 5 21"/>
                          </svg>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="flex-1">
                        <span className="inline-flex items-center justify-center w-full px-3 py-2 text-xs font-semibold rounded-lg bg-purple-500/10 text-purple-300 border border-purple-500/20 hover:bg-purple-500/20 cursor-pointer transition-all active:scale-95 text-center">
                          {isUploadingLogo ? 'Uploading Logo...' : 'Upload New Logo'}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          disabled={isUploadingLogo}
                          className="hidden"
                        />
                      </label>
                      {isUploadingLogo && (
                        <div className="w-4 h-4 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin shrink-0"></div>
                      )}
                    </div>
                  </div>

                  {/* GCash QR Code Card */}
                  <div className="bg-white/5 border border-border-glass p-4 rounded-xl flex flex-col justify-between gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="font-bold text-xs text-text-main block">GCash Payment QR Code</span>
                        <span className="text-[11px] text-text-dim block mt-0.5">
                          Displayed to customers during GCash checkout.
                        </span>
                      </div>
                      {gcashQrCodeUrl ? (
                        <div className="relative group w-14 h-14 rounded-lg bg-white/10 p-1 border border-border-glass flex items-center justify-center shrink-0">
                          <img src={gcashQrCodeUrl} alt="GCash QR Code" className="w-full h-full object-contain rounded" />
                          <button 
                            type="button"
                            onClick={() => setGcashQrCodeUrl('')}
                            className="absolute -top-1.5 -right-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs cursor-pointer shadow-md transition-transform active:scale-90"
                            title="Remove QR Code"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-white/5 border border-dashed border-border-glass flex items-center justify-center text-text-dim shrink-0">
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="3" y="3" width="7" height="7"/>
                            <rect x="14" y="3" width="7" height="7"/>
                            <rect x="14" y="14" width="7" height="7"/>
                            <rect x="3" y="14" width="7" height="7"/>
                          </svg>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="flex-1">
                        <span className="inline-flex items-center justify-center w-full px-3 py-2 text-xs font-semibold rounded-lg bg-blue-500/10 text-blue-300 border border-blue-500/20 hover:bg-blue-500/20 cursor-pointer transition-all active:scale-95 text-center">
                          {isUploadingQr ? 'Uploading QR...' : 'Upload New QR Code'}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleQrUpload}
                          disabled={isUploadingQr}
                          className="hidden"
                        />
                      </label>
                      {isUploadingQr && (
                        <div className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin shrink-0"></div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 mt-6 pt-5 border-t border-border-glass">
                <button
                  type="button"
                  onClick={() => {
                    setBusinessName('STITCH-OPT DESIGNS');
                    setReceiptTagline('Premium Embroidery Services');
                    setBusinessAddress('123 Digital Thread Lane, Manila');
                    setBusinessContact('+63 (02) 888-THREAD');
                    setBusinessEmail('contact@stitch-opt.com');
                    setBusinessWebsite('www.stitch-opt.com');
                    setBusinessLogoUrl('');
                    showToast('Store profile reset to defaults. Remember to click Save.', 'info');
                  }}
                  disabled={isSavingBiz}
                  className="bg-transparent hover:bg-white/5 border border-border-glass text-text-dim hover:text-text-main text-xs font-semibold px-4 py-2.5 rounded-lg cursor-pointer transition-all active:scale-95"
                >
                  Reset to Defaults
                </button>
                <button
                  type="button"
                  onClick={handleSaveBizSettings}
                  disabled={isSavingBiz}
                  className="bg-purple-600 text-white text-xs font-bold px-6 py-2.5 rounded-lg hover:bg-purple-500 cursor-pointer transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 border-none shadow-md shadow-purple-600/20"
                >
                  {isSavingBiz ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                      Saving Changes...
                    </>
                  ) : (
                    'Save Store Profile'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: FULFILLMENT & PRICING                                             */}
          {/* ========================================================================= */}
          {activeTab === 'fulfillment' && (
            <div className="flex flex-col gap-6 animate-[fadeIn_0.2s_ease-out]">
              {/* Courier Delivery Toggle Card */}
              <div className="glass-card p-6 md:p-8 border border-border-glass rounded-[24px]">
                <div className="flex items-center gap-3 mb-2 pb-4 border-b border-border-glass">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="1" y="3" width="15" height="13" />
                      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                      <circle cx="5.5" cy="18.5" r="2.5" />
                      <circle cx="18.5" cy="18.5" r="2.5" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold m-0 text-text-main">Courier Delivery Service</h3>
                    <p className="text-xs text-text-dim m-0 mt-0.5">
                      Enable or disable doorstep courier delivery for customer checkout.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white/5 border border-border-glass p-5 rounded-xl gap-4 mt-4">
                  <div className="flex flex-col max-w-[500px]">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-text-main">J&amp;T Express Courier Shipping</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        deliveryEnabled 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}>
                        {deliveryEnabled ? 'Active' : 'Disabled (Store Pickup Only)'}
                      </span>
                    </div>
                    <p className="text-xs text-text-dim mt-1.5 leading-relaxed m-0">
                      {deliveryEnabled 
                        ? 'Customers can choose doorstep courier delivery or in-store pickup at checkout. Delivery addresses and tracking waybills are enabled.' 
                        : 'Courier delivery is turned off. Customers can only order for physical store counter pick-up (Pacific Mall Lucena).'}
                    </p>
                  </div>

                  <div className="flex items-center shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleDelivery(!deliveryEnabled)}
                      disabled={isUpdatingDelivery}
                      className={`flex items-center gap-2 text-xs font-bold px-5 py-2.5 rounded-xl border cursor-pointer transition-all active:scale-95 duration-200 disabled:opacity-50 ${
                        deliveryEnabled
                          ? 'text-white bg-emerald-600 border-emerald-500 hover:bg-emerald-500 shadow-md shadow-emerald-600/20'
                          : 'text-amber-300 bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20'
                      }`}
                    >
                      {isUpdatingDelivery ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                          Updating...
                        </>
                      ) : deliveryEnabled ? (
                        <>
                          <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
                          Courier Enabled
                        </>
                      ) : (
                        <>
                          <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                          Store Pickup Only
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Gift Packaging Price Card */}
              <div className="glass-card p-6 md:p-8 border border-border-glass rounded-[24px]">
                <div className="flex items-center gap-3 mb-2 pb-4 border-b border-border-glass">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 12 20 22 4 22 4 12"/>
                      <rect x="2" y="7" width="20" height="5"/>
                      <line x1="12" y1="22" x2="12" y2="7"/>
                      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
                      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold m-0 text-text-main">Store Add-Ons &amp; Pricing</h3>
                    <p className="text-xs text-text-dim m-0 mt-0.5">
                      Configure extra services and optional packaging offered at checkout.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white/5 border border-border-glass p-5 rounded-xl gap-4 mt-4">
                  <div className="flex flex-col max-w-[450px]">
                    <span className="font-bold text-sm text-text-main">Gift Packaging Fee</span>
                    <span className="text-xs text-text-dim mt-1 leading-relaxed">
                      Optional gift wrapping and box presentation that customers can add to their order during checkout.
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim font-bold text-sm">₱</span>
                      <input 
                        type="number" 
                        value={giftPrice}
                        onChange={(e) => setGiftPrice(e.target.value as any)}
                        className="bg-bg-surface border border-border-glass rounded-lg py-2 pl-7 pr-3 text-text-main text-sm w-28 outline-none focus:border-primary transition-all font-mono"
                        step="0.50"
                        min="0"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleUpdateGiftPrice}
                      disabled={isGiftLoading}
                      className="text-xs font-bold text-white bg-primary hover:bg-primary/90 px-4 py-2 rounded-lg cursor-pointer transition-all active:scale-95 disabled:opacity-50 border-none shadow-md shadow-primary/20"
                    >
                      {isGiftLoading ? 'Saving...' : 'Update Price'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: AI & AUTOMATION                                                   */}
          {/* ========================================================================= */}
          {activeTab === 'ai' && (
            <div className="glass-card p-6 md:p-8 border border-border-glass rounded-[24px] flex flex-col animate-[fadeIn_0.2s_ease-out]">
              <div className="flex items-center gap-3 mb-2 pb-4 border-b border-border-glass">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                    <rect x="9" y="9" width="6" height="6" />
                    <line x1="9" y1="1" x2="9" y2="4" />
                    <line x1="15" y1="1" x2="15" y2="4" />
                    <line x1="9" y1="20" x2="9" y2="23" />
                    <line x1="15" y1="20" x2="15" y2="23" />
                    <line x1="20" y1="9" x2="23" y2="9" />
                    <line x1="20" y1="14" x2="23" y2="14" />
                    <line x1="1" y1="9" x2="4" y2="9" />
                    <line x1="1" y1="14" x2="4" y2="14" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold m-0 text-text-main">AI Engine &amp; Receipt Verification</h3>
                  <p className="text-xs text-text-dim m-0 mt-0.5">
                    Configure LLM models for customer chat assistance and OCR models for receipt verification.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-4 mt-4">
                {/* Chat Assistant Model */}
                <div className="flex flex-col md:flex-row md:items-center justify-between bg-white/5 border border-border-glass p-4 rounded-xl gap-4">
                  <div className="flex flex-col max-w-[380px]">
                    <span className="font-bold text-xs text-text-main">Customer Chat Assistant Model</span>
                    <span className="text-[11px] text-text-dim mt-0.5">
                      Powers conversational customer support, product FAQs, and store inquiries.
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 min-w-[280px]">
                    <select
                      value={aiChatModel}
                      onChange={(e) => setAiChatModel(e.target.value)}
                      className="bg-bg-surface border border-border-glass rounded-lg py-2 px-3 text-text-main text-xs outline-none focus:border-primary transition-all cursor-pointer font-sans"
                    >
                      {chatModelSuggestions.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                      {!chatModelSuggestions.some(m => m.value === aiChatModel) && (
                        <option value={aiChatModel}>{aiChatModel} (Custom)</option>
                      )}
                    </select>
                    <input
                      type="text"
                      placeholder="Or enter custom model ID..."
                      value={aiChatModel}
                      onChange={(e) => setAiChatModel(e.target.value)}
                      className="bg-bg-surface/50 border border-border-glass rounded-lg py-1.5 px-3 text-text-main text-xs outline-none focus:border-primary transition-all font-mono"
                    />
                  </div>
                </div>

                {/* Receipt OCR Model */}
                <div className="flex flex-col md:flex-row md:items-center justify-between bg-white/5 border border-border-glass p-4 rounded-xl gap-4">
                  <div className="flex flex-col max-w-[380px]">
                    <span className="font-bold text-xs text-text-main">Receipt OCR Vision Model</span>
                    <span className="text-[11px] text-text-dim mt-0.5">
                      Multimodal model that extracts reference numbers, dates, and amounts from customer receipts.
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 min-w-[280px]">
                    <select
                      value={aiVisionModel}
                      onChange={(e) => setAiVisionModel(e.target.value)}
                      className="bg-bg-surface border border-border-glass rounded-lg py-2 px-3 text-text-main text-xs outline-none focus:border-primary transition-all cursor-pointer font-sans"
                    >
                      {visionModelSuggestions.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                      {!visionModelSuggestions.some(m => m.value === aiVisionModel) && (
                        <option value={aiVisionModel}>{aiVisionModel} (Custom)</option>
                      )}
                    </select>
                    <input
                      type="text"
                      placeholder="Or enter custom vision model ID..."
                      value={aiVisionModel}
                      onChange={(e) => setAiVisionModel(e.target.value)}
                      className="bg-bg-surface/50 border border-border-glass rounded-lg py-1.5 px-3 text-text-main text-xs outline-none focus:border-primary transition-all font-mono"
                    />
                  </div>
                </div>

                {/* Provider Endpoint */}
                <div className="flex flex-col md:flex-row md:items-center justify-between bg-white/5 border border-border-glass p-4 rounded-xl gap-4">
                  <div className="flex flex-col max-w-[380px]">
                    <span className="font-bold text-xs text-text-main">API Provider Endpoint</span>
                    <span className="text-[11px] text-text-dim mt-0.5">
                      The OpenAI-compatible chat completions URL used for AI requests.
                    </span>
                  </div>
                  <input
                    type="text"
                    value={aiProviderUrl}
                    onChange={(e) => setAiProviderUrl(e.target.value)}
                    className="bg-bg-surface border border-border-glass rounded-lg py-2 px-3 text-text-main text-xs min-w-[280px] md:max-w-[380px] flex-1 outline-none focus:border-primary transition-all font-mono"
                    placeholder="https://api.groq.com/openai/v1/chat/completions"
                  />
                </div>

                {/* Confidence Threshold Gate */}
                <div className="flex flex-col md:flex-row md:items-center justify-between bg-white/5 border border-border-glass p-4 rounded-xl gap-4">
                  <div className="flex flex-col max-w-[380px]">
                    <span className="font-bold text-xs text-text-main">Receipt Verification Confidence Gate</span>
                    <span className="text-[11px] text-text-dim mt-0.5">
                      Receipts scoring below this threshold are flagged for manual admin approval.
                    </span>
                  </div>
                  <div className="flex items-center gap-4 min-w-[280px]">
                    <input
                      type="range"
                      min="50"
                      max="100"
                      step="5"
                      value={minConfidenceScore}
                      onChange={(e) => setMinConfidenceScore(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary focus:outline-none"
                    />
                    <span className="font-mono text-xs font-bold text-text-main w-12 text-right bg-primary/10 text-primary px-2 py-1 rounded">
                      {minConfidenceScore}%
                    </span>
                  </div>
                </div>

                {/* Live Diagnostic Ping Card */}
                <div className="flex flex-col bg-white/5 border border-border-glass p-4 rounded-xl gap-3 mt-1">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <span className="font-bold text-xs text-text-main block">Connection Diagnostics</span>
                      <span className="text-[11px] text-text-dim block mt-0.5">
                        Test whether the configured AI model and endpoint respond correctly.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={isTestingPing || isSaving}
                      className="bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 text-xs font-bold px-4 py-2 rounded-lg cursor-pointer transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 shrink-0"
                    >
                      {isTestingPing ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                          Testing Connection...
                        </>
                      ) : (
                        'Test AI Connection'
                      )}
                    </button>
                  </div>

                  {pingResult && (
                    <div className={`p-3 rounded-lg border text-xs font-mono flex flex-col gap-1.5 animate-[fadeIn_0.2s_ease-out] ${
                      pingResult.success 
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                        : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${pingResult.success ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
                        <span className="font-bold uppercase tracking-wider text-[11px]">
                          {pingResult.success ? 'Operational' : 'Connection Error'}
                        </span>
                        {pingResult.latency !== undefined && (
                          <span className="ml-auto bg-white/5 px-2 py-0.5 rounded border border-white/5 text-[10px] text-text-dim">
                            Latency: <strong className="text-white">{pingResult.latency}ms</strong>
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 mt-0.5">
                        <p className="m-0 leading-relaxed"><strong className="text-text-main">Message:</strong> {pingResult.message}</p>
                        {pingResult.reply && (
                          <p className="m-0 leading-relaxed text-text-dim"><strong className="text-text-main">Response:</strong> &ldquo;{pingResult.reply}&rdquo;</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 mt-6 pt-5 border-t border-border-glass">
                <button
                  type="button"
                  onClick={handleResetAISettings}
                  disabled={isSaving}
                  className="bg-transparent hover:bg-white/5 border border-border-glass text-text-dim hover:text-text-main text-xs font-semibold px-4 py-2.5 rounded-lg cursor-pointer transition-all active:scale-95"
                >
                  Reset to Defaults
                </button>
                <button
                  type="button"
                  onClick={handleSaveAISettings}
                  disabled={isSaving}
                  className="bg-primary text-white text-xs font-bold px-6 py-2.5 rounded-lg hover:bg-primary/90 cursor-pointer transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 border-none shadow-md shadow-primary/20"
                >
                  {isSaving ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                      Saving Config...
                    </>
                  ) : (
                    'Save AI Settings'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 4: THEME & APPEARANCE                                                */}
          {/* ========================================================================= */}
          {activeTab === 'appearance' && (
            <div className="glass-card p-6 md:p-8 border border-border-glass rounded-[24px] flex flex-col animate-[fadeIn_0.2s_ease-out]">
              <div className="flex items-center gap-3 mb-2 pb-4 border-b border-border-glass">
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5"/>
                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold m-0 text-text-main">Theme &amp; Appearance</h3>
                  <p className="text-xs text-text-dim m-0 mt-0.5">
                    Customize the visual display mode of the admin control panel.
                  </p>
                </div>
              </div>

              {/* Theme Selection Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                {/* Dark Mode Card */}
                <div 
                  onClick={() => {
                    if (theme !== 'dark') toggleTheme();
                  }}
                  className={`p-5 rounded-2xl border cursor-pointer transition-all duration-200 flex flex-col justify-between gap-4 ${
                    theme === 'dark'
                      ? 'bg-primary/10 border-primary ring-2 ring-primary/30 shadow-lg shadow-primary/10'
                      : 'bg-white/5 border-border-glass hover:border-white/20'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-xl bg-[#0f1117] border border-white/10 flex items-center justify-center text-amber-300">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                      </svg>
                    </div>
                    {theme === 'dark' && (
                      <span className="flex items-center gap-1.5 text-[11px] font-bold text-primary bg-primary/20 px-2.5 py-1 rounded-full border border-primary/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                        Active Theme
                      </span>
                    )}
                  </div>

                  <div>
                    <h4 className="font-bold text-sm text-text-main m-0">Dark Theme</h4>
                    <p className="text-xs text-text-dim m-0 mt-1 leading-relaxed">
                      Sleek glassmorphism with high contrast for night and low-light environments.
                    </p>
                  </div>
                </div>

                {/* Light Mode Card */}
                <div 
                  onClick={() => {
                    if (theme !== 'light') toggleTheme();
                  }}
                  className={`p-5 rounded-2xl border cursor-pointer transition-all duration-200 flex flex-col justify-between gap-4 ${
                    theme === 'light'
                      ? 'bg-primary/10 border-primary ring-2 ring-primary/30 shadow-lg shadow-primary/10'
                      : 'bg-white/5 border-border-glass hover:border-white/20'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-300 flex items-center justify-center text-amber-500">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="5"/>
                        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                      </svg>
                    </div>
                    {theme === 'light' && (
                      <span className="flex items-center gap-1.5 text-[11px] font-bold text-primary bg-primary/20 px-2.5 py-1 rounded-full border border-primary/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                        Active Theme
                      </span>
                    )}
                  </div>

                  <div>
                    <h4 className="font-bold text-sm text-text-main m-0">Light Theme</h4>
                    <p className="text-xs text-text-dim m-0 mt-1 leading-relaxed">
                      Clean, high-brightness layout ideal for bright daylight and office environments.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </section>
  );
}
