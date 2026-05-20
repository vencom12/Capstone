'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import colorMapRaw from '@/config/colorMap.json';

const colorMap = colorMapRaw as Record<string, string[]>;

export default function QRIntakePage() {
  const router = useRouter();
  const [client, setClient] = useState('');
  const [text, setText] = useState('');
  const [color, setColor] = useState('Navy');
  const [font, setFont] = useState('Standard');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waiverSigned) {
      showToast('You must sign the waiver to proceed', 'error');
      return;
    }
    setIsSubmitting(true);
    
    try {
      await api.post('/api/customer/order/submit', {
        items: [{ id: 'byog-1', name: 'BYOG Embroidery Service', price: 15.00, quantity: 1, productId: 'byog' }],
        totalAmount: 15.00,
        address: 'In-Store',
        paymentMethod: 'cash_at_counter',
        isByog: true,
        waiverSigned: true,
        personalization: { text, color: suggestions[0] || 'White', font }
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
       <div className="w-full max-w-md bg-white/5 border border-border-glass p-6 rounded-[24px]">
          <h1 className="text-2xl font-extrabold text-primary mb-2">BYOG Express Intake</h1>
          <p className="text-text-dim text-sm mb-6">Bring Your Own Garment. Fill this out while you wait in line.</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
             <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-dim uppercase tracking-wider">Your Name</label>
                <input required type="text" value={client} onChange={e => setClient(e.target.value)} className="bg-black/30 border border-white/10 p-3 rounded-xl text-white outline-none focus:border-primary" />
             </div>

             <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-dim uppercase tracking-wider">Embroidery Text</label>
                <input required type="text" value={text} onChange={e => setText(e.target.value)} className="bg-black/30 border border-white/10 p-3 rounded-xl text-white outline-none focus:border-primary text-xl font-bold" />
             </div>

             <div className="grid grid-cols-2 gap-4">
               <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-dim uppercase tracking-wider">Garment Color</label>
                  <select value={color} onChange={e => setColor(e.target.value)} className="bg-black/30 border border-white/10 p-3 rounded-xl text-white outline-none focus:border-primary">
                    <option value="Navy">Navy</option>
                    <option value="Black">Black</option>
                    <option value="White">White</option>
                    <option value="Emerald Green">Emerald Green</option>
                    <option value="Burgundy">Burgundy</option>
                  </select>
               </div>
               <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-dim uppercase tracking-wider">Font Style</label>
                  <select value={font} onChange={e => setFont(e.target.value)} className="bg-black/30 border border-white/10 p-3 rounded-xl text-white outline-none focus:border-primary">
                    <option value="Standard">Standard Block</option>
                    <option value="Script">Elegant Script</option>
                    <option value="Athletic">Athletic</option>
                  </select>
               </div>
             </div>

             {/* Smart Color Suggestions */}
             {color && suggestions.length > 0 && (
                <div className="bg-primary/10 border border-primary/20 p-3 rounded-xl mt-2 animate-[fadeIn_0.3s_ease-out]">
                   <span className="text-xs font-bold text-primary block mb-2">Smart Color Suggestor</span>
                   <p className="text-[0.8rem] text-white">Recommended thread colors for {color}: <br/><b className="text-[#fbbf24]">{suggestions.join(', ')}</b></p>
                </div>
             )}

             <div className="flex flex-col gap-2 mt-4 bg-danger/10 border border-danger/30 p-4 rounded-xl">
                <label className="flex items-start gap-3 cursor-pointer">
                   <input required type="checkbox" checked={waiverSigned} onChange={e => setWaiverSigned(e.target.checked)} className="mt-1 accent-danger w-5 h-5 flex-shrink-0" />
                   <span className="text-[0.8rem] text-white">
                      <b>Machine Damage Waiver:</b> I understand that embroidery involves high-speed machinery. While rare, machinery can malfunction and damage the garment. I agree that StitchMaster is not liable for replacement cost of my personal garment.
                   </span>
                </label>
             </div>

             <button disabled={isSubmitting || !waiverSigned} type="submit" className="w-full bg-primary text-bg-surface font-extrabold text-lg py-4 rounded-xl mt-4 disabled:opacity-50 transition-all hover:bg-primary/90 active:scale-95 cursor-pointer">
               {isSubmitting ? 'Processing...' : 'Generate Intake QR'}
             </button>
          </form>
       </div>
    </div>
  );
}
