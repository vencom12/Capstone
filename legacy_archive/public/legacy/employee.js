const API_URL = '/api/employee';
const ADMIN_API_URL = '/api/admin';
const AUTH_API_URL = '/api/auth';
const SOCKET_URL = window.location.origin;

// --- Core functionality provided by js/core.js ---


// --- AuthManager logic moved to core.js ---

// --- State Management ---
const State = {
    _cache: {
        orders: [], inventory: [], products: [], machine: { status: 'STOPPED', progress: 0 }, machines: [
            { id: 1, name: 'M#1 Happy 12-Head', meta: 'Batch #42A', status: 'RUNNING' },
            { id: 2, name: 'M#2 Brother Single', meta: 'Idle / Ready', status: 'IDLE' }
        ]
    },
    async getDashboardState() {
        try {
            const response = await apiFetch(`${API_URL}/dashboard-state`);
            if (response.ok) {
                const data = await response.json();
                this._cache = { ...this._cache, ...data };
                return data;
            }
        } catch (err) { console.error('Employee state error:', err); }
        return null;
    }
};

// --- UI Rendering ---
function updateUI() {
    let { orders, products, machine, inventory } = State._cache;

    const inventorySearch = document.getElementById('employee-inventory-search')?.value.toLowerCase();
    if (inventorySearch) {
        inventory = inventory.filter(item =>
            item.item.toLowerCase().includes(inventorySearch)
        ).sort((a, b) => {
            const aMatch = a.item.toLowerCase().startsWith(inventorySearch);
            const bMatch = b.item.toLowerCase().startsWith(inventorySearch);
            return bMatch - aMatch;
        });
    }

    // Apply Search Filtering/Sorting
    const orderSearch = document.getElementById('employee-orders-search')?.value.toLowerCase();
    const orderDate = document.getElementById('employee-orders-date')?.value;

    if (orderSearch || orderDate) {
        orders = orders.filter(o => {
            const matchesSearch = !orderSearch || (
                o.orderId.toLowerCase().includes(orderSearch) ||
                (o.client && o.client.toLowerCase().includes(orderSearch)) ||
                (o.status && o.status.toLowerCase().includes(orderSearch))
            );

            const matchesDate = !orderDate || (
                new Date(o.date || o.createdAt).toISOString().split('T')[0] === orderDate
            );

            return matchesSearch && matchesDate;
        }).sort((a, b) => {
            if (!orderSearch) return 0;
            const aMatch = a.orderId.toLowerCase().startsWith(orderSearch) || (a.client && a.client.toLowerCase().startsWith(orderSearch));
            const bMatch = b.orderId.toLowerCase().startsWith(orderSearch) || (b.client && b.client.toLowerCase().startsWith(orderSearch));
            return bMatch - aMatch;
        });
    }

    const productSearch = document.getElementById('employee-products-search')?.value.toLowerCase();
    if (productSearch) {
        products = products.filter(p =>
            p.name.toLowerCase().includes(productSearch) ||
            p.tag.toLowerCase().includes(productSearch)
        ).sort((a, b) => {
            const aMatch = a.name.toLowerCase().startsWith(productSearch);
            const bMatch = b.name.toLowerCase().startsWith(productSearch);
            return bMatch - aMatch;
        });
    }

    const historySearch = document.getElementById('employee-history-search')?.value.toLowerCase();
    const historyDate = document.getElementById('employee-history-date')?.value;

    let historyOrders = orders.filter(o => ['Order Delivered', 'Order Canceled', 'Completed'].includes(o.status));

    if (historySearch || historyDate) {
        historyOrders = historyOrders.filter(o => {
            const matchesSearch = !historySearch || (
                o.orderId.toLowerCase().includes(historySearch) ||
                (o.client && o.client.toLowerCase().includes(historySearch))
            );

            const matchesDate = !historyDate || (
                new Date(o.date || o.createdAt).toISOString().split('T')[0] === historyDate
            );

            return matchesSearch && matchesDate;
        }).sort((a, b) => {
            if (!historySearch) return 0;
            const aMatch = a.orderId.toLowerCase().startsWith(historySearch) || (a.client && a.client.toLowerCase().startsWith(historySearch));
            const bMatch = b.orderId.toLowerCase().startsWith(historySearch) || (b.client && b.client.toLowerCase().startsWith(historySearch));
            return bMatch - aMatch;
        });
    }

    // 1. Machine Status
    const statusEl = document.getElementById('workbench-status');
    const progressEl = document.getElementById('workbench-progress');
    if (statusEl) {
        statusEl.innerText = machine.status;
        statusEl.style.background = machine.status === 'RUNNING' ? 'var(--primary)' : 'var(--accent)';
    }
    if (progressEl) progressEl.style.width = `${machine.progress}%`;

    // 1.1 Machine Strip
    const machineStrip = document.querySelector('.machine-strip');
    if (machineStrip) {
        const machines = State._cache.machines;
        machineStrip.innerHTML = machines.map(m => `
            <div class="machine-mini-card ${m.status === 'RUNNING' ? 'is-running' : ''}">
                <div class="status-dot ${m.status === 'RUNNING' ? 'dot-running' : 'dot-idle'}" 
                     style="width: 10px; height: 10px; border-radius: 50%; background: ${m.status === 'RUNNING' ? '#10b981' : '#64748b'};"></div>
                <div class="machine-info">
                    <div class="machine-name">${m.name}</div>
                    <div class="machine-meta">${m.meta}</div>
                </div>
            </div>
        `).join('');
    }

    // 2. Active Orders Table
    const tableBody = document.getElementById('employee-order-table-body');
    if (tableBody) {
        const activeOrders = orders.filter(o => !['Order Delivered', 'Order Canceled'].includes(o.status));
        if (activeOrders.length === 0) {
            if (isSyncing()) {
                tableBody.innerHTML = Array(5).fill(0).map(() => `
                    <tr>
                        <td><div class="skeleton-row-cell skeleton"></div></td>
                        <td><div class="skeleton-row-cell skeleton" style="width: 120px;"></div></td>
                        <td><div class="skeleton-row-cell skeleton" style="width: 150px;"></div></td>
                        <td><div class="skeleton-row-cell skeleton" style="width: 60px;"></div></td>
                        <td><div class="skeleton-row-cell skeleton" style="width: 100px;"></div></td>
                    </tr>
                `).join('');
            } else {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="5">
                            <div class="empty-state-container">
                                <div class="empty-state-visual">
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
                                </div>
                                <h3 class="empty-state-title">Queue is Clear</h3>
                                <p class="empty-state-text">No active orders assigned to your station right now.</p>
                            </div>
                        </td>
                    </tr>`;
            }
        } else {
            tableBody.innerHTML = activeOrders.map(order => {
                const dateObj = new Date(order.date || order.createdAt);
                const dateStr = dateObj.toLocaleDateString([], { month: '2-digit', day: '2-digit', year: 'numeric' });
                const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                return `
                <tr>
                    <td data-label="Order ID">
                        <div class="order-id-main">${order.orderId}</div>
                        <span class="status-pill-small">${order.status}</span>
                    </td>
                    <td data-label="Client">
                        <div class="timestamp-sub">${dateStr}, ${timeStr}</div>
                        <div class="client-name">${order.client || 'Guest'}</div>
                    </td>
                    <td data-label="Design" class="design-cell">
                        ${formatOrderDesign(order)}
                    </td>
                    <td data-label="Total" class="price-cell">$${parseFloat(order.totalAmount || 0).toFixed(2)}</td>
                    <td data-label="Action">
                        <button class="btn" onclick="openEditOrder('${order.id}')" 
                            style="background: rgba(99, 102, 241, 0.1); color: var(--primary); border: 1px solid rgba(99, 102, 241, 0.2); padding: 6px 12px; font-size: 0.8rem;">
                            Process
                        </button>
                    </td>
                </tr>`;
            }).join('');
        }
    }

    // 3. Inventory/Catalog
    const productList = document.getElementById('product-list-container');
    if (productList) {
        if (products.length === 0 && isSyncing()) {
            productList.innerHTML = Array(6).fill(0).map(() => `
                <div class="skeleton-card">
                    <div class="skeleton-img skeleton"></div>
                    <div class="skeleton-title skeleton"></div>
                    <div class="skeleton-text skeleton"></div>
                    <div class="skeleton-button skeleton"></div>
                </div>
            `).join('');
        } else if (products.length === 0) {
            productList.innerHTML = `
                <div style="grid-column: 1/-1;">
                    <div class="empty-state-container">
                        <div class="empty-state-visual">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                        </div>
                        <h3 class="empty-state-title">No Designs Found</h3>
                        <p class="empty-state-text">Your digital catalog is currently empty. Start by creating a new design.</p>
                        <button class="btn btn-primary" onclick="openCreateProduct()">Create New Design</button>
                    </div>
                </div>`;
        } else {
            productList.innerHTML = products.map(p => `
                <div class="stat-card glass animate-fade" style="display: flex; flex-direction: column; gap: 12px; padding: 15px; position: relative; width: 100%;">
                    <div style="width: 100%; height: 120px; border-radius: 12px; background-image: url('${p.imageUrl}'); background-size: cover; background-position: center; border: 1px solid var(--border-glass);"></div>
                    <div style="flex: 1; text-align: center;">
                        <h4 style="font-size: 1rem; font-weight: 700; margin-bottom: 4px; color: var(--text-main);">${p.name}</h4>
                        <p style="color: var(--text-dim); font-size: 0.85rem;">${p.tag} • $${p.price.toFixed(2)}</p>
                    </div>
                    <div style="display: flex; gap: 8px; width: 100%;">
                        <button class="btn" onclick="openEditProduct('${p.id}')" style="flex: 1; background: rgba(99, 102, 241, 0.15); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.3); padding: 10px; font-size: 0.85rem; font-weight: 600;">Customize</button>
                        <button class="btn" onclick="deleteProduct('${p.id}')" style="flex: 1; background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); padding: 10px; font-size: 0.85rem; font-weight: 600;">Delete</button>
                    </div>
                </div>`).join('');
        }
    }

    // 4. History Table
    const historyTable = document.getElementById('employee-history-table-body');
    if (historyTable) {
        historyTable.innerHTML = historyOrders.length === 0
            ? '<tr><td colspan="5" style="text-align:center; padding:40px;">No historical orders found.</td></tr>'
            : historyOrders.map(o => `
                <tr>
                    <td data-label="Order ID" style="color: var(--primary); font-weight: 600;">${o.orderId}</td>
                    <td data-label="Client">${o.client}</td>
                    <td data-label="Design">${formatOrderDesign(o)}</td>
                    <td data-label="Status"><span class="status-pill">${o.status}</span></td>
                    <td data-label="Date">${new Date(o.date || o.createdAt).toLocaleDateString()}</td>
                </tr>`).join('');
    }

    // 5. Raw Materials Inventory
    const inventoryTable = document.getElementById('inventory-table-body') || document.getElementById('raw-materials-table-body');
    if (inventoryTable) {
        if (!inventory || inventory.length === 0) {
            inventoryTable.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-dim); padding: 40px;">No inventory items found.</td></tr>';
        } else {
            inventoryTable.innerHTML = inventory.map(item => {
                const isLowStock = item.count <= (item.minThreshold || 10);
                const statusBadge = isLowStock ?
                    `<span class="status-pill" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); padding: 4px 12px; border-radius: 20px; font-weight: 600; font-size: 0.75rem;">Low Stock</span>` :
                    `<span class="status-pill" style="background: rgba(34, 197, 94, 0.1); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.2); padding: 4px 12px; border-radius: 20px; font-weight: 600; font-size: 0.75rem;">Healthy</span>`;

                return `
                    <tr>
                        <td data-label="Material" style="font-weight: 600; color: var(--text-main);">${item.item}</td>
                        <td data-label="Current Stock" style="font-size: 1.1rem; font-weight: 700; ${isLowStock ? 'color: #ef4444;' : 'color: var(--primary);'}">${item.count}</td>
                        <td data-label="Alert Threshold" style="color: var(--text-dim);">${item.minThreshold || 10}</td>
                        <td data-label="Status">${statusBadge}</td>
                        <td data-label="Action">
                            <button class="btn btn-secondary" onclick="openUpdateStockModal('${item.id}', '${item.item}', ${item.count})" style="background: var(--bg-surface); border: 1px solid var(--border-glass); color: var(--text-main); padding: 6px 12px; font-size: 0.8rem;">Update</button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    }
} async function openUpdateStockModal(id, name, currentCount) {
    await ModalManager.open('UPDATE_STOCK', {
        onOpen: (modal) => {
            document.getElementById('update-stock-id').value = id;
            document.getElementById('update-stock-title').innerText = `Update: ${name}`;
            document.getElementById('update-stock-current').innerText = currentCount;

            // For employee, we might want to hide the threshold if needed, 
            // but the user's screenshot shows it visible. I'll keep it visible.
            const thresholdContainer = document.getElementById('threshold-field-container');
            if (thresholdContainer) thresholdContainer.style.display = 'block';

            const form = document.getElementById('update-stock-form');
            const submitBtn = document.getElementById('update-stock-submit');

            // Reset button state
            if (submitBtn) {
                submitBtn.innerText = "Save Changes";
                submitBtn.disabled = false;
            }

            const newForm = form.cloneNode(true);
            form.parentNode.replaceChild(newForm, form);

            newForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const action = document.getElementById('update-stock-action').value;
                const amount = parseInt(document.getElementById('update-stock-amount').value) || 0;
                const thresholdInput = document.getElementById('update-stock-threshold').value;
                const threshold = thresholdInput ? parseInt(thresholdInput) : undefined;

                let newCount = currentCount;
                if (action === 'Deduct') {
                    newCount = Math.max(0, currentCount - amount);
                } else {
                    newCount = currentCount + amount;
                }

                const payload = { count: newCount, action, amount, minThreshold: threshold };
                const currentSubmitBtn = newForm.querySelector('button[type="submit"]');
                currentSubmitBtn.innerText = "Saving...";
                currentSubmitBtn.disabled = true;

                try {
                    // Note: Employee uses ADMIN_API_URL or API_URL depending on implementation
                    // In employee.js, it seems to use API_URL = '/api/employee'
                    const res = await apiFetch(`${API_URL}/inventory/${id}`, {
                        method: 'PATCH',
                        body: JSON.stringify(payload)
                    });
                    if (!res.ok) throw new Error('Failed to update stock');

                    showToast('Inventory updated', 'success');
                    ModalManager.close('UPDATE_STOCK');
                    if (window.refreshDashboardState) refreshDashboardState();
                } catch (err) {
                    console.error(err);
                    showToast('Failed to update inventory', 'error');
                } finally {
                    currentSubmitBtn.innerText = "Save Changes";
                    currentSubmitBtn.disabled = false;
                }
            });
        }
    });
};

window.openCreateMaterialModal = async () => {
    await ModalManager.loadModal('create-material-modal', 'modals/create-material-modal.html');
    const form = document.getElementById('create-material-form');
    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);

    newForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            item: document.getElementById('create-material-name').value,
            count: parseInt(document.getElementById('create-material-stock').value),
            unit: document.getElementById('create-material-unit').value,
            minThreshold: parseInt(document.getElementById('create-material-threshold').value)
        };

        const submitBtn = newForm.querySelector('button[type="submit"]');
        submitBtn.innerText = "Creating...";
        submitBtn.disabled = true;

        try {
            const res = await fetch(`${ADMIN_API_URL}/inventory`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                credentials: 'include'
            });
            if (!res.ok) throw new Error('Failed to create material');
            UI.toggleModal('create-material-modal');
            refreshDashboardState();
        } catch (err) {
            console.error(err);
            alert('Failed to create material.');
            submitBtn.innerText = "Create Material";
            submitBtn.disabled = false;
        }
    });
    UI.toggleModal('create-material-modal');
};

window.updateGlobalThreshold = async () => {
    const val = document.getElementById('global-threshold-input').value;
    if (!val || isNaN(val)) return;

    if (!confirm(`Are you sure you want to set the low-stock alert threshold to ${val} for ALL raw materials?`)) return;

    try {
        const res = await fetch(`${ADMIN_API_URL}/inventory/global`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ minThreshold: parseInt(val) }),
            credentials: 'include'
        });
        if (res.ok) {
            showToast('Global threshold updated');
            refreshDashboardState();
        }
    } catch (err) {
        console.error(err);
        showToast('Failed to update global threshold');
    }
};

function formatOrderDesign(order) {
    if (order.items && order.items.length > 0) return order.items.map(i => i.name).join(', ');
    return order.design || 'Custom';
}

// --- Initialization & Socket ---
async function refreshDashboardState() {
    updateSyncIndicator(true);
    try {
        const data = await State.getDashboardState();
        if (data) {
            updateUI();
        }
    } catch (e) {
        console.error('[Employee] Refresh failed', e);
    } finally {
        updateSyncIndicator(false);
        updateUI(); // Always clear skeletons
    }
}

function initSocket() {
    const script = document.createElement('script');
    script.src = "/socket.io/socket.io.js";
    script.onload = () => {
        const socket = io(SOCKET_URL, { withCredentials: true });
        socket.on('ordersUpdated', () => {
            refreshDashboardState();
            showToast('Incoming Transmission: Orders Synchronized', 'success');
        });
        socket.on('dataChanged', (data) => {
            console.log('[Socket] Data changed:', data.entity, data.action);
            if (data.entity === 'PRODUCT' || data.entity === 'INVENTORY') {
                refreshDashboardState();
                if (data.action === 'CREATE') {
                    showToast(`New ${data.entity.toLowerCase()} added in real-time`);
                }
            }
        });
        socket.on('machineUpdate', (data) => {
            State._cache.machine = data;
            updateUI();
        });
    };
    document.head.appendChild(script);
}

document.addEventListener('DOMContentLoaded', async () => {
    initSocket();

    // Search listeners
    ['employee-orders-search', 'employee-products-search', 'employee-history-search', 'employee-inventory-search'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => updateUI());
    });

    if (AuthManager.isAuthenticated()) {
        refreshDashboardState();
    }

    // Unified Date Filter Listeners
    document.addEventListener('change', (e) => {
        if (e.target.id === 'employee-orders-date' || e.target.id === 'employee-history-date') {
            updateUI();
        }
        // Refresh data when switching to relevant tabs
        if (e.target.name === 'nav-radio') {
            refreshDashboardState();
        }
    });
});
window.openCreateProduct = async () => {
    await ModalManager.loadModal('create-product-modal', 'modals/create-product-modal.html');
    const form = document.getElementById('create-product-form');
    if (form) {
        form.reset();
        delete form.dataset.editId;
    }
    const titleEl = document.querySelector('#create-product-modal h2');
    if (titleEl) titleEl.innerText = 'Create New Design';
    UI.toggleModal('create-product-modal');
};

window.openEditProduct = async (id) => {
    await ModalManager.loadModal('create-product-modal', 'modals/create-product-modal.html');
    const p = State._cache.products.find(prod => prod.id === id);
    if (!p) return;

    document.getElementById('product-name').value = p.name;
    document.getElementById('product-price').value = p.price;
    document.getElementById('product-tag').value = p.tag;
    document.getElementById('product-desc').value = p.description || '';

    const form = document.getElementById('create-product-form');
    if (form) form.dataset.editId = id;

    const titleEl = document.querySelector('#create-product-modal h2');
    if (titleEl) titleEl.innerText = 'Customize Design';

    UI.toggleModal('create-product-modal');
};

window.deleteProduct = async (id) => {
    if (!confirm('Delete this design?')) return;
    updateSyncIndicator(true);
    const res = await apiFetch(`${API_URL}/products/${id}`, { method: 'DELETE' });
    updateSyncIndicator(false);
    if (res.ok) {
        showToast('Design deleted');
        refreshDashboardState();
    }
};

window.openEditOrder = async (id) => {
    await ModalManager.loadModal('edit-order-modal', 'modals/edit-order-modal.html');
    const order = State._cache.orders.find(o => o.id === id);
    if (!order) return;

    const titleEl = document.getElementById('edit-order-modal-title');
    if (titleEl) titleEl.innerText = `Process Order #${order.orderId}`;

    const clientInput = document.getElementById('edit-order-client');
    if (clientInput) clientInput.value = order.client || '';

    const designInput = document.getElementById('edit-order-design');
    if (designInput) designInput.value = formatOrderDesign(order);

    const statusInput = document.getElementById('edit-order-status');
    if (statusInput) statusInput.value = order.status;

    const progressInput = document.getElementById('edit-order-progress');
    if (progressInput) progressInput.value = order.progress;

    // Highlight active status button
    document.querySelectorAll('.status-btn').forEach(btn => {
        if (btn.dataset.value === order.status) btn.classList.add('btn-primary');
        else btn.classList.remove('btn-primary');
    });

    const form = document.getElementById('edit-order-form');
    if (form) form.dataset.orderId = id;
    UI.toggleModal('edit-order-modal');
};

const UI = {
    toggleModal: (id) => {
        const modal = document.getElementById(id);
        if (modal) modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
    }
};

// Initialize Form Actions
document.addEventListener('DOMContentLoaded', () => {
    // Status button group listener
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('status-btn')) {
            document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('btn-primary'));
            e.target.classList.add('btn-primary');
            document.getElementById('edit-order-status').value = e.target.dataset.value;
        }
    });

    // Edit order form submit
    const editOrderForm = document.getElementById('edit-order-form');
    if (editOrderForm) {
        editOrderForm.onsubmit = async (e) => {
            e.preventDefault();
            const id = editOrderForm.dataset.orderId;
            const status = document.getElementById('edit-order-status').value;
            const progress = document.getElementById('edit-order-progress').value;

            updateSyncIndicator(true);
            const res = await apiFetch(`${API_URL}/order-status/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ status, progress })
            });
            updateSyncIndicator(false);
            if (res.ok) {
                showToast('Order status updated');
                UI.toggleModal('edit-order-modal');
                refreshDashboardState();
            }
        };
    }

    const productForm = document.getElementById('create-product-form');
    if (productForm) {
        console.log('[Employee] Product form found and listener attached');
        productForm.onsubmit = async (e) => {
            e.preventDefault();
            console.log('[Employee] Product form submitted');
            const id = productForm.dataset.editId;
            const formData = new FormData();
            formData.append('name', document.getElementById('product-name').value);
            formData.append('price', document.getElementById('product-price').value);
            formData.append('tag', document.getElementById('product-tag').value);
            formData.append('description', document.getElementById('product-desc').value);

            const imgFile = document.getElementById('product-image-file').files[0];
            if (imgFile) formData.append('image', imgFile);

            updateSyncIndicator(true);
            const url = id ? `${API_URL}/products/${id}` : `${API_URL}/products`;
            const method = id ? 'PATCH' : 'POST';

            const res = await apiFetch(url, {
                method,
                body: formData
            });
            updateSyncIndicator(false);

            if (res.ok) {
                showToast(id ? 'Design updated' : 'Design created');
                UI.toggleModal('create-product-modal');
                productForm.reset();
                delete productForm.dataset.editId;
                refreshDashboardState();
            } else {
                let errMsg = 'Unknown error';
                try {
                    const errData = await res.json();
                    errMsg = errData.error || errData.message || 'Unknown error';
                } catch (e) {
                    errMsg = await res.text().catch(() => 'Unknown error');
                }
                showToast(`Error ${res.status}: ${errMsg}`);
            }
        };
    }
});

window.UI = UI;
window.AuthManager = AuthManager;
window.State = State;
window.apiFetch = apiFetch;
window.showToast = showToast;
window.refreshDashboardState = refreshDashboardState;

// Global Threshold Handler for Modal
window.handleGlobalThresholdUpdate = async (event) => {
    const input = document.getElementById('global-threshold-input');
    if (!input || !input.value) {
        if (window.showToast) showToast('Please enter a valid threshold value');
        return;
    }

    const applyBtn = event.currentTarget;
    const originalText = applyBtn.innerText;
    applyBtn.innerText = 'Applying...';
    applyBtn.disabled = true;

    try {
        if (window.updateGlobalThreshold) {
            await updateGlobalThreshold();
            ModalManager.close('INVENTORY_SETTINGS');
        }
    } finally {
        applyBtn.innerText = originalText;
        applyBtn.disabled = false;
    }
};
