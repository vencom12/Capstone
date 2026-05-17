/**
 * StitchMaster AI - Persistent Bubble & Draggable Window
 */
const Assistant = {
    EL: { 
        container: 'ai-assistant-persistent',
        msgs: 'ai-chat-messages', 
        input: 'ai-chat-input',
        handle: 'ai-handle',
        bubble: 'ai-assistant-bubble'
    },
    memory: [],
    maxMemory: 10,
    isOpen: false,

    init() {
        const container = document.getElementById(this.EL.container);
        if (!container) return;

        const input = document.getElementById(this.EL.input);
        if (input) {
            input.addEventListener('keypress', e => {
                if (e.key === 'Enter' && input.value.trim()) {
                    const text = input.value.trim();
                    this.addMsg(text, 'user');
                    this.memory.push({ role: 'user', text });
                    if (this.memory.length > this.maxMemory) this.memory.shift();
                    this.callAI(text);
                    input.value = '';
                }
            });
        }

        this.makeDraggable();
        this.reply(`Hi! I'm StitchMaster AI. Click the bubble to hide/show me, or grab my header to move me around. How can I help?`);
    },

    toggle(event) {
        if (event) event.preventDefault();
        const container = document.getElementById(this.EL.container);
        if (!container) return;
        
        this.isOpen = !this.isOpen;
        if (this.isOpen) {
            container.classList.add('ai-open');
            document.getElementById(this.EL.input)?.focus();
        } else {
            container.classList.remove('ai-open');
        }
    },

    addMsg(text, who) {
        const c = document.getElementById(this.EL.msgs);
        if (!c) return;
        const d = document.createElement('div');
        d.className = 'chat-msg';
        d.style.cssText = `padding:12px 16px;border-radius:16px;font-size:0.9rem;max-width:85%;line-height:1.5;margin-bottom:10px;box-shadow:0 2px 8px rgba(0,0,0,0.15);${who === 'user' ? 'align-self:flex-end;background:linear-gradient(135deg,var(--primary),#4f46e5);color:white;border-bottom-right-radius:4px;' : 'align-self:flex-start;background:rgba(255,255,255,0.07);color:var(--text-main);border:1px solid var(--border-glass);border-bottom-left-radius:4px;'}`;
        d.innerHTML = text.replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--primary)">$1</strong>').replace(/\n/g, '<br>');
        c.appendChild(d);
        c.scrollTop = c.scrollHeight;
    },

    reply(text) {
        const c = document.getElementById(this.EL.msgs);
        if (!c) return;
        const dot = document.createElement('div');
        dot.className = 'ai-typing';
        dot.style.cssText = 'font-size:0.75rem;color:var(--text-dim);padding:6px 12px;font-style:italic;';
        dot.textContent = 'Thinking...';
        c.appendChild(dot);
        c.scrollTop = c.scrollHeight;

        setTimeout(() => {
            dot.remove();
            this.addMsg(text, 'bot');
            this.memory.push({ role: 'bot', text });
        }, 500 + Math.random() * 700);
    },

    makeDraggable() {
        const container = document.getElementById(this.EL.container);
        const handle = document.getElementById(this.EL.handle);
        if (!container || !handle) return;

        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

        handle.onmousedown = (e) => {
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
            handle.style.cursor = 'grabbing';
        };

        function elementDrag(e) {
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            
            let newTop = container.offsetTop - pos2;
            let newLeft = container.offsetLeft - pos1;

            const padding = 10;
            newTop = Math.max(padding, Math.min(newTop, window.innerHeight - container.offsetHeight - padding));
            newLeft = Math.max(padding, Math.min(newLeft, window.innerWidth - container.offsetWidth - padding));

            container.style.top = newTop + "px";
            container.style.left = newLeft + "px";
            container.style.bottom = 'auto';
            container.style.right = 'auto';
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
            handle.style.cursor = 'grab';
        }
    },

    data() {
        const s = window.State?._cache || {};
        return {
            orders: s.orders || [], 
            products: s.products || [], 
            inventory: s.inventory || [],
            revenue: s.analytics?.revenue || 0
        };
    },

    async callAI(message) {
        const c = document.getElementById(this.EL.msgs);
        const dot = document.createElement('div');
        dot.className = 'ai-typing';
        dot.style.cssText = 'font-size:0.75rem;color:var(--text-dim);padding:6px 12px;font-style:italic;';
        dot.textContent = 'StitchMaster is analyzing...';
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
                    history: this.memory.slice(-6)
                })
            });

            const data = await response.json();
            dot.remove();

            if (data.success) {
                this.addMsg(data.reply, 'bot');
                this.memory.push({ role: 'bot', text: data.reply });
            } else {
                this.reply("Connection Issue. Please try again.");
            }
        } catch (error) {
            dot.remove();
            this.reply("System error during analysis.");
        }
    }
};

window.Assistant = Assistant;
document.addEventListener('DOMContentLoaded', () => Assistant.init());
