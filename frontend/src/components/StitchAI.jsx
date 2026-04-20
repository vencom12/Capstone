import { useState } from 'react';

const RESPONSES = {
  default: 'I am analyzing your production data. How can I assist with your embroidery projects today?',
  thread: 'Our current inventory shows Midnight Blue and Gold Metallic are in high demand. Would you like me to check other colors?',
  order: 'I see your active orders. Simulated production shows an average completion time of 45 minutes per design.',
  machine: 'Machine #4 is showing optimal tension. No maintenance required for the next 12000 stitches.',
  help: 'I can help with inventory tracking, production scheduling, and machine diagnostics. What do you need?',
  hello: 'Hello! StitchMaster AI at your service. Ready to optimize your workflow.',
};

function generateResponse(input, orders = []) {
  const text = input.toLowerCase();
  if (text.includes('optimize') || text.includes('queue') || text.includes('productivity')) {
    const active = orders.filter(o => o.status !== 'Completed' && o.status !== 'Order Canceled');
    if (active.length === 0) return "The production queue is currently empty. We are ready for new designs!";
    return `I've analyzed the ${active.length} active orders. Batch similar designs together to reduce setup time by 15%.`;
  }
  if (text.includes('thread') || text.includes('color')) return RESPONSES.thread;
  if (text.includes('order') || text.includes('status')) return RESPONSES.order;
  if (text.includes('machine') || text.includes('tension')) return RESPONSES.machine;
  if (text.includes('help')) return RESPONSES.help;
  if (text.includes('hello') || text.includes('hi')) return RESPONSES.hello;
  return RESPONSES.default;
}

export default function StitchAI({ orders = [] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { type: 'ai', text: 'Hello! StitchMaster AI at your service. How can I help manage production today?' }
  ]);
  const [input, setInput] = useState('');

  const sendMessage = () => {
    if (!input.trim()) return;
    const userMsg = input;
    setMessages(prev => [...prev, { type: 'user', text: userMsg }]);
    setInput('');

    setTimeout(() => {
      const response = generateResponse(userMsg, orders);
      setMessages(prev => [...prev, { type: 'ai', text: response }]);
    }, 800);
  };

  return (
    <>
      {/* Floating Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-[500] w-14 h-14 rounded-full flex items-center justify-center cursor-pointer border-none shadow-xl transition-transform hover:scale-110"
        style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))' }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m12 8-9.04 9.06a2.82 2.82 0 1 0 3.98 3.98L16 12" />
          <circle cx="17" cy="7" r="5" />
        </svg>
      </button>

      {/* AI Panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-[501] glass w-[380px] max-w-[90vw] p-6 flex flex-col animate-fade"
          style={{ height: '500px', maxHeight: '70vh' }}>
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold">StitchMaster AI</h3>
            <button onClick={() => setIsOpen(false)} className="cursor-pointer text-text-dim hover:text-white bg-transparent border-none text-lg">✕</button>
          </div>

          <div className="flex-1 overflow-y-auto flex flex-col gap-2 mb-3 p-3 rounded-xl"
            style={{ border: '1px solid var(--color-border-glass)' }}>
            {messages.map((msg, i) => (
              <div key={i} className={`px-3 py-2.5 rounded-2xl text-sm max-w-[85%] ${
                msg.type === 'user' ? 'self-end text-white' : 'self-start'
              }`} style={{
                background: msg.type === 'user' ? 'var(--color-primary)' : 'rgba(255,255,255,0.05)',
                border: msg.type === 'ai' ? '1px solid var(--color-border-glass)' : 'none',
              }}>
                <strong>{msg.type === 'user' ? 'You: ' : 'AI: '}</strong>{msg.text}
              </div>
            ))}
          </div>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Type a command..."
            className="input-field !rounded-lg !py-3"
          />
        </div>
      )}
    </>
  );
}
