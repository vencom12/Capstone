'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import { calculateLetteringCost } from '@/lib/letteringPricing';
import colorMapRaw from '@/config/colorMap.json';

const colorMap = colorMapRaw as Record<string, string[]>;

export default function QRIntakePage() {
  const router = useRouter();
  const [client, setClient] = useState('');
  const [text, setText] = useState('');
  const [garmentType, setGarmentType] = useState<'small' | 'big'>('small');
  const [garmentDescription, setGarmentDescription] = useState('');
  const [color, setColor] = useState('Navy');
  const [font] = useState('Classic Cursive Script');
  const [waiverSigned, setWaiverSigned] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
     if (color && colorMap[color]) {
        setSuggestions(colorMap[color]);
     } else {
        setSuggestions(colorMap['Default'] || []);
     }
  }, [color]);

  const isBig = garmentType === 'big';
  const lettering = useMemo(() => {
    return calculateLetteringCost(text, isBig, {}, true);
  }, [text, isBig]);

  const basePrice = 0;
  const totalAmount = basePrice + lettering.extraCost;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waiverSigned) {
      showToast('You must sign the waiver to proceed', 'error');
      return;
    }
    setIsSubmitting(true);
    
    try {
      const itemTitle = `BYOG [${isBig ? 'Big Item' : 'Small Item'}]${garmentDescription.trim() ? ` (${garmentDescription.trim()})` : ''}`;
      await api.post('/api/customer/order/submit', {
        items: [{
          id: 'byog-1',
          name: itemTitle,
          price: totalAmount,
          quantity: 1,
          productId: 'byog',
          isByog: true,
          personalization: {
            text: text.trim().toUpperCase(),
            color: suggestions[0] || 'White',
            font,
            extraLetteringCost: lettering.extraCost,
            extraLettersCount: lettering.extraLettersCount,
          }
        }],
        totalAmount,
        address: 'In-Store',
        paymentMethod: 'cash_at_counter',
        isByog: true,
        waiverSigned: true,
        personalization: { text: text.trim().toUpperCase(), color: suggestions[0] || 'White', font }
      });
      showToast('Intake successful! Please show this screen to the cashier.', 'success');
      router.push('/qr-intake/success');
    } catch (err) {
      showToast('Failed to submit intake form', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-dark text-text-main p-6 font-sans flex flex-col items-center">
       <div className="w-full max-w-md bg-white/5 border border-border-glass p-6 rounded-xl">
          <h1 className="text-2xl font-extrabold text-primary mb-1">BYOG Express Intake</h1>
          <p className="text-text-dim text-xs mb-5">Eds Towels &amp; Caps • Bring Your Own Garment form</p>

          <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
             <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-dim uppercase tracking-wider">Your Name</label>
                <input required type="text" value={client} onChange={e => setClient(e.target.value)} placeholder="e.g. Maria Santos" className="bg-bg-surface border border-border-glass p-3 rounded-lg text-text-main outline-none focus:border-primary text-sm" />
             </div>

             {/* Garment Size Selection */}
             <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-text-dim uppercase tracking-wider">Garment Category</label>
                  <span className="text-[11px] text-amber-400 font-semibold">No free 1st word • All letters charged</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setGarmentType('small')}
                    className={`p-3 rounded-lg border text-left cursor-pointer transition ${
                      garmentType === 'small'
                        ? 'bg-primary/20 border-primary text-text-main ring-1 ring-primary/40'
                        : 'bg-white/[0.03] border-border-glass text-text-dim hover:text-text-main'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center justify-between">
                      <span>Small Garment</span>
                      <span className="font-mono text-primary text-[11px]">₱7/letter</span>
                    </div>
                    <div className="text-[10px] text-text-dim mt-0.5">Cap, Face/Hand Towel, Fan, Handkerchief</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setGarmentType('big')}
                    className={`p-3 rounded-lg border text-left cursor-pointer transition ${
                      garmentType === 'big'
                        ? 'bg-primary/20 border-primary text-text-main ring-1 ring-primary/40'
                        : 'bg-white/[0.03] border-border-glass text-text-dim hover:text-text-main'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center justify-between">
                      <span>Big Garment</span>
                      <span className="font-mono text-primary text-[11px]">₱10/letter</span>
                    </div>
                    <div className="text-[10px] text-text-dim mt-0.5">T-Shirt, Polo, Jacket, Bath Towel, Hoodie</div>
                  </button>
                </div>
             </div>

             <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-dim uppercase tracking-wider">Describe Your Garment (Optional)</label>
                <input type="text" value={garmentDescription} onChange={e => setGarmentDescription(e.target.value)} placeholder="e.g. Navy Blue Hospital Scrubs / White Uniform" className="bg-bg-surface border border-border-glass p-2.5 rounded-lg text-text-main outline-none focus:border-primary text-xs" />
             </div>

             <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                   <label className="text-xs font-bold text-text-dim uppercase tracking-wider">Embroidery Text</label>
                   <span className="text-[11px] text-text-dim/80">{text.length}/25</span>
                </div>
                <input required type="text" maxLength={25} value={text} onChange={e => setText(e.target.value.toUpperCase())} placeholder="e.g. SOPHIA (Max 25 chars)" className="bg-bg-surface border border-border-glass p-3 rounded-lg text-text-main outline-none focus:border-primary text-lg font-bold font-mono tracking-wider" />
                <span className="text-[11px] text-text-dim/60">Single-line standard hoop monogram / name (max 25 characters)</span>

                {text.trim() && (
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.04] border border-border-glass text-xs mt-1">
                    <span className="text-text-dim text-[11px]">
                      {lettering.extraLettersCount > 0
                        ? `BYOG Lettering (${lettering.extraLettersCount} letters × ₱${lettering.ratePerLetter} — every letter charged):`
                        : `BYOG Lettering (₱${lettering.ratePerLetter}/letter • all letters charged):`}
                    </span>
                    <span className="font-mono font-bold text-xs text-primary">
                      ₱{lettering.extraCost.toFixed(2)}
                    </span>
                  </div>
                )}
             </div>

             <div className="grid grid-cols-2 gap-4">
               <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-dim uppercase tracking-wider">Garment Color</label>
                  <select value={color} onChange={e => setColor(e.target.value)} className="bg-bg-surface border border-border-glass p-3 rounded-lg text-text-main outline-none focus:border-primary text-xs">
                    <option value="Navy">Navy</option>
                    <option value="Black">Black</option>
                    <option value="White">White</option>
                    <option value="Emerald Green">Emerald Green</option>
                    <option value="Burgundy">Burgundy</option>
                  </select>
               </div>
               <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-dim uppercase tracking-wider">Font Style</label>
                  <div className="bg-bg-surface border border-border-glass p-3 rounded-lg text-text-main text-xs flex items-center font-serif italic text-primary">
                    Classic Cursive Script
                  </div>
               </div>
             </div>

             {/* Smart Color Suggestions */}
             {color && suggestions.length > 0 && (
                <div className="bg-primary/10 border border-primary/20 p-3 rounded-lg mt-1 animate-[fadeIn_0.3s_ease-out]">
                   <span className="text-xs font-bold text-primary block mb-1">Smart Color Suggestor</span>
                   <p className="text-[0.8rem] text-text-main">Recommended thread colors for {color}: <br/><b className="text-[#fbbf24]">{suggestions.join(', ')}</b></p>
                </div>
             )}

             {/* Total Breakdown */}
             <div className="p-3 rounded-xl bg-white/[0.03] border border-border-glass flex items-center justify-between">
                <div>
                   <span className="text-xs text-text-dim block">Estimated Total</span>
                   <span className="text-[11px] text-text-dim/70">₱{basePrice} base service + ₱{lettering.extraCost} extra lettering</span>
                </div>
                <div className="text-xl font-bold font-mono text-primary">
                   ₱{totalAmount.toFixed(2)}
                </div>
             </div>

             <div className="flex flex-col gap-2 bg-danger/10 border border-danger/30 p-4 rounded-lg">
                <label className="flex items-start gap-3 cursor-pointer">
                   <input required type="checkbox" checked={waiverSigned} onChange={e => setWaiverSigned(e.target.checked)} className="mt-1 accent-danger w-5 h-5 flex-shrink-0" />
                   <span className="text-[0.8rem] text-text-main">
                      <b>Machine Damage Waiver:</b> I understand that embroidery involves high-speed machinery. While rare, machinery can malfunction and damage the garment. I agree that Eds Towels &amp; Caps is not liable for replacement cost of my personal garment.
                   </span>
                </label>
             </div>

             <button disabled={isSubmitting || !waiverSigned} type="submit" className="w-full bg-primary text-white font-extrabold text-base py-3.5 rounded-lg disabled:opacity-50 transition-all hover:bg-primary/90 active:scale-98 cursor-pointer shadow-md">
               {isSubmitting ? 'Processing...' : `Generate Intake QR (₱${totalAmount.toFixed(2)})`}
             </button>
          </form>
       </div>
    </div>
  );
}
