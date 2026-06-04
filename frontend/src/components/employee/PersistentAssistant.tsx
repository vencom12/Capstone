'use client';

import { useState, useEffect, useRef } from 'react';
import { API_BASE } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';

// Type declarations for Web Speech API
const SpeechRecognition = typeof window !== 'undefined'
  ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
  : null;

interface ChatMessage {
  id: number;
  sender: 'user' | 'ai';
  text: string;
}

interface AiLogEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  details: string;
}

export default function PersistentAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'chat' | 'logs'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 1, sender: 'ai', text: 'Hello operator! I am StitchMaster AI. I have full conversational access to the database. I can analyze recent sales, provide strategies, and automate orders or material stockpiles. How can I help you today?' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [logs, setLogs] = useState<AiLogEntry[]>([]);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Voice Typing States
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Dragging States
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; posX: number; posY: number }>({ startX: 0, startY: 0, posX: 0, posY: 0 });

  useEffect(() => {
    // Listen for custom event from sidebar to open the assistant
    const handleToggle = () => setIsOpen((prev) => !prev);
    window.addEventListener('toggleAIAssistant', handleToggle);
    return () => window.removeEventListener('toggleAIAssistant', handleToggle);
  }, []);

  useEffect(() => {
    if (chatBottomRef.current && viewMode === 'chat') {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, viewMode]);

  // Fetch AI Action Logs
  const fetchLogs = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/ai/logs`, {
        credentials: 'include'
      });
      const data = await response.json();
      if (data.success) {
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Failed to fetch AI logs:', err);
    }
  };

  useEffect(() => {
    if (isOpen && viewMode === 'logs') {
      fetchLogs();
    }
  }, [isOpen, viewMode]);

  // Handle Dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('a')) return;
    setIsDragging(true);
    const initX = position ? position.x : window.innerWidth - 374;
    const initY = position ? position.y : window.innerHeight - 524;
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: initX,
      posY: initY
    };
    e.preventDefault();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('a')) return;
    setIsDragging(true);
    const touch = e.touches[0];
    const initX = position ? position.x : window.innerWidth - 374;
    const initY = position ? position.y : window.innerHeight - 524;
    dragStartRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      posX: initX,
      posY: initY
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.startX;
      const dy = e.clientY - dragStartRef.current.startY;
      
      let newX = dragStartRef.current.posX + dx;
      let newY = dragStartRef.current.posY + dy;

      // Viewport bounds clipping
      const padding = 10;
      newX = Math.max(padding, Math.min(newX, window.innerWidth - 350 - padding));
      newY = Math.max(padding, Math.min(newY, window.innerHeight - 500 - padding));

      setPosition({ x: newX, y: newY });
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      const dx = touch.clientX - dragStartRef.current.startX;
      const dy = touch.clientY - dragStartRef.current.startY;
      
      let newX = dragStartRef.current.posX + dx;
      let newY = dragStartRef.current.posY + dy;

      const padding = 10;
      newX = Math.max(padding, Math.min(newX, window.innerWidth - 350 - padding));
      newY = Math.max(padding, Math.min(newY, window.innerHeight - 500 - padding));

      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging]);

  // Start/Stop voice listening
  const startListening = () => {
    if (!SpeechRecognition) {
      showToast('Speech recognition is not supported in this browser.', 'error');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    try {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';

      rec.onstart = () => {
        setIsListening(true);
        showToast('Listening... Speak now!', 'info');
      };

      rec.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputValue((prev) => {
          const spacing = prev.trim() ? ' ' : '';
          return prev + spacing + transcript;
        });
      };

      rec.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          showToast('Microphone access denied. Please check site permissions.', 'error');
        } else if (event.error !== 'aborted') {
          showToast('Speech recognition failed. Try again.', 'error');
        }
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
      rec.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setIsListening(false);
    }
  };

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  // Conversational AI completion caller
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isTyping) return;

    const userText = inputValue.trim();
    const newMsg: ChatMessage = { id: Date.now(), sender: 'user', text: userText };
    setMessages((prev) => [...prev, newMsg]);
    setInputValue('');
    setIsTyping(true);

    try {
      const response = await fetch(`${API_BASE}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userText,
          history: messages.map(m => ({
            role: m.sender === 'user' ? 'user' : 'bot',
            text: m.text
          })).slice(-6)
        }),
        credentials: 'include'
      });

      const data = await response.json();
      if (data.success || data.reply) {
        setMessages((prev) => [
          ...prev,
          { id: Date.now() + 1, sender: 'ai', text: data.reply }
        ]);
        // Silently reload change logs in case AI performed database mutations
        fetchLogs();
      } else {
        setMessages((prev) => [
          ...prev,
          { id: Date.now() + 1, sender: 'ai', text: 'Sorry, I couldn\'t complete that action. Please check server logs.' }
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, sender: 'ai', text: 'Error connecting to StitchMaster AI automation engine.' }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <>
      {/* Floating Bubble */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-[9999] w-14 h-14 bg-primary text-white rounded-full flex items-center justify-center shadow-[0_10px_25px_rgba(99,102,241,0.5)] cursor-pointer hover:scale-110 transition-transform duration-300 border-none"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m12 8-9.04 9.06a2.82 2.82 0 1 0 3.98 3.98L16 12" /><circle cx="17" cy="7" r="5" /></svg>
        </button>
      )}

      {/* Persistent Window */}
      {isOpen && (
        <div 
          style={position ? { top: `${position.y}px`, left: `${position.x}px`, bottom: 'auto', right: 'auto' } : undefined}
          className="fixed bottom-6 right-6 z-[10000] w-[350px] h-[500px] bg-bg-card backdrop-blur-[15px] border border-border-glass rounded-[20px] shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden max-[650px]:bottom-0 max-[650px]:right-0 max-[650px]:w-full max-[650px]:h-[60vh] max-[650px]:rounded-b-none max-[650px]:rounded-t-[20px] animate-[modalScaleUp_0.3s_cubic-bezier(0.34,1.56,0.64,1)]"
        >
          {/* Header */}
          <div 
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            className="bg-gradient-to-r from-primary to-secondary p-4 flex justify-between items-center text-white cursor-grab select-none shrink-0"
          >
            <div className="flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m12 8-9.04 9.06a2.82 2.82 0 1 0 3.98 3.98L16 12" /><circle cx="17" cy="7" r="5" /></svg>
              <span className="font-bold text-[0.95rem] tracking-tight">StitchMaster AI</span>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Toggler Logs Button */}
              <button 
                onClick={() => setViewMode(viewMode === 'chat' ? 'logs' : 'chat')} 
                className="text-xs font-bold bg-white/10 hover:bg-white/20 border border-white/20 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors text-white"
              >
                {viewMode === 'chat' ? '📋 Audit Logs' : '💬 Chat Assistant'}
              </button>
              
              <button onClick={() => setIsOpen(false)} className="text-white hover:text-white/70 bg-transparent border-none cursor-pointer p-1">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
          </div>

          {/* Body Section */}
          {viewMode === 'chat' ? (
            <>
              {/* Chat View */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-black/20">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex w-full ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`
                      max-w-[85%] p-3 rounded-2xl text-[0.9rem] leading-relaxed whitespace-pre-wrap text-left
                      ${msg.sender === 'user' 
                        ? 'bg-primary text-white rounded-br-sm' 
                        : 'bg-white/10 text-text-main rounded-bl-sm border border-border-glass'}
                    `}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex w-full justify-start">
                    <div className="bg-white/10 text-text-dim rounded-2xl rounded-bl-sm border border-border-glass p-3 text-[0.8rem] italic animate-pulse">
                      Analyzing and updating system context...
                    </div>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Input Area */}
              <form onSubmit={handleSend} className="p-3 bg-bg-surface border-t border-border-glass shrink-0">
                <div className="flex items-center gap-2 bg-black/30 border border-border-glass rounded-xl p-1 pr-2 focus-within:border-primary transition-colors">
                  {SpeechRecognition && (
                    <button
                      onClick={startListening}
                      type="button"
                      className={`
                        w-8 h-8 rounded-lg flex items-center justify-center border transition-all duration-200 shrink-0 cursor-pointer ml-1
                        ${isListening 
                          ? 'bg-danger/20 border-danger/40 text-danger shadow-[0_0_8px_rgba(239,68,68,0.4)] animate-pulse'
                          : 'bg-white/[0.05] border-transparent text-text-dim hover:text-text-main hover:bg-white/10'
                        }
                      `}
                      title={isListening ? 'Stop listening' : 'Start voice typing'}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                        <line x1="12" y1="19" x2="12" y2="23"/>
                        <line x1="8" y1="23" x2="16" y2="23"/>
                      </svg>
                    </button>
                  )}
                  <input 
                    type="text" 
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Ask AI, query, or command alterations..." 
                    className="flex-1 bg-transparent border-none text-text-main outline-none px-3 py-2 text-[0.9rem]"
                  />
                  <button type="submit" disabled={!inputValue.trim() || isTyping} className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-none shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                  </button>
                </div>
              </form>
            </>
          ) : (
            /* Audit logs view */
            <div className="flex-1 overflow-y-auto p-4 bg-black/20 flex flex-col gap-3 text-left">
              <h4 className="text-sm font-bold text-text-main m-0 mb-1 border-b border-border-glass pb-2">AI Change Registry Audits</h4>
              {logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center text-text-dim flex-1 gap-2 p-6">
                  <span className="text-xl">📋</span>
                  <p className="text-xs m-0">No automated database changes recorded in current session.</p>
                </div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="bg-white/5 border border-border-glass rounded-xl p-3 flex flex-col gap-1.5 backdrop-blur-sm">
                    <div className="flex justify-between items-start">
                      <span className="bg-primary/20 text-primary border border-primary/30 text-[0.65rem] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">{log.action}</span>
                      <span className="text-[0.65rem] text-text-dim font-mono">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-xs text-text-main m-0 leading-relaxed font-medium">{log.details}</p>
                    <span className="text-[0.6rem] text-text-dim font-mono block text-right mt-1">Audit ID: {log.id}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
