/**
 * ModalManager - Shared utility for dynamic modal loading
 */
const ModalManager = {
    _loadedModals: new Set(),
    
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
    }
};

window.ModalManager = ModalManager;
