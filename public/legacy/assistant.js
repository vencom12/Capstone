/**
 * StitchMaster AI Assistant v3 (Hyper-Specific & Proactive)
 * A context-aware intelligence layer that offers specific data analysis and strategic suggestions.
 */

const Assistant = {
    MESSAGES_EL_ID: 'ai-chat-messages',
    INPUT_EL_ID: 'ai-chat-input',
    PERSONALITY: {
        name: 'StitchMaster AI',
        greetings: [
            'System online. Looking sharp today, Controller.', 
            'StitchMaster AI initialized. Database sync complete.', 
            'Ready to optimize production. What\'s our focus?', 
            'Good to see you. I\'ve just finished scanning the latest logs.'
        ],
        thinking: [
            'Parsing production metrics...', 
            'Correlating order trends...', 
            'Cross-referencing inventory levels...', 
            'Optimizing suggestion engine...'
        ]
    },

    init() {
        const input = document.getElementById(this.INPUT_EL_ID);
        if (!input) return;

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const text = input.value.trim();
                if (text) {
                    this.userMessage(text);
                    this.processQuery(text);
                    input.value = '';
                }
            }
        });
        
        setTimeout(() => {
            const user = window.AuthManager?.getSession()?.user || {};
            const greeting = this.PERSONALITY.greetings[Math.floor(Math.random() * this.PERSONALITY.greetings.length)];
            this.botMessage(`${greeting} How can I assist your ${user.role || 'system'} workflow today?`);
        }, 1200);
    },

    userMessage(text) {
        this.addMessage(text, 'user');
    },

    botMessage(text) {
        this.addThinkingIndicator();
        
        setTimeout(() => {
            this.removeThinkingIndicator();
            this.addMessage(text, 'bot');
        }, 600 + Math.random() * 800);
    },

    addMessage(text, sender) {
        const container = document.getElementById(this.MESSAGES_EL_ID);
        if (!container) return;

        const msg = document.createElement('div');
        msg.className = `chat-msg ${sender}-msg animate-fade`;
        msg.style.cssText = `
            padding: 14px 18px;
            border-radius: 18px;
            font-size: 0.92rem;
            max-width: 88%;
            line-height: 1.6;
            margin-bottom: 12px;
            position: relative;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            ${sender === 'user' 
                ? 'align-self: flex-end; background: linear-gradient(135deg, var(--primary), #4f46e5); color: white; border-bottom-right-radius: 4px;' 
                : 'align-self: flex-start; background: rgba(255,255,255,0.06); color: var(--text-main); border: 1px solid var(--border-glass); border-bottom-left-radius: 4px; backdrop-filter: blur(10px);'}
        `;
        msg.innerHTML = text.replace(/\n/g, '<br>');
        container.appendChild(msg);
        container.scrollTop = container.scrollHeight;
    },

    addThinkingIndicator() {
        const container = document.getElementById(this.MESSAGES_EL_ID);
        const thinking = document.createElement('div');
        thinking.id = 'ai-thinking';
        thinking.style.cssText = 'font-size: 0.75rem; color: var(--text-dim); padding: 5px 12px; font-style: italic; display: flex; align-items: center; gap: 8px;';
        thinking.innerHTML = `<span class="sync-spinner" style="width:12px; height:12px; border:2px solid var(--primary); border-top-color:transparent; border-radius:50%; display:inline-block; animation: spin 1s linear infinite;"></span> ${this.PERSONALITY.thinking[Math.floor(Math.random() * this.PERSONALITY.thinking.length)]}`;
        container.appendChild(thinking);
        container.scrollTop = container.scrollHeight;
    },

    removeThinkingIndicator() {
        const el = document.getElementById('ai-thinking');
        if (el) el.remove();
    },

    // --- Core Logic ---

    processQuery(text) {
        const query = text.toLowerCase();
        const state = window.State?._cache || {};
        const user = window.AuthManager?.getSession()?.user || {};
        const role = user.role || 'guest';

        // 1. Get Data Snapshot
        const orders = state.orders || [];
        const products = state.products || [];
        const inventory = state.inventory || [];
        const revenue = state.analytics?.revenue || 0;
        
        const activeOrders = orders.filter(o => !['Order Delivered', 'Order Canceled', 'Completed'].includes(o.status));
        const lowStock = inventory.filter(i => i.count < 10);
        
        let response = "";

        // 2. Intent Recognition & Natural Response Construction
        
        if (query.includes('status') || query.includes('how is') || query.includes('report')) {
            response = this.generateStatusReport(activeOrders, lowStock, state.machine);
        } 
        else if (query.includes('revenue') || query.includes('money') || query.includes('sale') || query.includes('profit')) {
            if (role !== 'admin') {
                response = "I'm restricted from sharing granular financial data with non-admin personnel. However, I can confirm that the transaction engine is operating normally.";
            } else {
                response = `Our current total revenue is **$${parseFloat(revenue).toLocaleString()}**. `;
                if (revenue > 1000) response += "We've passed the $1k milestone! The growth curve looks healthy.";
                else response += "We're in the early growth phase, but every transaction is being tracked securely.";
            }
        }
        else if (query.includes('order')) {
            response = this.generateOrderAnalysis(orders, activeOrders);
        }
        else if (query.includes('stock') || query.includes('thread') || query.includes('inventory')) {
            response = this.generateStockAnalysis(inventory, lowStock);
        }
        else if (query.includes('help') || query.includes('what can you do')) {
            response = "I can do quite a bit! Ask me for a **'status report'**, check our **'revenue'**, or ask for **'suggestions'** on how to optimize our current production flow. I also monitor thread levels and order delays in real-time.";
        }
        else if (query.includes('hello') || query.includes('hi') || query.includes('hey')) {
            response = `Hello ${user.username}! I've been monitoring the ${activeOrders.length} active orders we have. How can I help you move things forward?`;
        }
        else {
            response = "I'm listening, but I didn't quite catch a specific system command. Would you like a **status report** or some **production suggestions**?";
        }

        // 3. Proactive Suggestion Engine (The "Secret Sauce")
        const suggestion = this.getProactiveSuggestion(activeOrders, lowStock, role);
        if (suggestion) {
            response += `\n\n**💡 Assistant Suggestion:**\n${suggestion}`;
        }

        this.botMessage(response);
    },

    generateStatusReport(active, lowStock, machine) {
        let msg = `System is currently **${machine?.status || 'IDLE'}**. \n\n`;
        msg += `We have **${active.length} active orders** currently moving through the pipeline. `;
        
        if (lowStock.length > 0) {
            msg += `Inventory is a concern, with **${lowStock.length} thread types** below safety levels. `;
        } else {
            msg += `Inventory levels are currently within safe margins. `;
        }
        
        return msg;
    },

    generateOrderAnalysis(all, active) {
        if (all.length === 0) return "No orders found in the database. Our history is clear.";
        
        const processing = active.filter(o => o.status === 'Processing').length;
        const queue = active.filter(o => o.status === 'In Queue').length;
        
        let msg = `Analyzing ${all.length} historical records. Right now, **${queue} orders** are waiting for their turn and **${processing}** are being stitched. `;
        
        if (queue > 5) msg += "\nThe queue is starting to stack up. We might need to accelerate production.";
        return msg;
    },

    generateStockAnalysis(inv, low) {
        if (inv.length === 0) return "Inventory data is currently unavailable. Please check the database connection.";
        if (low.length === 0) return "Great news: All thread colors and materials are well-stocked. No immediate action required.";
        
        const list = low.map(i => i.name).join(', ');
        return `We have a stock deficit in: **${list}**. \nThese items have dropped below the 10-unit threshold.`;
    },

    getProactiveSuggestion(active, lowStock, role) {
        // High Priority: Low Stock + Active Orders using that stock
        if (lowStock.length > 0 && active.length > 0) {
            return `I noticed we have ${active.length} active orders but we're low on ${lowStock[0].name}. You should probably restock before the next batch starts to avoid a total halt.`;
        }
        
        // Medium Priority: Long Queue
        if (active.filter(o => o.status === 'In Queue').length > 3) {
            return "The queue is growing. If you have any idle staff, now would be a good time to assign them to the 'Processing' phase.";
        }

        // Production Efficiency
        if (active.length > 0 && active.every(o => o.progress < 20)) {
            return "Several orders are stuck at low progress. Might want to check if there's a machine jam or if threads need changing.";
        }

        // Admin Suggestion: Analytics
        if (role === 'admin' && active.length > 10) {
            return "High traffic detected! This is a great time to review our 'Most Liked' designs in the Analytics tab to see what's trending.";
        }

        return "Everything is running smoothly! Maybe take a look at the design catalog to see if any new products need descriptions?";
    }
};

window.Assistant = Assistant;

// Add spin animation to styles if not exists
if (!document.getElementById('ai-assistant-extra-styles')) {
    const style = document.createElement('style');
    style.id = 'ai-assistant-extra-styles';
    style.innerHTML = `
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .chat-msg b, .chat-msg strong { color: var(--primary); }
    `;
    document.head.appendChild(style);
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    Assistant.init();
});
