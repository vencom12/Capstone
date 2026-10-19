'use client';

import React, { useState, useEffect, useRef } from 'react';
import { API_BASE } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import { useAuthStore } from '@/stores/useAuthStore';

// Type declarations for Web Speech API
const SpeechRecognition = typeof window !== 'undefined'
  ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
  : null;

interface ChatMessage {
  id: string;
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

const createMsgId = () => `copilot_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

interface QuickPrompt {
  id: string;
  label: string;
  prompt: string;
  icon: React.ReactNode;
}

const quickPrompts: QuickPrompt[] = [
  {
    id: 'rush',
    label: 'Rush Orders',
    prompt: 'Show all urgent and rush orders in the queue right now.',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
    )
  },
  {
    id: 'low-stock',
    label: 'Low Stock',
    prompt: 'Check all low stock products, depleted variants, and raw material stockpiles.',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
        <path d="m3.3 7 8.7 5 8.7-5"/>
        <path d="M12 22V12"/>
      </svg>
    )
  },
  {
    id: 'variant-stock',
    label: 'Variant Stock',
    prompt: 'Show real-time stock and available variants for all catalog products.',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
      </svg>
    )
  },
  {
    id: 'acquisition',
    label: 'Acquisition Form',
    prompt: 'Create acquisition and purchase requisition form for all low stock items and materials.',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    )
  },
  {
    id: 'machines',
    label: 'Machine Fleet',
    prompt: 'Show current embroidery machine fleet status and operator assignments.',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="6" width="20" height="12" rx="2"/>
        <circle cx="12" cy="12" r="3"/>
        <path d="M6 12h.01M18 12h.01"/>
      </svg>
    )
  },
  {
    id: 'revenue',
    label: 'Revenue Snapshot',
    prompt: 'Show today\'s financial and sales revenue breakdown.',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23"/>
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    )
  },
  {
    id: 'summary',
    label: 'Today\'s Summary',
    prompt: 'Summarize today\'s workshop throughput and pending production tasks.',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"/>
        <line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    )
  }
];

export default function PersistentAssistant() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [isOpen, setIsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'chat' | 'logs'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: createMsgId(),
      sender: 'ai',
      text: 'Hello! I am **StitchMaster AI**. I have live conversational access to the workshop database. I can audit product variant stock, track low materials, analyze sales, prioritize queues, and manage machine throughput. How can I help you today?'
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [logs, setLogs] = useState<AiLogEntry[]>([]);
  const [sessionTokens, setSessionTokens] = useState<number>(0);
  const [lastTokensUsed, setLastTokensUsed] = useState<number | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chipsScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkChipsScroll = () => {
    if (chipsScrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = chipsScrollRef.current;
      setCanScrollLeft(scrollLeft > 6);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 6);
    }
  };

  const scrollChips = (direction: 'left' | 'right') => {
    if (chipsScrollRef.current) {
      const offset = direction === 'left' ? -180 : 180;
      chipsScrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
      setTimeout(checkChipsScroll, 250);
    }
  };

  // Hydration safety mount check
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    const timer = setTimeout(checkChipsScroll, 250);
    window.addEventListener('resize', checkChipsScroll);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', checkChipsScroll);
    };
  }, [isOpen]);

  // Voice Typing States
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const isTypingRef = useRef(isTyping);
  useEffect(() => {
    isTypingRef.current = isTyping;
  }, [isTyping]);

  const sendPromptRef = useRef<(text: string) => Promise<void>>(async () => {});

  // Listen for custom event from sidebar / header to open the assistant
  useEffect(() => {
    const handleToggle = (e?: any) => {
      const query = e?.detail?.query;
      if (query) {
        setIsOpen(true);
        setViewMode('chat');
        setTimeout(() => sendPromptRef.current(query), 120);
      } else {
        setIsOpen((prev) => !prev);
      }
    };
    const handleOpenWithQuery = (e: any) => {
      const query = e?.detail?.query;
      setIsOpen(true);
      setViewMode('chat');
      if (query) {
        setTimeout(() => sendPromptRef.current(query), 120);
      }
    };
    window.addEventListener('toggleAIAssistant', handleToggle as EventListener);
    window.addEventListener('openAIAssistantWithQuery', handleOpenWithQuery as EventListener);
    return () => {
      window.removeEventListener('toggleAIAssistant', handleToggle as EventListener);
      window.removeEventListener('openAIAssistantWithQuery', handleOpenWithQuery as EventListener);
    };
  }, []);

  // Docking side (right or left) for desktop users
  const [dockSide, setDockSide] = useState<'right' | 'left'>('right');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('stitchmaster_ai_dock_side');
      if (saved === 'left' || saved === 'right') {
        setDockSide(saved);
      }
    } catch (e) {}
  }, []);

  const toggleDockSide = () => {
    const nextSide = dockSide === 'right' ? 'left' : 'right';
    setDockSide(nextSide);
    try {
      localStorage.setItem('stitchmaster_ai_dock_side', nextSide);
    } catch (e) {}
  };

  // Keyboard shortcut Ctrl+J or Cmd+J to toggle Copilot
  useEffect(() => {
    const handleShortcuts = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'j' || e.key === 'J')) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleShortcuts);
    return () => window.removeEventListener('keydown', handleShortcuts);
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && viewMode === 'chat') {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, viewMode]);

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

  // Send a prompt text
  const sendPromptText = async (textToSend: string) => {
    const userText = textToSend.trim();
    if (!userText || isTypingRef.current) return;

    const newMsg: ChatMessage = { id: createMsgId(), sender: 'user', text: userText };
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
          history: messagesRef.current.map(m => ({
            role: m.sender === 'user' ? 'user' : 'bot',
            text: m.text
          })).slice(-6)
        }),
        credentials: 'include'
      });

      const data = await response.json();
      if (data.success || data.reply) {
        const tokens = typeof data.tokensUsed === 'number' ? data.tokensUsed : 0;
        setSessionTokens((prev) => prev + tokens);
        setLastTokensUsed(tokens);
        setMessages((prev) => [
          ...prev,
          { id: createMsgId(), sender: 'ai', text: data.reply }
        ]);
        fetchLogs();
      } else {
        setMessages((prev) => [
          ...prev,
          { id: createMsgId(), sender: 'ai', text: "Sorry, I couldn't complete that action. Please check server logs." }
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: createMsgId(), sender: 'ai', text: 'Error connecting to StitchMaster AI automation engine.' }
      ]);
    } finally {
      setIsTyping(false);
    }
  };
  sendPromptRef.current = sendPromptText;

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    sendPromptText(inputValue);
  };

  // State for 1-click copy feedback in code snippets
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  const handleCopyCode = (code: string, id: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setCopiedCodeId(id);
      setTimeout(() => setCopiedCodeId(null), 2000);
    }
  };

  // Status Badge Highlighting helper
  const renderStatusBadges = (text: string): React.ReactNode => {
    const trimmed = text.trim();
    const upper = trimmed.toUpperCase();

    if (upper === 'LOW_STOCK' || upper === 'LOW STOCK' || upper === 'PARTIAL_STOCK' || upper === 'PARTIAL STOCK' || upper === 'DEPLETED') {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.7rem] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">Low Stock</span>;
    }
    if (upper === 'HEALTHY' || upper === 'STABLE') {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.7rem] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Healthy</span>;
    }
    if (upper === 'CRITICAL' || upper === 'CRITICAL_OUT' || upper === 'OUT OF STOCK') {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.7rem] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse">Critical Out</span>;
    }
    if (['ORDER DELIVERED', 'DELIVERED', 'COMPLETED'].includes(upper)) {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.7rem] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Delivered</span>;
    }
    if (['PREPARING ORDER', 'PREPARING', 'IN STITCHING'].includes(upper)) {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.7rem] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">Preparing</span>;
    }
    if (['IN QUEUE', 'QUEUE'].includes(upper)) {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.7rem] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">In Queue</span>;
    }
    if (['IN TRANSIT', 'TRANSIT'].includes(upper)) {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.7rem] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">In Transit</span>;
    }
    if (['RUNNING', 'ACTIVE'].includes(upper)) {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.7rem] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">Running</span>;
    }
    if (['IDLE', 'STANDBY'].includes(upper)) {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.7rem] font-bold bg-slate-500/20 text-slate-300 border border-slate-500/30">Idle</span>;
    }
    if (['MAINTENANCE', 'OFFLINE'].includes(upper)) {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.7rem] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">Maintenance</span>;
    }
    if (['PENDING_APPROVAL', 'PENDING APPROVAL', 'DRAFT'].includes(upper)) {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.7rem] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">Pending Approval</span>;
    }
    return text;
  };

  // Inline formatting helper
  const renderTextInline = (text: string): React.ReactNode[] => {
    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        const inner = part.slice(2, -2);
        return <strong key={i} className="font-bold text-text-main">{renderStatusBadges(inner)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        const inner = part.slice(1, -1);
        return <em key={i} className="italic text-text-main/90">{renderStatusBadges(inner)}</em>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        const inner = part.slice(1, -1);
        const badge = renderStatusBadges(inner);
        if (badge !== inner) {
          return <React.Fragment key={i}>{badge}</React.Fragment>;
        }
        return (
          <code
            key={i}
            className="bg-sky-500/10 text-sky-300 font-mono text-[0.74rem] px-1.5 py-0.5 rounded border border-sky-500/25 font-semibold"
          >
            {inner}
          </code>
        );
      }
      return <span key={i}>{renderStatusBadges(part)}</span>;
    });
  };

  // Markdown parsing engine with Tables, Badges, Lists, Headings, and Fenced Code Blocks
  const renderMessageContent = (text: string) => {
    if (!text) return null;
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let currentTable: string[][] = [];
    let isInsideTable = false;
    let currentList: { items: string[]; type: 'bullet' | 'ordered' } | null = null;
    let currentCode: { lang: string; lines: string[] } | null = null;

    const flushCode = (key: number) => {
      if (!currentCode) return;
      const codeText = currentCode.lines.join('\n');
      const snippetId = `code_${key}`;
      const isCopied = copiedCodeId === snippetId;
      elements.push(
        <div key={`code-${key}`} className="my-2.5 rounded-xl border border-white/10 bg-black/40 overflow-hidden text-left shadow-lg">
          <div className="flex items-center justify-between px-3 py-1.5 bg-white/5 border-b border-white/10 text-[0.7rem] text-text-dim">
            <span className="font-mono uppercase tracking-wider text-text-dim/80 text-[0.66rem] font-semibold">
              {currentCode.lang || 'Message Template'}
            </span>
            <button
              type="button"
              onClick={() => handleCopyCode(codeText, snippetId)}
              className="px-2 py-0.5 rounded text-[0.68rem] font-bold bg-white/10 hover:bg-white/20 text-text-main border border-white/10 transition-colors flex items-center gap-1 cursor-pointer"
            >
              {isCopied ? (
                <span className="text-emerald-400 font-bold">✓ Copied!</span>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
          <pre className="p-3 m-0 text-[0.76rem] font-mono leading-relaxed text-emerald-300 overflow-x-auto whitespace-pre selection:bg-emerald-500/30">
            {codeText}
          </pre>
        </div>
      );
      currentCode = null;
    };

    const flushTable = (key: number) => {
      if (currentTable.length === 0) return;

      const isSeparator = (row: string[]) => row.length > 0 && row.every(cell => /^[\s:\-]+$/.test(cell.trim()));
      const sepIdx = currentTable.findIndex(isSeparator);

      let headers: string[] = [];
      let dataRows: string[][] = [];

      if (sepIdx > 0) {
        headers = currentTable[sepIdx - 1];
        dataRows = currentTable.filter((_, idx) => idx !== sepIdx - 1 && idx !== sepIdx);
      } else {
        const nonSep = currentTable.filter(r => !isSeparator(r));
        if (nonSep.length > 0) {
          headers = nonSep[0];
          dataRows = nonSep.slice(1);
        }
      }

      if (headers.length > 0) {
        elements.push(
          <div key={`table-${key}`} className="w-full overflow-x-auto my-2.5 rounded-xl border border-white/10 bg-white/[0.03] shadow-inner">
            <table className="w-full border-collapse text-[0.78rem] text-left">
              <thead>
                <tr className="border-b border-border-glass bg-white/10 font-bold text-text-main">
                  {headers.map((h, i) => (
                    <th key={i} className="px-3 py-2.5 font-bold tracking-wider uppercase text-[0.72rem] text-text-main border-r border-white/5 last:border-r-0">
                      {renderTextInline(h.trim())}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-white/5 hover:bg-white/[0.03] last:border-none transition-colors">
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="px-3 py-2.5 font-medium text-text-main border-r border-white/5 last:border-r-0">
                        {renderTextInline(cell.trim())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      currentTable = [];
      isInsideTable = false;
    };

    const flushList = (key: number) => {
      if (!currentList) return;
      const { items, type } = currentList;
      const ListTag = type === 'ordered' ? 'ol' : 'ul';
      const listClass = type === 'ordered' ? 'list-decimal pl-5 my-1.5 flex flex-col gap-1 text-[0.82rem]' : 'list-disc pl-5 my-1.5 flex flex-col gap-1 text-[0.82rem]';
      elements.push(
        <ListTag key={`list-${key}`} className={listClass}>
          {items.map((item, idx) => (
            <li key={idx} className="text-text-main leading-relaxed">
              {renderTextInline(item)}
            </li>
          ))}
        </ListTag>
      );
      currentList = null;
    };

    let elementKey = 0;
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      const trimmed = line.trim();

      // Fenced Code Block handling (```)
      if (trimmed.startsWith('```')) {
        if (currentCode) {
          flushCode(elementKey++);
        } else {
          if (isInsideTable) flushTable(elementKey++);
          if (currentList) flushList(elementKey++);
          const lang = trimmed.replace(/^```/, '').trim();
          currentCode = { lang, lines: [] };
        }
        continue;
      }
      if (currentCode) {
        currentCode.lines.push(line);
        continue;
      }

      // Markdown Table Handling
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        if (currentList) flushList(elementKey++);
        isInsideTable = true;
        const cols = line.split('|').slice(1, -1);
        currentTable.push(cols);
        continue;
      } else if (isInsideTable) {
        flushTable(elementKey++);
      }

      if (trimmed.startsWith('###')) {
        if (currentList) flushList(elementKey++);
        elements.push(
          <h4 key={elementKey++} className="text-[0.9rem] font-bold text-text-main mt-3 mb-1.5 first:mt-0 tracking-tight">
            {renderTextInline(trimmed.replace(/^###\s*/, ''))}
          </h4>
        );
        continue;
      } else if (trimmed.startsWith('##')) {
        if (currentList) flushList(elementKey++);
        elements.push(
          <h3 key={elementKey++} className="text-[1.0rem] font-bold text-text-main mt-4 mb-2 first:mt-0 tracking-tight">
            {renderTextInline(trimmed.replace(/^##\s*/, ''))}
          </h3>
        );
        continue;
      }

      const bulletMatch = trimmed.match(/^[*+-]\s+(.*)/);
      const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)/);

      if (bulletMatch) {
        if (currentList && currentList.type !== 'bullet') flushList(elementKey++);
        if (!currentList) currentList = { items: [], type: 'bullet' };
        currentList.items.push(bulletMatch[1]);
        continue;
      } else if (orderedMatch) {
        if (currentList && currentList.type !== 'ordered') flushList(elementKey++);
        if (!currentList) currentList = { items: [], type: 'ordered' };
        currentList.items.push(orderedMatch[2]);
        continue;
      } else if (currentList) {
        flushList(elementKey++);
      }

      if (!trimmed) continue;

      elements.push(
        <p key={elementKey++} className="m-0 mb-1.5 last:mb-0 text-[0.82rem] leading-relaxed text-text-main">
          {renderTextInline(line)}
        </p>
      );
    }

    if (currentCode) flushCode(elementKey++);
    if (isInsideTable) flushTable(elementKey++);
    if (currentList) flushList(elementKey++);
    return elements;
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[2599] md:hidden transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Slide-Over Copilot Drawer: Docked Right OR Left, Fullscreen on Mobile */}
      <aside
        className={`
          fixed top-0 z-[2600] h-full
          w-full sm:w-[450px] sm:max-w-[94vw]
          bg-bg-card/95 backdrop-blur-2xl shadow-2xl flex flex-col
          transition-transform duration-300 ease-in-out
          ${dockSide === 'left'
            ? 'left-0 border-r border-border-glass'
            : 'right-0 border-l border-border-glass'}
          ${isOpen
            ? 'translate-x-0'
            : dockSide === 'left'
              ? '-translate-x-full pointer-events-none'
              : 'translate-x-full pointer-events-none'}
        `}
        aria-label="StitchMaster AI Copilot Drawer"
      >
        {/* Header */}
        <div className="bg-bg-surface border-b border-border-glass px-4 py-3.5 flex justify-between items-center text-text-main shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-lg bg-white/10 border border-border-glass flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-main">
                <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
                <path d="M19 4v4m2-2h-4" />
              </svg>
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-[0.92rem] tracking-tight">StitchMaster AI</span>
                <span className="text-[0.6rem] text-text-dim px-1.5 py-0.2 rounded bg-white/5 border border-border-glass font-mono">
                  Copilot
                </span>
              </div>
              <p className="text-[0.68rem] text-text-dim m-0">Live Workshop Database Intelligence</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Dock Position Switcher (Desktop) */}
            <button
              type="button"
              onClick={toggleDockSide}
              className="hidden sm:flex items-center gap-1.5 text-[0.7rem] font-bold bg-white/5 hover:bg-white/10 border border-border-glass px-2 py-1.5 rounded-lg cursor-pointer transition-colors text-text-main"
              title={`Dock drawer to ${dockSide === 'right' ? 'Left' : 'Right'} side (near sidebar)`}
              aria-label="Toggle Dock Side"
            >
              {dockSide === 'right' ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                  <span>Dock Left</span>
                </>
              ) : (
                <>
                  <span>Dock Right</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                </>
              )}
            </button>

            {/* View Mode Switcher */}
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'chat' ? 'logs' : 'chat')}
              className="text-[0.72rem] font-bold bg-white/5 border border-border-glass px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors text-text-main hover:bg-white/10"
            >
              {viewMode === 'chat' ? 'Audit Logs' : 'Chat'}
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg text-text-dim hover:text-text-main hover:bg-white/10 bg-transparent border-none cursor-pointer transition-colors"
              title="Close Copilot (Esc)"
              aria-label="Close Copilot"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Drawer Body */}
        {viewMode === 'chat' ? (
          <>
            {/* Quick Action Prompt Chips Bar */}
            <div className="px-3 py-2 border-b border-border-glass/40 bg-white/[0.02] flex items-center gap-2 shrink-0 relative">
              <div className="flex items-center gap-1.5 shrink-0">
                <span
                  title={lastTokensUsed !== null ? `Last query used ${lastTokensUsed} tokens. Session total: ${sessionTokens.toLocaleString()} tokens` : 'Live session token consumption meter'}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[0.66rem] font-mono font-semibold bg-white/5 border border-border-glass text-text-dim whitespace-nowrap shrink-0 cursor-default"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${sessionTokens === 0 ? 'bg-emerald-400' : 'bg-cyan-400 animate-pulse'}`} />
                  <span>Tokens: <strong className={sessionTokens === 0 ? 'text-emerald-400 font-bold' : 'text-cyan-300 font-bold'}>{sessionTokens.toLocaleString()}</strong></span>
                  {lastTokensUsed !== null && (
                    <span className="text-[0.6rem] text-text-dim/80">
                      ({lastTokensUsed === 0 ? '0 • Fast DB' : `+${lastTokensUsed}`})
                    </span>
                  )}
                </span>
              </div>

              {/* Scrollable Container with Left/Right Navigation Arrows */}
              <div className="flex items-center gap-1 flex-1 min-w-0 relative">
                {/* Scroll Left Arrow (shows when scrolled right) */}
                {canScrollLeft && (
                  <button
                    type="button"
                    onClick={() => scrollChips('left')}
                    className="p-1 rounded-full bg-white/10 hover:bg-white/20 text-text-main border border-border-glass shadow-xs flex items-center justify-center shrink-0 cursor-pointer transition-all z-10"
                    title="Scroll left"
                    aria-label="Scroll left"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>
                )}

                {/* Chips Container */}
                <div
                  ref={chipsScrollRef}
                  onScroll={checkChipsScroll}
                  className="flex items-center gap-1.5 overflow-x-auto scrollbar-none scroll-smooth flex-1 min-w-0 py-0.5"
                >
                  {quickPrompts.filter(qp => qp.id !== 'revenue' || isAdmin).map((qp) => (
                    <button
                      key={qp.id}
                      type="button"
                      onClick={() => sendPromptText(qp.prompt)}
                      disabled={isTyping}
                      title={`${qp.label} — Instant Zero-Token DB Query`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[0.68rem] font-medium bg-white/5 hover:bg-white/10 text-text-dim hover:text-text-main border border-border-glass whitespace-nowrap cursor-pointer transition-all active:scale-95 disabled:opacity-50 shrink-0"
                    >
                      <span className="text-text-dim shrink-0">{qp.icon}</span>
                      <span>{qp.label}</span>
                    </button>
                  ))}
                </div>

                {/* Scroll Right Arrow indicator (shows when more commands exist to the right) */}
                {canScrollRight && (
                  <button
                    type="button"
                    onClick={() => scrollChips('right')}
                    className="p-1 rounded-full bg-white/10 hover:bg-white/20 text-cyan-300 hover:text-white border border-cyan-500/30 hover:border-cyan-500/60 shadow-sm flex items-center justify-center shrink-0 cursor-pointer transition-all animate-pulse z-10"
                    title="More quick commands available (Click to scroll)"
                    aria-label="Scroll right for more commands"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-bg-surface/50">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex w-full ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`
                    max-w-[88%] p-3 rounded-xl text-[0.84rem] leading-relaxed text-left
                    ${msg.sender === 'user'
                      ? 'bg-white/15 text-text-main rounded-br-sm border border-border-glass whitespace-pre-wrap font-medium shadow-xs'
                      : 'bg-white/[0.05] text-text-main rounded-bl-sm border border-border-glass'}
                  `}>
                    {msg.sender === 'user' ? msg.text : renderMessageContent(msg.text)}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex w-full justify-start">
                  <div className="bg-white/5 text-text-dim rounded-xl rounded-bl-sm border border-border-glass p-2.5 text-[0.75rem] flex items-center gap-2 animate-pulse">
                    <span>🧵</span>
                    <span>Querying workshop database and generating insights...</span>
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Input Form */}
            <form onSubmit={handleSend} className="p-3 bg-bg-surface border-t border-border-glass shrink-0">
              <div className="flex items-center gap-2 bg-white/[0.04] border border-border-glass rounded-xl p-1 pr-1.5 focus-within:border-border-glass/80 transition-colors">
                {isClient && SpeechRecognition && (
                  <button
                    onClick={startListening}
                    type="button"
                    className={`
                      w-8 h-8 rounded-lg flex items-center justify-center border transition-all duration-200 shrink-0 cursor-pointer ml-0.5
                      ${isListening
                        ? 'bg-danger/20 border-danger/40 text-danger animate-pulse'
                        : 'bg-white/[0.05] border-transparent text-text-dim hover:text-text-main hover:bg-white/10'
                      }
                    `}
                    title={isListening ? 'Stop listening' : 'Start voice typing'}
                    aria-label="Voice input"
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
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Ask copilot about orders, inventory, sales..."
                  className="flex-1 bg-transparent border-none text-text-main outline-none px-2 py-2 text-[0.84rem] placeholder:text-text-dim/60"
                />
                <button
                  type="submit"
                  disabled={!inputValue.trim() || isTyping}
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 border border-border-glass text-text-main flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0 active:scale-95"
                  title="Send message"
                  aria-label="Send message"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </button>
              </div>
            </form>
          </>
        ) : (
          /* Audit Logs View */
          <div className="flex-1 overflow-y-auto p-4 bg-bg-surface/50 flex flex-col gap-3 text-left">
            <div className="flex items-center justify-between pb-2 border-b border-border-glass">
              <h4 className="text-xs font-bold text-text-main m-0 uppercase tracking-wider">AI Automated Action Registry</h4>
              <button
                type="button"
                onClick={fetchLogs}
                className="text-[0.65rem] text-text-dim hover:text-text-main bg-white/5 border border-border-glass px-2 py-0.5 rounded cursor-pointer transition-colors"
              >
                Refresh
              </button>
            </div>
            {logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center text-text-dim flex-1 gap-2 p-6">
                <span className="text-xl">📋</span>
                <p className="text-xs m-0">No automated database changes recorded in current session.</p>
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="bg-white/5 border border-border-glass rounded-xl p-3 flex flex-col gap-1.5 backdrop-blur-sm">
                  <div className="flex justify-between items-start">
                    <span className="bg-white/10 text-text-main border border-border-glass text-[0.65rem] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                      {log.action}
                    </span>
                    <span className="text-[0.65rem] text-text-dim font-mono">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-xs text-text-main m-0 leading-relaxed font-medium">{log.details}</p>
                  <span className="text-[0.6rem] text-text-dim font-mono block text-right mt-1">Audit ID: {log.id}</span>
                </div>
              ))
            )}
          </div>
        )}
      </aside>
    </>
  );
}
