/**
 * ModalManager - Shared utility for dynamic modal loading
 */
const ModalManager = {
    _loadedModals: new Set(),
    
    // Central Registry for all dashboard modals
    // Each entry maps a key to { path: file to load, id: actual DOM element ID }
    REGISTRY: {
        'AUTH':           { path: 'modals/auth-modal.html',           id: 'auth-overlay' },
        'CHECKOUT':       { path: 'modals/checkout-modal.html',       id: 'checkout-modal' },
        'RECEIPT':        { path: 'modals/receipt-modal.html',        id: 'receipt-modal' },
        'EMPLOYEE_LOGIN': { path: 'modals/employee-login-modal.html', id: 'module-login-screen' },
        'ADMIN_LOGIN':    { path: 'modals/admin-login-modal.html',    id: 'module-login-screen' },
        'CREATE_PRODUCT': { path: 'modals/create-product-modal.html', id: 'create-product-modal' },
        'EDIT_ORDER':     { path: 'modals/edit-order-modal.html',     id: 'edit-order-modal' },
        'STAFF':          { path: 'modals/staff-modal.html',          id: 'staff-modal' }
    },

    /**
     * One-stop shop for opening modals
     * Handles loading the HTML if not already cached and toggling visibility
     */
    async open(key, options = {}) {
        const entry = this.REGISTRY[key];
        if (!entry) {
            console.error(`[ModalManager] Unknown modal key: ${key}`);
            return;
        }

        const modalId = entry.id;
        const path = entry.path;
        
        // 1. Ensure modal is loaded into the DOM
        if (!this._loadedModals.has(modalId)) {
            await this.loadModal(modalId, path);
        }

        // 2. Show the modal
        const el = document.getElementById(modalId);
        if (el) {
            el.style.display = 'flex';
            el.classList.add('active');
            
            // Handle optional initialization
            if (options.onOpen) options.onOpen(el);
            
            // Auto-focus first input if exists
            const firstInput = el.querySelector('input');
            if (firstInput) setTimeout(() => firstInput.focus(), 100);
        }
    },
    
    /**
     * Loads an external HTML modal template and injects it into the DOM.
     * @param {string} modalId - The ID of the modal element in the template.
     * @param {string} templatePath - The relative path to the .html file.
     * @returns {Promise<boolean>}
     */
    async loadModal(modalId, templatePath) {
        if (this._loadedModals.has(modalId)) return true;
        
        try {
            const response = await fetch(templatePath);
            if (!response.ok) throw new Error(`Failed to load modal: ${templatePath}`);
            
            const html = await response.text();
            
            // Create container for dynamic modals if not exists
            let container = document.getElementById('dynamic-modals-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'dynamic-modals-container';
                document.body.appendChild(container);
            }
            
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            
            const modalElement = tempDiv.querySelector(`#${modalId}`);
            if (!modalElement) throw new Error(`Modal with ID ${modalId} not found in ${templatePath}`);
            
            container.appendChild(modalElement);
            this._loadedModals.add(modalId);
            return true;
        } catch (error) {
            console.error('ModalManager Error:', error);
            if (window.showToast) window.showToast('Failed to load interface component.');
            return false;
        }
    },

    /**
     * Closes a modal by its key
     */
    close(key) {
        const entry = this.REGISTRY[key];
        if (!entry) return;
        const el = document.getElementById(entry.id);
        if (el) {
            el.style.display = 'none';
            el.classList.remove('active');
        }
    }
};

window.ModalManager = ModalManager;
