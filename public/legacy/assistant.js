/**
 * StitchMaster AI v4 — ChatGPT-Style Conversational Engine
 * Uses fuzzy intent matching, conversation memory, and deep data analysis.
 */
const Assistant = {
    EL: { msgs: 'ai-chat-messages', input: 'ai-chat-input' },
    memory: [],
    maxMemory: 10,

    init() {
        const input = document.getElementById(this.EL.input);
        if (!input) return;
        input.addEventListener('keypress', e => {
            if (e.key === 'Enter' && input.value.trim()) {
                const text = input.value.trim();
                this.addMsg(text, 'user');
                this.memory.push({ role: 'user', text });
                if (this.memory.length > this.maxMemory) this.memory.shift();
                this.think(text);
                input.value = '';
            }
        });
        setTimeout(() => {
            const u = window.AuthManager?.getSession()?.user;
            this.reply(`Hi${u ? ' ' + u.username : ''}! I'm StitchMaster AI, your production assistant. I can answer questions about orders, products, inventory, revenue, staff, and more. Just ask me anything naturally!`);
        }, 800);
    },

    addMsg(text, who) {
        const c = document.getElementById(this.EL.msgs);
        if (!c) return;
        const d = document.createElement('div');
        d.style.cssText = `padding:12px 16px;border-radius:16px;font-size:0.9rem;max-width:85%;line-height:1.5;margin-bottom:10px;box-shadow:0 2px 8px rgba(0,0,0,0.15);${who === 'user' ? 'align-self:flex-end;background:linear-gradient(135deg,var(--primary),#4f46e5);color:white;border-bottom-right-radius:4px;' : 'align-self:flex-start;background:rgba(255,255,255,0.07);color:var(--text-main);border:1px solid var(--border-glass);border-bottom-left-radius:4px;'}`;
        d.innerHTML = text.replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--primary)">$1</strong>').replace(/\n/g, '<br>');
        c.appendChild(d);
        c.scrollTop = c.scrollHeight;
    },

    reply(text) {
        const c = document.getElementById(this.EL.msgs);
        const dot = document.createElement('div');
        dot.id = 'ai-typing';
        dot.style.cssText = 'font-size:0.75rem;color:var(--text-dim);padding:6px 12px;font-style:italic;';
        dot.textContent = 'Thinking...';
        c?.appendChild(dot); c && (c.scrollTop = c.scrollHeight);
        setTimeout(() => {
            dot.remove();
            this.addMsg(text, 'bot');
            this.memory.push({ role: 'bot', text });
        }, 500 + Math.random() * 700);
    },

    // --- Data Helpers ---
    data() {
        const s = window.State?._cache || {};
        const orders = s.orders || [];
        const now = new Date();
        const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const soy = new Date(sod); soy.setDate(sod.getDate() - 1);
        const sow = new Date(sod); sow.setDate(sod.getDate() - 7);
        return {
            orders, products: s.products || [], inventory: s.inventory || [],
            users: s.users || [], transactions: s.transactions || [],
            revenue: s.analytics?.revenue || 0, machine: s.machine,
            active: orders.filter(o => !['Order Delivered','Order Canceled','Completed'].includes(o.status)),
            today: orders.filter(o => new Date(o.date || o.createdAt) >= sod),
            yesterday: orders.filter(o => { const d = new Date(o.date || o.createdAt); return d >= soy && d < sod; }),
            week: orders.filter(o => new Date(o.date || o.createdAt) >= sow),
            lowStock: (s.inventory || []).filter(i => i.count < 10),
            delivered: orders.filter(o => o.status === 'Order Delivered' || o.status === 'Completed'),
            canceled: orders.filter(o => o.status === 'Order Canceled'),
            queue: orders.filter(o => o.status === 'In Queue'),
            processing: orders.filter(o => o.status === 'Processing' || o.status === 'Stitching'),
            now, sod, soy
        };
    },

    role() { return window.AuthManager?.getSession()?.user?.role || 'guest'; },
    user() { return window.AuthManager?.getSession()?.user || {}; },    // --- AI Brain Upgrade ---
    async think(text) {
        const q = text.toLowerCase();
        const d = this.data();
        
        // Quick Local Responses (Low latency for basic commands)
        if (q.match(/^(hi|hello|hey|yo)/)) return this.reply(`Hey there! 👋 I'm **StitchMaster AI**, upgraded with **Gemini 1.5 Flash**. I have eyes on all **${d.orders.length}** orders and **${d.inventory.length}** inventory items. Ask me anything!`);
        if (q.match(/clear (chat|memory|history)/)) { this.memory = []; return this.reply("Memory cleared! What's our new focus?"); }

        // Call the Backend AI
        this.callAI(text);
    },

    async callAI(message) {
        const c = document.getElementById(this.EL.msgs);
        const dot = document.createElement('div');
        dot.id = 'ai-typing';
        dot.style.cssText = 'font-size:0.75rem;color:var(--text-dim);padding:6px 12px;font-style:italic;';
        dot.textContent = 'StitchMaster is analyzing data...';
        c?.appendChild(dot); c && (c.scrollTop = c.scrollHeight);

        try {
            const response = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': document.cookie.split('; ').find(row => row.startsWith('csrfToken='))?.split('=')[1]
                },
                body: JSON.stringify({
                    message,
                    context: this.data(),
                    history: this.memory.slice(-6) // Send last 3 exchanges
                })
            });

            const data = await response.json();
            dot.remove();

            if (data.success) {
                this.addMsg(data.reply, 'bot');
                this.memory.push({ role: 'bot', text: data.reply });
            } else {
                this.reply("I'm having a bit of trouble connecting to my central brain. 🧠 Check if your **Gemini API Key** is set in the .env file!");
            }

        } catch (error) {
            dot.remove();
            console.error('AI Error:', error);
            this.reply("System error during analysis. Please check your connection.");
        }
    }
};

window.Assistant = Assistant;
if (!document.getElementById('ai-styles')) {
    const s = document.createElement('style');
    s.id = 'ai-styles';
    s.textContent = '@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}.chat-msg strong{color:var(--primary)}';
    document.head.appendChild(s);
}
document.addEventListener('DOMContentLoaded', () => Assistant.init());
