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
    user() { return window.AuthManager?.getSession()?.user || {}; },

    // --- Intent Engine ---
    think(text) {
        const q = text.toLowerCase();
        const d = this.data();
        const r = this.role();
        const lastCtx = this.memory.filter(m => m.role === 'user').slice(-2, -1)[0]?.text?.toLowerCase() || '';

        // Follow-up detection
        if (q.match(/^(those|these|them|that|it|the ones|which ones|what about)/)) {
            if (lastCtx.includes('order')) return this.think(lastCtx + ' ' + text);
            if (lastCtx.includes('product')) return this.think(lastCtx + ' ' + text);
        }

        // Greetings
        if (q.match(/^(hi|hello|hey|good morning|good afternoon|yo|sup|what'?s up)/))
            return this.reply(`Hey ${this.user().username || 'there'}! 👋 I'm connected to your live database right now. We have **${d.orders.length}** total orders and **${d.products.length}** products in the catalog. What would you like to know?`);

        // Identity
        if (q.match(/who are you|your name|what are you/))
            return this.reply(`I'm **StitchMaster AI**, the built-in assistant for the Stitch-Opt production system. I read the live database to answer your questions about orders, products, inventory, revenue, and staff. Think of me as your personal data analyst!`);

        // Help
        if (q.match(/help|what can you do|how do you work|commands/))
            return this.reply(`Here's what I can help with:\n\n• **Orders** — "How many orders today?", "Show recent orders", "Any canceled orders?"\n• **Products** — "What's the most expensive product?", "How many products do we have?"\n• **Inventory** — "Any low stock?", "Thread status"\n• **Revenue** — "Total revenue", "How much did we make?" (Admin only)\n• **Staff** — "How many employees?", "Staff count" (Admin only)\n• **Suggestions** — "Any suggestions?", "What should I focus on?"\n\nJust ask naturally — I understand context!`);

        // --- ORDERS ---
        if (q.match(/order/)) {
            if (q.match(/today/))
                return this.reply(`We received **${d.today.length} orders today**. ${d.today.length > 0 ? 'Here are the latest:\n' + d.today.slice(0, 5).map(o => `• **${o.orderId}** — ${o.client} — ${o.status}`).join('\n') : "It's been quiet so far."}`);
            if (q.match(/yesterday/))
                return this.reply(`Yesterday we had **${d.yesterday.length} orders**. ${d.yesterday.length > 0 ? d.yesterday.slice(0, 5).map(o => `• **${o.orderId}** — ${o.client} — $${o.totalAmount}`).join('\n') : 'No orders were placed.'}`);
            if (q.match(/this week|past week|weekly/))
                return this.reply(`This week we've processed **${d.week.length} orders** in total.${d.week.length > 0 ? ' The breakdown:\n• In Queue: **' + d.queue.length + '**\n• Processing: **' + d.processing.length + '**\n• Delivered: **' + d.delivered.length + '**' : ''}`);
            if (q.match(/cancel/))
                return this.reply(d.canceled.length > 0 ? `We have **${d.canceled.length} canceled orders**:\n${d.canceled.slice(0,5).map(o => `• ${o.orderId} — ${o.client}`).join('\n')}` : 'No canceled orders found. That\'s great news! ✅');
            if (q.match(/deliver|complete|done|finish/))
                return this.reply(`**${d.delivered.length}** orders have been delivered or completed so far.`);
            if (q.match(/queue|waiting|pending/))
                return this.reply(d.queue.length > 0 ? `There are **${d.queue.length} orders** waiting in the queue:\n${d.queue.slice(0,5).map(o => `• **${o.orderId}** — ${o.client} — ${o.design}`).join('\n')}` : 'The queue is empty right now. All clear! 🎉');
            if (q.match(/process|stitch|active|current/))
                return this.reply(d.processing.length > 0 ? `Currently **${d.processing.length} orders** are being worked on:\n${d.processing.slice(0,5).map(o => `• **${o.orderId}** — ${o.design} — Progress: ${o.progress || 0}%`).join('\n')}` : 'No orders are currently in production.');
            if (q.match(/date|when|time|recent|latest|last/)) {
                const recent = d.orders.slice(0, 5);
                return this.reply(recent.length > 0 ? `Here are the most recent orders:\n${recent.map(o => `• **${o.orderId}** — ${new Date(o.date || o.createdAt).toLocaleDateString()} — ${o.client} — ${o.status}`).join('\n')}` : 'No orders found in the system.');
            }
            if (q.match(/how many|count|total|number/))
                return this.reply(`We have **${d.orders.length}** total orders in the system.\n• Active: **${d.active.length}**\n• In Queue: **${d.queue.length}**\n• Processing: **${d.processing.length}**\n• Delivered: **${d.delivered.length}**\n• Canceled: **${d.canceled.length}**`);
            // Default order response
            return this.reply(`Here's the current order overview:\n• Total: **${d.orders.length}**\n• In Queue: **${d.queue.length}**\n• Processing: **${d.processing.length}**\n• Delivered: **${d.delivered.length}**\n\n${d.active.length > 0 ? 'Most recent active order: **' + d.active[0].orderId + '** — ' + d.active[0].client + ' — ' + d.active[0].status : 'No active orders right now.'}`);
        }

        // --- PRODUCTS ---
        if (q.match(/product|design|catalog|item/)) {
            const p = d.products;
            if (q.match(/expensive|highest price|most costly/)) {
                const top = [...p].sort((a,b) => b.price - a.price).slice(0,3);
                return this.reply(top.length > 0 ? `The most expensive products:\n${top.map((x,i) => `${i+1}. **${x.name}** — $${x.price}`).join('\n')}` : 'No products found.');
            }
            if (q.match(/cheap|lowest price|affordable/)) {
                const low = [...p].sort((a,b) => a.price - b.price).slice(0,3);
                return this.reply(low.length > 0 ? `Most affordable products:\n${low.map((x,i) => `${i+1}. **${x.name}** — $${x.price}`).join('\n')}` : 'No products found.');
            }
            if (q.match(/popular|most viewed|trending/)) {
                const pop = [...p].sort((a,b) => (b.views||0) - (a.views||0)).slice(0,3);
                return this.reply(pop.length > 0 ? `Most viewed products:\n${pop.map((x,i) => `${i+1}. **${x.name}** — ${x.views||0} views`).join('\n')}` : 'No view data available yet.');
            }
            if (q.match(/how many|count|total/))
                return this.reply(`We have **${p.length} products** in the catalog.`);
            if (q.match(/new|latest|recent/)) {
                const newest = [...p].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0,3);
                return this.reply(newest.length > 0 ? `Latest products added:\n${newest.map(x => `• **${x.name}** — $${x.price} — ${x.tag}`).join('\n')}` : 'No products found.');
            }
            return this.reply(`We have **${p.length} products** in the catalog. You can ask me about the most popular, expensive, or newest ones!`);
        }

        // --- INVENTORY ---
        if (q.match(/stock|inventory|thread|material|supply/)) {
            const inv = d.inventory;
            if (inv.length === 0) return this.reply("I don't have inventory data loaded right now. Try refreshing the dashboard.");
            if (q.match(/low|running out|shortage|critical/))
                return this.reply(d.lowStock.length > 0 ? `⚠️ **${d.lowStock.length} items** are running low:\n${d.lowStock.map(i => `• **${i.item}** — only ${i.count} ${i.unit} left`).join('\n')}\n\nI'd recommend restocking these soon.` : '✅ All inventory levels are healthy. Nothing below the safety threshold.');
            return this.reply(`Inventory overview — **${inv.length} items** tracked:\n• Low stock (< 10): **${d.lowStock.length}**\n• Healthy: **${inv.length - d.lowStock.length}**${d.lowStock.length > 0 ? '\n\n⚠️ Low items: ' + d.lowStock.map(i => `**${i.item}** (${i.count})`).join(', ') : ''}`);
        }

        // --- REVENUE ---
        if (q.match(/revenue|money|sale|income|earning|profit|financ/)) {
            if (r !== 'admin') return this.reply("I can only share financial data with administrators. You'll need admin access to view revenue details.");
            const rev = parseFloat(d.revenue);
            const txs = d.transactions;
            return this.reply(`💰 Financial Summary:\n• Total Revenue: **$${rev.toLocaleString()}**\n• Total Transactions: **${txs.length}**\n• Completed: **${txs.filter(t => t.status === 'completed').length}**\n• Pending: **${txs.filter(t => t.status === 'pending').length}**${txs.length > 0 ? '\n• Avg Transaction: **$' + (rev / txs.length).toFixed(2) + '**' : ''}`);
        }

        // --- STAFF ---
        if (q.match(/staff|employee|worker|team|people|user/)) {
            if (r !== 'admin') return this.reply("Staff information is restricted to administrators.");
            const u = d.users;
            const emps = u.filter(x => x.role === 'employee');
            const custs = u.filter(x => x.role === 'customer');
            return this.reply(`👥 User Overview:\n• Total Accounts: **${u.length}**\n• Employees: **${emps.length}**\n• Customers: **${custs.length}**\n• Admins: **${u.filter(x => x.role === 'admin').length}**`);
        }

        // --- SUGGESTIONS ---
        if (q.match(/suggest|advice|recommend|focus|improve|should i|what to do|tip/)) {
            const tips = [];
            if (d.queue.length > 3) tips.push(`The queue has **${d.queue.length} orders** waiting. Consider assigning more staff to speed up processing.`);
            if (d.lowStock.length > 0) tips.push(`**${d.lowStock.length} inventory items** are critically low. Restock ${d.lowStock[0].item} first to avoid production delays.`);
            if (d.processing.length > 0 && d.processing.some(o => (o.progress||0) < 20)) tips.push('Some processing orders are stuck at low progress. Check if machines need maintenance.');
            if (d.canceled.length > 2) tips.push(`There are **${d.canceled.length} canceled orders**. It might be worth investigating why customers are canceling.`);
            if (d.products.length > 0 && d.products.some(p => (p.views||0) === 0)) tips.push('Some products have zero views. Consider updating their descriptions or images to attract more attention.');
            if (tips.length === 0) tips.push('Everything looks great! The system is running smoothly. Keep up the good work! 🎉');
            return this.reply(`Here are my suggestions:\n\n${tips.map((t,i) => `${i+1}. ${t}`).join('\n\n')}`);
        }

        // --- STATUS REPORT ---
        if (q.match(/status|report|overview|summary|dashboard|how('?s| is) (it|everything|things|the system)/))
            return this.reply(`📊 **System Status Report**\n\n**Orders:**\n• Total: ${d.orders.length} | Active: ${d.active.length} | Queue: ${d.queue.length} | Processing: ${d.processing.length}\n• Today: ${d.today.length} | Delivered: ${d.delivered.length}\n\n**Inventory:**\n• ${d.inventory.length} items tracked | ${d.lowStock.length} low stock alerts\n\n**Catalog:**\n• ${d.products.length} products listed\n\n${d.lowStock.length > 0 ? '⚠️ Attention: Low stock on ' + d.lowStock.map(i => i.item).join(', ') : '✅ All systems operational.'}`);

        // --- THANKS / POSITIVE ---
        if (q.match(/thank|thanks|thx|appreciate|great job|nice|good bot|awesome/))
            return this.reply(`You're welcome! 😊 I'm always here if you need more insights. Just ask away!`);

        // --- GOODBYE ---
        if (q.match(/bye|goodbye|see you|later|gtg|gotta go/))
            return this.reply(`Goodbye! I'll keep monitoring the system in the background. Come back anytime you need insights! 👋`);

        // --- FALLBACK: Try to find ANY relevant data ---
        const words = q.split(/\s+/).filter(w => w.length > 3);
        for (const w of words) {
            const matchOrder = d.orders.find(o => (o.orderId||'').toLowerCase().includes(w) || (o.client||'').toLowerCase().includes(w));
            if (matchOrder) return this.reply(`I found an order matching "**${w}**":\n• Order: **${matchOrder.orderId}**\n• Client: ${matchOrder.client}\n• Design: ${matchOrder.design}\n• Status: ${matchOrder.status}\n• Total: $${matchOrder.totalAmount || 0}`);
            const matchProd = d.products.find(p => (p.name||'').toLowerCase().includes(w));
            if (matchProd) return this.reply(`I found a product matching "**${w}**":\n• Name: **${matchProd.name}**\n• Price: $${matchProd.price}\n• Category: ${matchProd.tag}\n• Views: ${matchProd.views || 0}`);
        }

        // True fallback
        this.reply(`I'm not sure I understand that specific question, but I'm here to help! You can ask me about:\n• **Orders** — counts, status, dates\n• **Products** — pricing, popularity\n• **Inventory** — stock levels\n• **Revenue** — financial overview\n• **Suggestions** — what to focus on\n\nTry rephrasing or ask me for a **status report**!`);
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
