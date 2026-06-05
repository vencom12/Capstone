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

export default function PanelSettings({
  theme,
  toggleTheme,
  giftPrice,
  setGiftPrice,
  handleUpdateGiftPrice,
  isUpdatingSettings: isGiftLoading
}: PanelSettingsProps) {
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

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingBiz, setIsSavingBiz] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  // Suggested Options
  const chatModelSuggestions = [
    { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile (Recommended)' },
    { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant (Ultra-Fast)' },
    { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B (High Context)' }
  ];

  const visionModelSuggestions = [
    { value: 'llama-3.2-11b-vision-preview', label: 'Llama 3.2 11B Vision (Recommended)' },
    { value: 'llama-3.2-90b-vision-preview', label: 'Llama 3.2 90B Vision (Large-Scale)' }
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
      showToast('Dynamic AI & sustainability settings applied successfully!', 'success');
    } catch (e: any) {
      console.error(e);
      showToast(e.message || 'Failed to save AI configuration settings', 'error');
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
    showToast('AI controls reset to defaults. Remember to click Save!', 'info');
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
      showToast('Business profile & receipt settings applied successfully!', 'success');
    } catch (e: any) {
      console.error(e);
      showToast(e.message || 'Failed to save business settings', 'error');
    } finally {
      setIsSavingBiz(false);
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
        showToast('Logo uploaded successfully!', 'success');
      }
    } catch (error: any) {
      console.error(error);
      showToast(error.message || 'Failed to upload logo', 'error');
    } finally {
      setIsUploadingLogo(false);
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
          message: res.message || 'Connection verification successful!',
          reply: res.reply,
          latency
        });
        showToast('Diagnostic ping successful!', 'success');
      } else {
        setPingResult({
          success: false,
          message: res?.message || 'Connection failed.',
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
      showToast(e.message || 'Failed to ping AI provider', 'error');
    } finally {
      setIsTestingPing(false);
    }
  };

  return (
    <section className="animate-[fadeIn_0.3s_ease-out] flex flex-col min-h-full text-left font-sans max-w-[1000px] w-full">
      <header className="mb-6 flex flex-col">
        <h1 className="text-3xl font-extrabold mb-1">System & AI Settings</h1>
        <p className="text-text-dim text-[0.95rem] m-0">Configure overall application parameters, dynamic AI swapping, and confidence threshold gates.</p>
      </header>

      {isLoading ? (
        <div className="py-20 text-center text-text-dim flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          <span>Retrieving system orchestration telemetry...</span>
        </div>
      ) : (
        <div className="flex flex-col gap-6 pr-2">
          {/* Business Profile & Printed Receipts */}
          <div className="glass-card p-6 border border-border-glass rounded-[24px]">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400 font-bold">
                🏢
              </div>
              <h3 className="text-xl font-bold m-0 text-text-main">Business Profile & Printed Receipts</h3>
            </div>
            
            <p className="text-xs text-text-dim leading-relaxed mb-6">
              Customize the branding and details printed on generated customer receipts and restock shopping lists. Changes are stored in the global system context and take effect immediately.
            </p>

            <div className="flex flex-col gap-5">
              {/* Business Name */}
              <div className="flex flex-col md:flex-row md:items-center justify-between bg-white/5 border border-border-glass p-4 rounded-xl gap-4">
                <div className="flex flex-col max-w-[350px]">
                  <span className="font-bold text-sm text-white">Business Name</span>
                  <span className="text-xs text-text-dim mt-1">The primary name printed at the top of the receipt layout.</span>
                </div>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="bg-bg-surface border border-border-glass rounded-lg py-2.5 px-3 text-white text-sm min-w-[280px] md:max-w-[400px] flex-1 outline-none focus:border-primary transition-all font-sans"
                  placeholder="STITCH-OPT DESIGNS"
                />
              </div>

              {/* Receipt Tagline */}
              <div className="flex flex-col md:flex-row md:items-center justify-between bg-white/5 border border-border-glass p-4 rounded-xl gap-4">
                <div className="flex flex-col max-w-[350px]">
                  <span className="font-bold text-sm text-white">Receipt Tagline</span>
                  <span className="text-xs text-text-dim mt-1">A short brand motto printed directly under the business name.</span>
                </div>
                <input
                  type="text"
                  value={receiptTagline}
                  onChange={(e) => setReceiptTagline(e.target.value)}
                  className="bg-bg-surface border border-border-glass rounded-lg py-2.5 px-3 text-white text-sm min-w-[280px] md:max-w-[400px] flex-1 outline-none focus:border-primary transition-all font-sans"
                  placeholder="Premium Embroidery Services"
                />
              </div>

              {/* Business Address */}
              <div className="flex flex-col md:flex-row md:items-center justify-between bg-white/5 border border-border-glass p-4 rounded-xl gap-4">
                <div className="flex flex-col max-w-[350px]">
                  <span className="font-bold text-sm text-white">Business Address</span>
                  <span className="text-xs text-text-dim mt-1">The physical address listed on all transaction invoices.</span>
                </div>
                <input
                  type="text"
                  value={businessAddress}
                  onChange={(e) => setBusinessAddress(e.target.value)}
                  className="bg-bg-surface border border-border-glass rounded-lg py-2.5 px-3 text-white text-sm min-w-[280px] md:max-w-[400px] flex-1 outline-none focus:border-primary transition-all font-sans"
                  placeholder="123 Digital Thread Lane, Manila"
                />
              </div>

              {/* Business Contact */}
              <div className="flex flex-col md:flex-row md:items-center justify-between bg-white/5 border border-border-glass p-4 rounded-xl gap-4">
                <div className="flex flex-col max-w-[350px]">
                  <span className="font-bold text-sm text-white">Contact Number</span>
                  <span className="text-xs text-text-dim mt-1">The store telephone or mobile number for customer queries.</span>
                </div>
                <input
                  type="text"
                  value={businessContact}
                  onChange={(e) => setBusinessContact(e.target.value)}
                  className="bg-bg-surface border border-border-glass rounded-lg py-2.5 px-3 text-white text-sm min-w-[280px] md:max-w-[400px] flex-1 outline-none focus:border-primary transition-all font-sans"
                  placeholder="+63 (02) 888-THREAD"
                />
              </div>

              {/* Business Email */}
              <div className="flex flex-col md:flex-row md:items-center justify-between bg-white/5 border border-border-glass p-4 rounded-xl gap-4">
                <div className="flex flex-col max-w-[350px]">
                  <span className="font-bold text-sm text-white">Support Email Address</span>
                  <span className="text-xs text-text-dim mt-1">Email address printed on the footer of all receipts.</span>
                </div>
                <input
                  type="email"
                  value={businessEmail}
                  onChange={(e) => setBusinessEmail(e.target.value)}
                  className="bg-bg-surface border border-border-glass rounded-lg py-2.5 px-3 text-white text-sm min-w-[280px] md:max-w-[400px] flex-1 outline-none focus:border-primary transition-all font-sans"
                  placeholder="contact@stitch-opt.com"
                />
              </div>

              {/* Business Website URL */}
              <div className="flex flex-col md:flex-row md:items-center justify-between bg-white/5 border border-border-glass p-4 rounded-xl gap-4">
                <div className="flex flex-col max-w-[350px]">
                  <span className="font-bold text-sm text-white">Business Website URL</span>
                  <span className="text-xs text-text-dim mt-1">Website URL printed on the footer of all receipts.</span>
                </div>
                <input
                  type="text"
                  value={businessWebsite}
                  onChange={(e) => setBusinessWebsite(e.target.value)}
                  className="bg-bg-surface border border-border-glass rounded-lg py-2.5 px-3 text-white text-sm min-w-[280px] md:max-w-[400px] flex-1 outline-none focus:border-primary transition-all font-sans"
                  placeholder="www.stitch-opt.com"
                />
              </div>

              {/* Business Logo Upload */}
              <div className="flex flex-col md:flex-row md:items-center justify-between bg-white/5 border border-border-glass p-4 rounded-xl gap-4">
                <div className="flex flex-col max-w-[350px]">
                  <span className="font-bold text-sm text-white">Business Logo</span>
                  <span className="text-xs text-text-dim mt-1">Upload a custom logo for receipts and the website favicon.</span>
                </div>
                <div className="flex items-center gap-4 flex-1 justify-end">
                  {businessLogoUrl && (
                    <div className="relative group">
                      <img src={businessLogoUrl} alt="Logo" className="w-10 h-10 object-contain bg-white/10 rounded" />
                      <button 
                        onClick={() => setBusinessLogoUrl('')}
                        className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] cursor-pointer"
                        title="Remove Logo"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    disabled={isUploadingLogo}
                    className="text-xs text-text-dim file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer w-full max-w-[250px]"
                  />
                  {isUploadingLogo && <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></div>}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6 border-t border-border-glass pt-5">
              <button
                onClick={() => {
                  setBusinessName('STITCH-OPT DESIGNS');
                  setReceiptTagline('Premium Embroidery Services');
                  setBusinessAddress('123 Digital Thread Lane, Manila');
                  setBusinessContact('+63 (02) 888-THREAD');
                  setBusinessEmail('contact@stitch-opt.com');
                  setBusinessWebsite('www.stitch-opt.com');
                  setBusinessLogoUrl('');
                  showToast('Receipt details reset to defaults. Click Save!', 'info');
                }}
                disabled={isSavingBiz}
                className="bg-transparent hover:bg-white/5 border border-border-glass text-text-main text-xs font-bold px-4 py-2.5 rounded-lg cursor-pointer transition-all active:scale-95 duration-200"
              >
                Reset to Defaults
              </button>
              <button
                onClick={handleSaveBizSettings}
                disabled={isSavingBiz}
                className="bg-purple-600 text-white text-xs font-bold px-5 py-2.5 rounded-lg hover:bg-purple-600/90 cursor-pointer transition-all active:scale-95 duration-200 disabled:opacity-50 flex items-center gap-2 border-none shadow-[0_4px_15px_rgba(168,85,247,0.25)]"
              >
                {isSavingBiz ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                    Applying Changes...
                  </>
                ) : (
                  'Save Profile'
                )}
              </button>
            </div>
          </div>

          {/* Dynamic AI Configuration */}
          <div className="glass-card p-6 border border-border-glass rounded-[24px]">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold">
                🤖
              </div>
              <h3 className="text-xl font-bold m-0 text-text-main">Dynamic AI Automation Engine</h3>
            </div>
            
            <p className="text-xs text-text-dim leading-relaxed mb-6">
              Empower administrative operators with absolute control. Dynamically hot-swap Groq models, configure remote endpoint provider URLs, and adjust receipt processing logic instantly without modifying source code or re-deploying microservices.
            </p>

            <div className="flex flex-col gap-5">
              {/* Chat & Orchestration Model */}
              <div className="flex flex-col md:flex-row md:items-center justify-between bg-white/5 border border-border-glass p-4 rounded-xl gap-4">
                <div className="flex flex-col max-w-[350px]">
                  <span className="font-bold text-sm text-white">Chat Orchestration Model</span>
                  <span className="text-xs text-text-dim mt-1">Select the primary model for conversational commands, automated stock actions, and catalog revisions.</span>
                </div>
                <div className="flex flex-col gap-2 min-w-[280px]">
                  <select
                    value={aiChatModel}
                    onChange={(e) => setAiChatModel(e.target.value)}
                    className="bg-bg-surface border border-border-glass rounded-lg py-2.5 px-3 text-white text-sm outline-none focus:border-primary transition-all cursor-pointer font-sans"
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
                    className="bg-bg-surface/50 border border-border-glass rounded-lg py-1.5 px-3 text-white text-[0.8rem] outline-none focus:border-primary transition-all font-mono"
                  />
                </div>
              </div>

              {/* Vision (OCR) Model */}
              <div className="flex flex-col md:flex-row md:items-center justify-between bg-white/5 border border-border-glass p-4 rounded-xl gap-4">
                <div className="flex flex-col max-w-[350px]">
                  <span className="font-bold text-sm text-white">OCR Vision Model</span>
                  <span className="text-xs text-text-dim mt-1">Select the multimodal vision model responsible for parsing transaction receipts and proof-of-payment.</span>
                </div>
                <div className="flex flex-col gap-2 min-w-[280px]">
                  <select
                    value={aiVisionModel}
                    onChange={(e) => setAiVisionModel(e.target.value)}
                    className="bg-bg-surface border border-border-glass rounded-lg py-2.5 px-3 text-white text-sm outline-none focus:border-primary transition-all cursor-pointer font-sans"
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
                    className="bg-bg-surface/50 border border-border-glass rounded-lg py-1.5 px-3 text-white text-[0.8rem] outline-none focus:border-primary transition-all font-mono"
                  />
                </div>
              </div>

              {/* Provider Endpoint */}
              <div className="flex flex-col md:flex-row md:items-center justify-between bg-white/5 border border-border-glass p-4 rounded-xl gap-4">
                <div className="flex flex-col max-w-[350px]">
                  <span className="font-bold text-sm text-white">AI Provider Endpoint URL</span>
                  <span className="text-xs text-text-dim mt-1">Set the endpoint address where chat completions and vision analysis queries are securely dispatched.</span>
                </div>
                <input
                  type="text"
                  value={aiProviderUrl}
                  onChange={(e) => setAiProviderUrl(e.target.value)}
                  className="bg-bg-surface border border-border-glass rounded-lg py-2.5 px-3 text-white text-sm min-w-[280px] md:max-w-[400px] flex-1 outline-none focus:border-primary transition-all font-mono"
                  placeholder="https://api.groq.com/openai/v1/chat/completions"
                />
              </div>

              {/* Confidence Score Gate */}
              <div className="flex flex-col md:flex-row md:items-center justify-between bg-white/5 border border-border-glass p-4 rounded-xl gap-4">
                <div className="flex flex-col max-w-[350px]">
                  <span className="font-bold text-sm text-white">Confidence Threshold Gate</span>
                  <span className="text-xs text-text-dim mt-1">
                    Control verification safety. Receipts below this confidence level are auto-flagged for operator manual review. 
                    Currently set to: <strong className="text-primary font-mono text-[0.85rem] bg-primary/10 px-1.5 py-0.5 rounded ml-1">{minConfidenceScore}%</strong>
                  </span>
                </div>
                <div className="flex items-center gap-4 min-w-[280px]">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={minConfidenceScore}
                    onChange={(e) => setMinConfidenceScore(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary focus:outline-none"
                  />
                  <span className="font-mono text-sm font-bold text-text-main w-12 text-right">
                    {minConfidenceScore}%
                  </span>
                </div>
              </div>

              {/* Live Connectivity Diagnostics */}
              <div className="flex flex-col bg-white/5 border border-border-glass p-4 rounded-xl gap-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex flex-col max-w-[350px]">
                    <span className="font-bold text-sm text-white">Live Connectivity Diagnostics</span>
                    <span className="text-xs text-text-dim mt-1">
                      Validate active AI engine credentials and check endpoint routing latency.
                    </span>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={isTestingPing || isSaving}
                      className="bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 text-xs font-bold px-4 py-2.5 rounded-lg cursor-pointer transition-all active:scale-95 duration-200 disabled:opacity-50 flex items-center gap-2"
                    >
                      {isTestingPing ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                          Pinging API...
                        </>
                      ) : (
                        <>
                          ⚡ Test Live Connection
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Connection Status Display */}
                {pingResult && (
                  <div className={`mt-2 p-3 rounded-lg border text-xs font-mono flex flex-col gap-1.5 animate-[fadeIn_0.2s_ease-out] ${
                    pingResult.success 
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                      : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${pingResult.success ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'} `}></span>
                      <span className="font-bold uppercase tracking-wider">
                        {pingResult.success ? 'Operational' : 'Routing Failure'}
                      </span>
                      {pingResult.latency !== undefined && (
                        <span className="ml-auto bg-white/5 px-2 py-0.5 rounded border border-white/5 text-[0.7rem] text-text-dim">
                          Latency: <strong className="text-white">{pingResult.latency}ms</strong>
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-col gap-1">
                      <p className="m-0 leading-relaxed"><strong className="text-white">Message:</strong> {pingResult.message}</p>
                      {pingResult.reply && (
                        <p className="m-0 leading-relaxed"><strong className="text-white">Provider Response:</strong> "{pingResult.reply}"</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* AI Control Buttons */}
            <div className="flex items-center justify-end gap-3 mt-6 border-t border-border-glass pt-5">
              <button
                onClick={handleResetAISettings}
                disabled={isSaving}
                className="bg-transparent hover:bg-white/5 border border-border-glass text-text-main text-xs font-bold px-4 py-2.5 rounded-lg cursor-pointer transition-all active:scale-95 duration-200"
              >
                Reset to Defaults
              </button>
              <button
                onClick={handleSaveAISettings}
                disabled={isSaving}
                className="bg-primary text-white text-xs font-bold px-5 py-2.5 rounded-lg hover:bg-primary/90 cursor-pointer transition-all active:scale-95 duration-200 disabled:opacity-50 flex items-center gap-2 border-none shadow-[0_4px_15px_rgba(99,102,241,0.25)]"
              >
                {isSaving ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                    Applying Changes...
                  </>
                ) : (
                  'Save AI Config'
                )}
              </button>
            </div>
          </div>

          {/* Business Pricing Settings */}
          <div className="glass-card p-6 border border-border-glass rounded-[24px]">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center text-secondary font-bold">
                💰
              </div>
              <h3 className="text-xl font-bold m-0 text-text-main">Business Solutions Pricing</h3>
            </div>

            <p className="text-xs text-text-dim leading-relaxed mb-6">
              Configure baseline retail values and upsells. Alter luxury gift packaging suite price elements across active order checkouts.
            </p>

            <div className="flex items-center justify-between bg-white/5 border border-border-glass p-4 rounded-xl">
              <div className="flex flex-col text-left">
                <span className="font-bold text-sm text-white">Luxury Gift Suite Price</span>
                <span className="text-xs text-text-dim mt-1">Controls the upsell price for premium packaging at checkout</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim font-bold">$</span>
                  <input 
                    type="number" 
                    value={giftPrice}
                    onChange={(e) => setGiftPrice(e.target.value as any)}
                    className="bg-bg-surface border border-border-glass rounded-lg py-2.5 pl-7 pr-3 text-white text-sm w-24 outline-none focus:border-primary transition-all font-mono"
                    step="0.50"
                    min="0"
                  />
                </div>
                <button
                  onClick={handleUpdateGiftPrice}
                  disabled={isGiftLoading}
                  className="flex items-center gap-2 text-xs font-bold text-bg-surface bg-secondary px-4 py-2.5 rounded-lg hover:bg-secondary/90 cursor-pointer transition-all active:scale-95 disabled:opacity-50 border-none shadow-[0_4px_15px_rgba(236,72,153,0.25)] text-white"
                >
                  {isGiftLoading ? 'Saving...' : 'Save Price'}
                </button>
              </div>
            </div>
          </div>

          {/* Visual Display Theme Parameters */}
          <div className="glass-card p-6 border border-border-glass rounded-[24px]">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-white/5 border border-border-glass flex items-center justify-center text-text-main font-bold">
                🎨
              </div>
              <h3 className="text-xl font-bold m-0 text-text-main">Visual Display Parameters</h3>
            </div>

            <p className="text-xs text-text-dim leading-relaxed mb-6">
              Customize local operational layout features. Toggle light and dark UI modes dynamically.
            </p>

            <div className="flex items-center justify-between bg-white/5 border border-border-glass p-4 rounded-xl">
              <div className="flex flex-col text-left">
                <span className="font-bold text-sm text-white">Default Theme Configuration</span>
                <span className="text-xs text-text-dim mt-1">Locks standard premium dark-mode visuals across auth panels</span>
              </div>
              <button
                onClick={toggleTheme}
                className="flex items-center gap-2 text-xs font-bold text-primary bg-primary/10 px-4 py-2.5 rounded-full border border-primary/20 hover:bg-primary/20 cursor-pointer transition-all active:scale-95 duration-200"
              >
                {theme === 'dark' ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                    Premium Dark Mode Enabled
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                    Premium Light Mode Enabled
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
