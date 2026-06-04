'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useBasketStore } from '@/stores/useBasketStore';
import { useProductStore } from '@/stores/useProductStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { showToast } from '@/components/ui/Toast';
import type { Product } from '@/lib/types';

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  suggestedProducts?: Product[];
}

interface StorefrontChatResponse {
  success: boolean;
  reply: string;
  suggestedProducts: Product[];
}

let messageId = 0;

export default function AiAttendant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasGreeted, setHasGreeted] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { selectedCategory, searchQuery } = useProductStore();
  const { isAuthenticated } = useAuthStore();
  const { items: basketItems, addItem } = useBasketStore();

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // Show greeting on first open
  useEffect(() => {
    if (isOpen && !hasGreeted) {
      setHasGreeted(true);
      setMessages([{
        id: ++messageId,
        role: 'assistant',
        text: "Hi there! 👋 I'm your **Stitch-Opt** virtual store attendant. I can help you find the perfect embroidery design — just tell me what you're looking for!",
      }]);
    }
  }, [isOpen, hasGreeted]);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMsg: ChatMessage = { id: ++messageId, role: 'user', text: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      // Build history for context (exclude suggestedProducts to keep payload small)
      const history = messages.map(m => ({ role: m.role, text: m.text }));

      const data = await api.post<StorefrontChatResponse>('/api/ai/storefront-chat', {
        message: trimmed,
        history,
        context: { selectedCategory, searchQuery },
      });

      const aiMsg: ChatMessage = {
        id: ++messageId,
        role: 'assistant',
        text: data.reply || "I couldn't come up with a response. Try asking differently!",
        suggestedProducts: data.suggestedProducts || [],
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (err) {
      const aiMsg: ChatMessage = {
        id: ++messageId,
        role: 'assistant',
        text: "Sorry, I'm having trouble connecting right now. Please try again in a moment! 🔧",
      };
      setMessages(prev => [...prev, aiMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, selectedCategory, searchQuery]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleAddToBasket = (product: Product) => {
    if (!isAuthenticated) {
      showToast('Please login to add items to your basket', 'info');
      return;
    }

    const productId = product.id || (product as any)._id || '';
    const availableStock = product.availableStock !== undefined
      ? product.availableStock
      : Math.max(0, (product.count ?? 0) - (product.reservedCount ?? 0));
    const isOutOfStock = product.isOutOfStock || availableStock <= 0;

    if (isOutOfStock) {
      showToast(`Sorry, "${product.name}" is currently out of stock.`, 'error');
      return;
    }

    const existing = basketItems.find(i => i.productId === productId);
    const existingQty = existing ? existing.quantity : 0;
    if (existingQty + 1 > availableStock) {
      showToast(`Sorry, only ${availableStock} units of "${product.name}" available.`, 'error');
      return;
    }

    addItem({
      productId,
      name: product.name,
      price: product.price,
      imageUrl: product.imageUrl,
    });
    showToast(`Added ${product.name} to basket`, 'success');
  };

  // Simple markdown-ish text renderer for bold
  const renderText = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-bold">{part.slice(2, -2)}</strong>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <>
      {/* Floating Chat Bubble */}
      <button
        id="ai-attendant-trigger"
        suppressHydrationWarning
        onClick={() => setIsOpen(!isOpen)}
        className={`
          fixed bottom-6 right-6 z-[2500] w-14 h-14 rounded-full
          flex items-center justify-center cursor-pointer
          border-none outline-none
          transition-all duration-300 ease-out
          shadow-[0_8px_32px_rgba(99,102,241,0.4)]
          ${isOpen
            ? 'bg-white/10 backdrop-blur-xl border border-border-glass rotate-0 scale-95'
            : 'bg-gradient-to-br from-primary to-secondary hover:scale-110 hover:shadow-[0_12px_40px_rgba(99,102,241,0.6)]'
          }
        `}
        aria-label="Toggle AI Store Attendant"
      >
        {isOpen ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <circle cx="9" cy="10" r="1" fill="white" />
            <circle cx="12" cy="10" r="1" fill="white" />
            <circle cx="15" cy="10" r="1" fill="white" />
          </svg>
        )}
        {/* Pulse ring when closed */}
        {!isOpen && (
          <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping pointer-events-none" style={{ animationDuration: '2s' }} />
        )}
      </button>

      {/* Chat Panel */}
      <div
        className={`
          fixed z-[2400] transition-all duration-300 ease-out
          ${isOpen
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-4 pointer-events-none'
          }
          bottom-24 right-4
          w-[380px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-8rem)]

          max-[500px]:bottom-0 max-[500px]:right-0 max-[500px]:left-0
          max-[500px]:w-full max-[500px]:max-w-none
          max-[500px]:h-[calc(100vh-5rem)] max-[500px]:max-h-none
          max-[500px]:rounded-none
        `}
      >
        <div className="w-full h-full bg-bg-card/95 backdrop-blur-2xl border border-border-glass rounded-2xl max-[500px]:rounded-none flex flex-col overflow-hidden shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]">

          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border-glass shrink-0 bg-gradient-to-r from-primary/10 to-secondary/10">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold m-0 text-text-main">Store Attendant</h3>
              <p className="text-[0.7rem] text-text-dim m-0">AI-powered shopping assistant</p>
            </div>
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" title="Online" />
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3" id="ai-attendant-messages">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                {/* Message Bubble */}
                <div className={`
                  max-w-[85%] px-4 py-2.5 text-[0.85rem] leading-relaxed
                  ${msg.role === 'user'
                    ? 'bg-primary text-white rounded-2xl rounded-br-md'
                    : 'bg-white/[0.06] border border-border-glass text-text-main rounded-2xl rounded-bl-md'
                  }
                `}>
                  {msg.text.split('\n').map((line, i) => (
                    <p key={i} className="m-0 mb-1 last:mb-0">{renderText(line)}</p>
                  ))}
                </div>

                {/* Product Suggestion Cards */}
                {msg.suggestedProducts && msg.suggestedProducts.length > 0 && (
                  <div className="w-full flex flex-col gap-2 mt-1">
                    {msg.suggestedProducts.map((product) => {
                      const pId = product.id || (product as any)._id || '';
                      const avail = product.availableStock !== undefined
                        ? product.availableStock
                        : Math.max(0, (product.count ?? 0) - (product.reservedCount ?? 0));
                      const oos = product.isOutOfStock || avail <= 0;

                      return (
                        <div key={pId} className="flex items-center gap-3 p-3 bg-white/[0.04] border border-border-glass rounded-xl hover:border-primary/30 transition-all group">
                          {/* Product Thumbnail */}
                          <div className="w-12 h-12 rounded-lg overflow-hidden bg-white/5 shrink-0">
                            {product.imageUrl ? (
                              <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-text-dim text-[0.6rem]">IMG</div>
                            )}
                          </div>

                          {/* Product Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-text-main m-0 truncate">{product.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-primary font-bold text-xs">${product.price.toFixed(2)}</span>
                              <span className="text-[0.6rem] text-text-dim px-1.5 py-0.5 bg-primary/10 rounded-full">{product.tag}</span>
                            </div>
                          </div>

                          {/* Add to Basket Button */}
                          <button
                            suppressHydrationWarning
                            onClick={() => handleAddToBasket(product)}
                            disabled={oos}
                            className={`
                              shrink-0 px-3 py-1.5 rounded-lg text-[0.7rem] font-bold
                              border-none cursor-pointer transition-all duration-200
                              ${oos
                                ? 'bg-white/5 text-text-dim cursor-not-allowed'
                                : 'bg-primary text-white hover:bg-[#4f46e5] hover:shadow-[0_0_15px_rgba(99,102,241,0.4)] active:scale-95'
                              }
                            `}
                          >
                            {oos ? 'Out' : '+ Add'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}

            {/* Typing Indicator */}
            {isLoading && (
              <div className="flex items-start">
                <div className="bg-white/[0.06] border border-border-glass rounded-2xl rounded-bl-md px-4 py-3 flex gap-1.5">
                  <span className="w-2 h-2 bg-text-dim rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-text-dim rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-text-dim rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="px-4 py-3 border-t border-border-glass shrink-0 bg-bg-surface/50">
            <div className="flex items-center gap-2">
              <input
                suppressHydrationWarning
                ref={inputRef}
                type="text"
                placeholder="Ask me anything about our designs..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                className="flex-1 bg-white/[0.05] border border-border-glass text-text-main px-4 py-2.5 rounded-xl text-[0.85rem] outline-none transition-all focus:border-primary placeholder:text-text-dim/50 disabled:opacity-50"
              />
              <button
                suppressHydrationWarning
                onClick={sendMessage}
                disabled={isLoading || !input.trim()}
                className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center border-none cursor-pointer transition-all hover:bg-[#4f46e5] disabled:opacity-30 disabled:cursor-not-allowed shrink-0 active:scale-95"
                aria-label="Send message"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
            <p className="text-[0.6rem] text-text-dim/40 text-center mt-2 m-0">Powered by Stitch-Opt AI</p>
          </div>
        </div>
      </div>
    </>
  );
}
