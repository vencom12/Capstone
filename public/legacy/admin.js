const API_URL = '/api/admin';
const AUTH_API_URL = '/api/auth';
const SOCKET_URL = window.location.origin;

// Export to window for inline scripts
window.API_URL = API_URL;
window.AUTH_API_URL = AUTH_API_URL;

// --- Toast, Auth, API, debounce, sync all provided by js/core.js ---

// Global Error Handler for remote debugging
window.onerror = function (msg, url, line, col, error) {
    console.error('GLOBAL ERROR:', msg, 'at', line, ':', col, 'in', url);
    const source = url ? url.split('/').pop() : 'Unknown';
    showToast(`Runtime Error: ${msg} (${source}:${line})`);
    return false;
};



// --- Key Objects (Hoisted or defined early for window export) ---
const UI = {
    toggleModal: (id) => {
        const modal = document.getElementById(id);
        if (modal) modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
    }
};

// --- Core functionality provided by js/core.js ---

const State = {
    _cache: {
        orders: [], users: [], inventory: [], products: [], analytics: null,
        pagination: { currentPage: 1, totalPages: 1, totalOrders: 0 }
    },
    async getDashboardState() {
        if (this._syncPromise) return this._syncPromise;

        this._syncPromise = (async () => {
            console.log('[State] Fetching state...');
            try {
                const page = this._cache.pagination.currentPage || 1;
                const response = await apiFetch(`${API_URL}/dashboard-state?page=${page}`);
                if (response.ok) {
                    const data = await response.json();
                    this._cache = { ...this._cache, ...data };
                    return data;
                }
            } catch (err) { console.error('Admin state error:', err); }
            return null;
        })();

        try {
            return await this._syncPromise;
        } finally {
            this._syncPromise = null;
        }
    }
};

// --- Window Exports ---
window.UI = UI;
window.AuthManager = AuthManager;
window.State = State;
window.showToast = showToast;

window.downloadReceipt = (receiptId) => {
    window.location.href = `/api/customer/receipt/${receiptId}/download`;
};




// refreshCSRFToken, _syncCount, updateSyncIndicator all provided by js/core.js

// --- UI Rendering ---
function updateUI() {
    _updateUIInternal();
}

const _updateUIInternal = debounce(() => {
    let { orders, users, inventory, products, analytics } = State._cache;

    // Apply Search Filtering/Sorting
    const orderSearch = document.getElementById('admin-orders-search')?.value.toLowerCase();
    const orderDate = document.getElementById('admin-orders-date')?.value;
    
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

    const staffSearch = document.getElementById('admin-staff-search')?.value.toLowerCase();
    if (staffSearch) {
        users = users.filter(u =>
            u.username.toLowerCase().includes(staffSearch) ||
            u.email.toLowerCase().includes(staffSearch) ||
            u.role.toLowerCase().includes(staffSearch)
        ).sort((a, b) => {
            const aMatch = a.username.toLowerCase().startsWith(staffSearch) || a.email.toLowerCase().startsWith(staffSearch);
            const bMatch = b.username.toLowerCase().startsWith(staffSearch) || b.email.toLowerCase().startsWith(staffSearch);
            return bMatch - aMatch;
        });
    }

    const productSearch = document.getElementById('admin-products-search')?.value.toLowerCase();
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

    const historySearch = document.getElementById('admin-history-search')?.value.toLowerCase();
    const historyDate = document.getElementById('admin-history-date')?.value;
    
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

    // 1. Update Stats
    if (analytics) {
        const revEl = document.getElementById('overview-revenue');
        if (revEl) revEl.innerText = `$${parseFloat(analytics.revenue || 0).toFixed(2)}`;

        // Low stock indicators (midnight/gold)
        const midnight = inventory.find(i => i.name.toLowerCase().includes('midnight'))?.count || 0;
        const gold = inventory.find(i => i.name.toLowerCase().includes('gold'))?.count || 0;
        const midEl = document.getElementById('inv-midnight');
        const goldEl = document.getElementById('inv-gold');
        if (midEl) midEl.innerText = `${midnight} Cones`;
        if (goldEl) goldEl.innerText = `${gold} Cones`;
    }

    const orderTable = document.getElementById('admin-order-table-body');
    if (orderTable) {
        if (orders.length === 0) {
            if (isSyncing()) {
                // Render table skeletons
                orderTable.innerHTML = Array(5).fill(0).map(() => `
                    <tr>
                        <td><div class="skeleton-row-cell skeleton"></div></td>
                        <td><div class="skeleton-row-cell skeleton" style="width: 120px;"></div></td>
                        <td><div class="skeleton-row-cell skeleton" style="width: 150px;"></div></td>
                        <td><div class="skeleton-row-cell skeleton" style="width: 60px;"></div></td>
                        <td><div class="skeleton-row-cell skeleton" style="width: 100px;"></div></td>
                    </tr>
                `).join('');
            } else {
                orderTable.innerHTML = `
                    <tr>
                        <td colspan="6">
                            <div class="empty-state-container" style="padding: 40px 20px;">
                                <div class="empty-state-visual">
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10H3M21 6H3M21 14H3M21 18H3"/></svg>
                                </div>
                                <h3 class="empty-state-title">No Orders Found</h3>
                                <p class="empty-state-text">There are currently no orders that match your criteria.</p>
                            </div>
                        </td>
                    </tr>`;
            }
        } else {
            orderTable.innerHTML = orders.map(order => {
                const dateObj = new Date(order.date || order.createdAt);
                const dateStr = dateObj.toLocaleDateString([], { month: '2-digit', day: '2-digit', year: 'numeric' });
                const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                return `
                <tr onclick="if(!event.target.closest('input, button')) viewReceipt('${order.transaction?.transactionID}')" style="cursor: pointer;">
                    <td data-label="Order ID">
                        <div class="order-id-main">${order.orderId}</div>
                        <span class="status-pill-small">${order.status}</span>
                    </td>
                    <td data-label="Customer">
                        <div class="timestamp-sub">${dateStr}, ${timeStr}</div>
                        <div style="font-weight: 500;">${order.client || 'Guest'}</div>
                    </td>
                    <td data-label="Design">${formatOrderDesign(order)}</td>
                    <td data-label="Total" style="font-weight: 600;">$${parseFloat(order.totalAmount || 0).toFixed(2)}</td>
                    <td data-label="Actions">
                        <div style="display: flex; gap: 6px; min-width: 140px; justify-content: flex-start;">
                            <button class="btn" onclick="event.stopPropagation(); openEditOrder('${order.id || order._id}')" style="background: rgba(99, 102, 241, 0.15); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.3); padding: 6px 10px; font-size: 0.7rem;">Edit</button>
                            ${order.receipt ? `<button class="btn" onclick="event.stopPropagation(); downloadReceipt('${order.receipt.receiptID}')" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); padding: 6px 10px; font-size: 0.7rem;">Download</button>` : ''}
                        </div>
                    </td>
                </tr>`;
            }).join('');
        }
    }


    const staffTable = document.getElementById('staff-table-body');
if (staffTable) {
    staffTable.innerHTML = users.length === 0
        ? '<tr><td colspan="5" style="text-align:center; padding:40px;">No personnel found.</td></tr>'
        : users.map(user => `
                <tr>
                    <td data-label="Username">${user.username}</td>
                    <td data-label="Email">${user.email}</td>
                    <td data-label="Role"><span class="status-pill">${user.role}</span></td>
                    <td data-label="Joined">${new Date(user.createdAt).toLocaleDateString()}</td>
                    <td data-label="Actions">
                        <div style="display: flex; gap: 8px;">
                            <button class="btn" onclick="openEditStaff('${user.id}')" style="background: rgba(99, 102, 241, 0.15); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.3); padding: 6px 14px; font-size: 0.8rem;">Edit</button>
                            <button class="btn" onclick="deleteUser('${user.id}')" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); padding: 6px 14px; font-size: 0.8rem;">Delete</button>
                        </div>
                    </td>
                </tr>`).join('');
}

const historyTable = document.getElementById('admin-history-table-body');
if (historyTable) {
    if (historyOrders.length === 0) {
        historyTable.innerHTML = `
            <tr>
                <td colspan="5">
                    <div class="empty-state-container" style="padding: 40px 20px;">
                        <div class="empty-state-visual">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        </div>
                        <h3 class="empty-state-title">History is Empty</h3>
                        <p class="empty-state-text">Completed orders and past transactions will appear here.</p>
                    </div>
                </td>
            </tr>`;
    } else {
        historyTable.innerHTML = historyOrders.map(o => `
                <tr onclick="viewReceipt('${o.transaction?.transactionID || o.transactionId}')" style="cursor: pointer;">
                    <td data-label="Order ID" style="color: var(--primary); font-weight: 600;">${o.orderId}</td>
                    <td data-label="Client">${o.client}</td>
                    <td data-label="Total">$${parseFloat(o.totalAmount || 0).toFixed(2)}</td>
                    <td data-label="Status"><span class="status-pill">${o.status}</span></td>
                    <td data-label="View Details">
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <button class="btn btn-secondary" onclick="event.stopPropagation(); viewReceipt('${o.transaction?.transactionID || o.transactionId}')" style="background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.2); padding: 4px 8px; font-size: 0.75rem;">View</button>
                            ${o.receipt ? `<button class="btn" onclick="event.stopPropagation(); downloadReceipt('${o.receipt.receiptID}')" style="background: rgba(16, 185, 129, 0.1); color: #10b981; padding: 4px 8px; font-size: 0.75rem;">Download</button>` : '<span style="color: var(--text-dim); font-size: 0.75rem;">N/A</span>'}
                        </div>
                    </td>
                </tr>`).join('');
}
}

// 4. Update Product Grid
const productGrid = document.getElementById('product-list-container');
if (productGrid) {
    if (products.length === 0 && isSyncing()) {
        productGrid.innerHTML = Array(6).fill(0).map(() => `
            <div class="skeleton-card">
                <div class="skeleton-img skeleton"></div>
                <div class="skeleton-title skeleton"></div>
                <div class="skeleton-text skeleton"></div>
                <div class="skeleton-button skeleton"></div>
            </div>
        `).join('');
    } else {
        productGrid.innerHTML = products.map(p => `
                <div class="stat-card glass animate-fade" style="display: flex; flex-direction: column; gap: 12px; padding: 15px; position: relative; width: 100%;">
                    <div style="width: 100%; height: 120px; border-radius: 12px; background-image: url('${p.imageUrl}'); background-size: cover; background-position: center; border: 1px solid var(--border-glass);"></div>
                    <div style="flex: 1; text-align: center;">
                        <h4 style="font-size: 1rem; font-weight: 700; margin-bottom: 4px; color: var(--text-main);">${p.name}</h4>
                        <p style="color: var(--text-dim); font-size: 0.85rem;">${p.tag} • $${p.price.toFixed(2)}</p>
                    </div>
                    <div style="display: flex; gap: 8px; width: 100%;">
                        <button class="btn" onclick="openEditProduct('${p.id}')" style="flex: 1; background: rgba(99, 102, 241, 0.15); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.3); padding: 10px; font-size: 0.85rem; font-weight: 600;">Edit</button>
                        <button class="btn" onclick="deleteProduct('${p.id}')" style="flex: 1; background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); padding: 10px; font-size: 0.85rem; font-weight: 600;">Delete</button>
                    </div>
                </div>`).join('');
    }
}

updateAITip();
updatePaginationUI();
updateCharts();
renderRawMaterials(inventory);
fetchInventoryLogs();
}, 250);

function renderRawMaterials(inventory) {
    const tbody = document.getElementById('raw-materials-table-body');
    if (!tbody) return;

    if (!inventory || inventory.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-dim); padding: 40px;">No inventory items found.</td></tr>';
        return;
    }

    tbody.innerHTML = inventory.map(item => {
        const isLowStock = item.count <= (item.minThreshold || 10);
        const statusBadge = isLowStock ? 
            `<span class="status-pill" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2);">Low Stock</span>` : 
            `<span class="status-pill" style="background: rgba(34, 197, 94, 0.1); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.2);">Healthy</span>`;

        return `
            <tr>
                <td data-label="Material" style="font-weight: 600; color: white;">${item.item}</td>
                <td data-label="Current Stock" style="font-size: 1.1rem; font-weight: 700; ${isLowStock ? 'color: #ef4444;' : 'color: var(--primary);'}">${item.count}</td>
                <td data-label="Alert Threshold" style="color: var(--text-dim);">${item.minThreshold || 10}</td>
                <td data-label="Status">${statusBadge}</td>
                <td data-label="Action">
                    <button class="btn btn-secondary" onclick="openUpdateStockModal('${item.id}', '${item.item}', ${item.count}, ${item.minThreshold || 10})" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-glass); padding: 6px 12px; font-size: 0.8rem;">Update</button>
                </td>
            </tr>
        `;
    }).join('');
}

async function openUpdateStockModal(id, name, currentCount, threshold) {
    await ModalManager.loadModal('update-stock-modal', 'modals/update-stock-modal.html');
    
    document.getElementById('update-stock-id').value = id;
    document.getElementById('update-stock-title').innerText = `Update: ${name}`;
    document.getElementById('update-stock-current').innerText = currentCount;
    
    const thresholdInput = document.getElementById('update-stock-threshold');
    if (thresholdInput) {
        thresholdInput.value = threshold;
    }

    const form = document.getElementById('update-stock-form');
    // Remove old listeners
    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);

    newForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const action = document.getElementById('update-stock-action').value;
        const amountStr = document.getElementById('update-stock-amount').value;
        const amount = parseInt(amountStr);
        let newCount = currentCount;

        if (action === 'Deduct') {
            newCount = Math.max(0, currentCount - amount);
        } else {
            newCount = currentCount + amount;
        }

        const thresholdVal = document.getElementById('update-stock-threshold')?.value;

        const payload = {
            count: newCount,
            action: action,
            amount: amount
        };

        if (thresholdVal !== undefined && thresholdVal !== "") {
            payload.minThreshold = parseInt(thresholdVal);
        }

        const submitBtn = newForm.querySelector('button[type="submit"]');
        const oldText = submitBtn.innerText;
        submitBtn.innerText = "Saving...";
        submitBtn.disabled = true;

        try {
            const res = await fetch(`${API_URL}/admin/inventory/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                credentials: 'include'
            });
            if (!res.ok) throw new Error('Failed to update stock');
            UI.toggleModal('update-stock-modal');
        } catch (err) {
            console.error(err);
            alert('Failed to update stock.');
            submitBtn.innerText = oldText;
            submitBtn.disabled = false;
        }
    });

    UI.toggleModal('update-stock-modal');
}

async function updateGlobalThreshold() {
    const val = document.getElementById('global-threshold-input').value;
    if (!val || isNaN(val)) return;

    if (!confirm(`Are you sure you want to set the low-stock alert threshold to ${val} for ALL raw materials?`)) return;

    try {
        const res = await fetch(`${API_URL}/admin/inventory/global`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ minThreshold: parseInt(val) }),
            credentials: 'include'
        });
        if (!res.ok) throw new Error('Failed to update global threshold');
        document.getElementById('global-threshold-input').value = '';
    } catch (err) {
        console.error(err);
        alert('Failed to update global threshold.');
    }
}

async function fetchInventoryLogs() {
    try {
        const res = await fetch(`${API_URL}/admin/inventory/logs`, { credentials: 'include' });
        if (!res.ok) return;
        const logs = await res.json();
        renderInventoryLogs(logs);
    } catch (err) {
        console.error("Error fetching logs", err);
    }
}

function renderInventoryLogs(logs) {
    const container = document.getElementById('inventory-logs-container');
    if (!container) return;

    if (!logs || logs.length === 0) {
        container.innerHTML = '<p style="color: var(--text-dim); font-size: 0.85rem; text-align: center;">No recent audit logs.</p>';
        return;
    }

    container.innerHTML = logs.map(log => {
        const isAdd = log.action === 'Add';
        const iconColor = isAdd ? '#10b981' : '#ef4444';
        const iconSvg = isAdd ? 
            `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>` : 
            `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="3"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;

        const time = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const date = new Date(log.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });

        return `
            <div style="display: flex; gap: 12px; align-items: flex-start; padding: 10px; background: rgba(255,255,255,0.02); border-radius: 8px; border: 1px solid var(--border-glass);">
                <div style="margin-top: 2px;">${iconSvg}</div>
                <div style="flex: 1;">
                    <p style="margin: 0; font-size: 0.9rem; color: white;">
                        <span style="font-weight: 600;">${log.userId}</span> 
                        ${log.action.toLowerCase()}ed 
                        <span style="font-weight: 600; color: ${iconColor};">${log.amount}</span> 
                        from <span style="font-weight: 600;">${log.inventory?.item || 'Unknown Item'}</span>
                    </p>
                    <p style="margin: 4px 0 0 0; font-size: 0.75rem; color: var(--text-dim);">
                        New Total: ${log.newTotal} • ${date} at ${time}
                    </p>
                </div>
            </div>
        `;
    }).join('');
}

async function openCreateMaterialModal() {
    await ModalManager.loadModal('create-material-modal', 'modals/create-material-modal.html');
    
    const form = document.getElementById('create-material-form');
    // Remove old listeners
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
            const res = await fetch(`${API_URL}/inventory`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                credentials: 'include'
            });
            
            const data = await res.json();
            
            if (!res.ok) {
                throw new Error(data.message || data.error || 'Failed to create material');
            }
            
            UI.toggleModal('create-material-modal');
            // Refresh to show new item
            if (window.refreshDashboardState) window.refreshDashboardState();
            if (typeof showToast === 'function') showToast('Material created successfully!', 'success');
        } catch (err) {
            console.error(err);
            alert(`Error: ${err.message}`);
            submitBtn.innerText = "Create Material";
            submitBtn.disabled = false;
        }
    });

    UI.toggleModal('create-material-modal');
}

function updatePaginationUI() {
    const { pagination } = State._cache;
    const indicator = document.getElementById('orders-page-indicator');
    if (indicator) {
        indicator.innerText = `Page ${pagination.currentPage} of ${pagination.totalPages}`;
    }
}

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
            updateUI(); // Render tables immediately
        }
    } catch (e) {
        console.error('[Admin] Refresh failed', e);
    } finally {
        updateSyncIndicator(false);
        updateUI(); // Always clear skeletons
    }

    // Background tasks: Only run if we actually have a session
    if (AuthManager.isAuthenticated()) {
        updateCharts(); // This handles its own internal fetch
    }
}

function initSocket() {
    if (typeof io === 'undefined') {
        console.warn('[Admin] Socket.IO client not found, retrying...');
        setTimeout(initSocket, 500);
        return;
    }
    const socket = io(SOCKET_URL, {
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        randomizationFactor: 0.5
    });

    socket.on('connect', () => console.log('[Socket] Admin connection established.'));

    socket.on('dataChanged', (data) => {
        console.log('[Socket] Delta received:', data.action, data.entity);
        const { action, entity, payload } = data;

        // Show user-friendly notification
        if (entity === 'ORDER' && action === 'CREATE') {
            showToast('New Customer Order Received!', 'success');
        } else if (entity === 'PRODUCT' && action === 'CREATE') {
            showToast('New Design successfully published!', 'success');
        } else {
            const entityLabel = entity.charAt(0) + entity.slice(1).toLowerCase();
            if (action === 'CREATE') {
                showToast(`New ${entityLabel} created successfully`, 'success');
            } else if (action === 'DELETE') {
                showToast(`${entityLabel} has been removed`, 'warning');
            } else if (action === 'UPDATE' && entity === 'ORDER') {
                showToast(`Order #${payload.orderId || 'Update'} status changed`, 'info');
            }
        }

        // Granular state update instead of full refresh when possible
        if (entity === 'ORDER' && action === 'UPDATE') {
            State._cache.orders = State._cache.orders.map(o => {
                if (payload.ids && payload.ids.includes(o.id)) {
                    return { ...o, status: payload.status, progress: payload.progress };
                }
                return o;
            });
            updateUI();
        } else {
            // Fallback to full refresh for complex changes
            refreshDashboardState();
        }
    });

    socket.on('disconnect', (reason) => {
        console.warn('[Socket] Disconnected:', reason);
        if (reason === 'io server disconnect') socket.connect();
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    initSocket();
    initCharts(); // Initialize charts on load

    // Ensure CSRF token is present before first state fetch
    if (!_csrfToken) await refreshCSRFToken();

    if (AuthManager.isAuthenticated()) {
        refreshDashboardState();
    }

    // Pagination Listeners
    document.getElementById('prev-orders-btn')?.addEventListener('click', () => {
        if (State._cache.pagination.currentPage > 1) {
            State._cache.pagination.currentPage--;
            refreshDashboardState();
        }
    });

    document.getElementById('next-orders-btn')?.addEventListener('click', () => {
        if (State._cache.pagination.currentPage < State._cache.pagination.totalPages) {
            State._cache.pagination.currentPage++;
            refreshDashboardState();
        }
    });
});

// --- Analytics & Charts ---
let charts = {};
function getChartOptions(type = 'line') {
    const isMobile = window.innerWidth < 600;
    return {
        responsive: true,
        maintainAspectRatio: false,
        resizeDelay: 100,
        plugins: {
            legend: {
                display: true,
                position: isMobile ? 'bottom' : 'top',
                labels: {
                    color: '#94a3b8',
                    font: {
                        size: isMobile ? 10 : 12,
                        family: "'Outfit', sans-serif"
                    },
                    padding: isMobile ? 10 : 20,
                    usePointStyle: true
                }
            },
            tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                titleFont: { size: 14, weight: 'bold' },
                bodyFont: { size: 13 },
                padding: 12,
                cornerRadius: 10,
                displayColors: true
            }
        },
        scales: type === 'doughnut' ? {} : {
            x: {
                grid: { display: false },
                ticks: {
                    color: '#94a3b8',
                    font: { size: isMobile ? 9 : 11 },
                    maxRotation: isMobile ? 45 : 0,
                    autoSkip: true,
                    maxTicksLimit: isMobile ? 6 : 12
                }
            },
            y: {
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                ticks: {
                    color: '#94a3b8',
                    font: { size: isMobile ? 9 : 11 },
                    beginAtZero: true
                }
            }
        }
    };
}

function initCharts() {
    if (typeof Chart === 'undefined') {
        console.warn('Chart.js not loaded yet. Skipping chart initialization.');
        return;
    }

    const chartConfig = [
        { id: 'orderTrendsChart', key: 'trends', type: 'line', color: '#6366f1', fill: 'rgba(99, 102, 241, 0.1)' },
        { id: 'statusDistChart', key: 'dist', type: 'doughnut', colors: ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'] },
        { id: 'topOrderedChart', key: 'topOrdered', type: 'bar', color: '#10b981' },
        { id: 'topLikedChart', key: 'topLiked', type: 'bar', color: '#f59e0b' },
        { id: 'trafficChart', key: 'traffic', type: 'line', color: '#8b5cf6', fill: 'rgba(139, 92, 246, 0.1)' }
    ];

    chartConfig.forEach(cfg => {
        const el = document.getElementById(cfg.id);
        if (!el || charts[cfg.key]) return; // Don't re-init if already exists
        const ctx = el.getContext('2d');
        
        const options = getChartOptions(cfg.type);

        if (cfg.type === 'doughnut') {
            charts[cfg.key] = new Chart(ctx, {
                type: 'doughnut',
                data: { labels: [], datasets: [{ data: [], backgroundColor: cfg.colors, borderWidth: 0 }] },
                options
            });
        } else if (cfg.type === 'bar') {
            charts[cfg.key] = new Chart(ctx, {
                type: 'bar',
                data: { labels: [], datasets: [{ label: cfg.id.includes('Order') ? 'Orders' : 'Likes', data: [], backgroundColor: cfg.color, borderRadius: 6 }] },
                options
            });
        } else {
            charts[cfg.key] = new Chart(ctx, {
                type: 'line',
                data: { labels: [], datasets: [{ label: cfg.id.includes('Trend') ? 'Revenue' : 'Visits', data: [], borderColor: cfg.color, borderWidth: 3, tension: 0.4, fill: true, backgroundColor: cfg.fill }] },
                options
            });
        }
    });

    if (State._cache.analytics) {
        renderAnalytics(State._cache.analytics);
    }
}

// Separate data rendering from API fetching
function renderAnalytics(data) {
    if (!data) return;

    if (charts.trends && data.orderTrends) {
        charts.trends.data.labels = data.orderTrends.map(t => `${t._id.month}/${t._id.year}`);
        charts.trends.data.datasets[0].data = data.orderTrends.map(t => t.revenue);
        charts.trends.update('none');
    }
    if (charts.dist && data.statusDistribution) {
        charts.dist.data.labels = data.statusDistribution.map(d => d._id);
        charts.dist.data.datasets[0].data = data.statusDistribution.map(d => d.count);
        charts.dist.update('none');
    }
    if (charts.topOrdered && data.topOrdered) {
        charts.topOrdered.data.labels = data.topOrdered.map(d => d._id);
        charts.topOrdered.data.datasets[0].data = data.topOrdered.map(d => d.count);
        charts.topOrdered.update('none');
    }
    if (charts.topLiked) {
        if (data.topLiked && data.topLiked.length > 0) {
            charts.topLiked.data.labels = data.topLiked.map(d => d._id);
            charts.topLiked.data.datasets[0].data = data.topLiked.map(d => d.count);
        } else {
            charts.topLiked.data.labels = ['No data'];
            charts.topLiked.data.datasets[0].data = [0];
        }
        charts.topLiked.update('none');
    }
    if (charts.traffic && data.orderTrends) {
         // Fallback logic for traffic if backend doesn't provide explicit traffic object
         charts.traffic.data.labels = data.orderTrends.map(t => `${t._id.month}/${t._id.year}`);
         charts.traffic.data.datasets[0].data = data.orderTrends.map(t => Math.floor(t.revenue / 20) + 10);
         charts.traffic.update('none');
    }

    // Update Stat Cards
    const visitsEl = document.getElementById('analytics-total-visits');
    if (visitsEl) visitsEl.innerText = (data.totalVisits || 0).toLocaleString();

    const avgEl = document.getElementById('analytics-avg-order');
    if (avgEl) avgEl.innerText = `$${parseFloat(data.avgOrderValue || 0).toFixed(2)}`;

    const peakEl = document.getElementById('analytics-peak-season');
    if (peakEl && data.orderTrends && data.orderTrends.length > 0) {
        const sorted = [...data.orderTrends].sort((a, b) => b.revenue - a.revenue);
        peakEl.innerText = `${sorted[0]._id.month}/${sorted[0]._id.year}`;
    }
}

async function updateCharts() {
    try {
        const res = await apiFetch(`${API_URL}/analytics`);
        if (!res.ok) return;
        const data = await res.json();
        State._cache.analytics = data; 
        renderAnalytics(data);
    } catch (err) {
        console.error('[Analytics] Failed to fetch data', err);
    }
}

function updateAITip() {
    const tipEl = document.getElementById('ai-main-tip');
    const insightsContainer = document.getElementById('ai-insights-container');
    if (!tipEl || !insightsContainer) return;

    const orders = State._cache.orders || [];
    const products = State._cache.products || [];

    const pendingOrders = orders.filter(o => ['In Queue', 'Preparing Order', 'In Transit', 'Ready For Pick Up'].includes(o.status));
    const completedOrders = orders.filter(o => o.status === 'Order Delivered');

    // 1. Determine Main Tip
    if (pendingOrders.length > 10) {
        tipEl.innerText = `Revenue Alert: High volume detected. ${pendingOrders.length} orders are currently generating value in the queue.`;
    } else if (pendingOrders.length > 0) {
        tipEl.innerText = `Operational Health: Stable. You have ${pendingOrders.length} active orders moving through the system.`;
    } else {
        tipEl.innerText = `System Status: Ready. All orders have been fulfilled. Awaiting new designs or customer checkout.`;
    }

    // 2. Build Insights Cards
    const insights = [];

    // Revenue Projection
    const projectedRev = pendingOrders.reduce((sum, o) => sum + (o.totalAmount || o.amount || 0), 0);
    insights.push(`
        <div style="background: rgba(255,255,255,0.03); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-glass);">
            <p style="font-size: 0.7rem; color: var(--text-dim); text-transform: uppercase; margin: 0;">Queued Revenue</p>
            <p style="font-size: 0.85rem; color: #10b981; font-weight: 600; margin: 0;">$${projectedRev.toFixed(2)}</p>
        </div>
    `);

    // Total Completed Sales
    const totalSales = completedOrders.reduce((sum, o) => sum + (o.totalAmount || o.amount || 0), 0);
    insights.push(`
        <div style="background: rgba(255,255,255,0.03); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-glass);">
            <p style="font-size: 0.7rem; color: var(--text-dim); text-transform: uppercase; margin: 0;">Realized Revenue</p>
            <p style="font-size: 0.85rem; color: var(--primary); font-weight: 600; margin: 0;">$${totalSales.toFixed(2)}</p>
        </div>
    `);

    // MVP Design (Most Favorited)
    const topFav = (State._cache.analytics?.topLiked || [])[0];
    if (topFav && topFav.count > 0) {
        insights.push(`
            <div style="background: rgba(255,255,255,0.03); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-glass);">
                <p style="font-size: 0.7rem; color: var(--text-dim); text-transform: uppercase; margin: 0;">Most Wanted Design</p>
                <p style="font-size: 0.85rem; color: #f472b6; font-weight: 600; margin: 0;">${topFav._id}</p>
            </div>
        `);
    } else if (products.length > 0) {
        const topProduct = products[0];
        insights.push(`
            <div style="background: rgba(255,255,255,0.03); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-glass);">
                <p style="font-size: 0.7rem; color: var(--text-dim); text-transform: uppercase; margin: 0;">Catalog Highlight</p>
                <p style="font-size: 0.85rem; color: var(--text-main); font-weight: 600; margin: 0;">${topProduct.name}</p>
            </div>
        `);
    }

    // Active Velocity
    insights.push(`
        <div style="background: rgba(255,255,255,0.03); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-glass);">
            <p style="font-size: 0.7rem; color: var(--text-dim); text-transform: uppercase; margin: 0;">Order Velocity</p>
            <p style="font-size: 0.85rem; color: var(--primary); font-weight: 600; margin: 0;">${pendingOrders.length} Active</p>
        </div>
    `);

    insightsContainer.innerHTML = insights.join('');
}


// --- Product & Staff Actions ---
// --- Product & Staff Actions moved to consolidated handlers ---

// --- Initialization ---
// Initialize page forms and extra UI components
document.addEventListener('DOMContentLoaded', () => {
    // Search listeners
    ['admin-orders-search', 'admin-products-search', 'admin-staff-search', 'admin-history-search'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => updateUI());
    });

    // Product and Staff form logic

    // Create Product Form
    const productForm = document.getElementById('create-product-form');
    if (productForm) {
        productForm.onsubmit = async (e) => {
            e.preventDefault();
            window.createProduct();
        };
    }

    // Create/Edit Staff Form
    const staffForm = document.getElementById('create-staff-form');
    if (staffForm) {
        staffForm.onsubmit = async (e) => {
            e.preventDefault();
            const id = staffForm.dataset.editId;
            const data = {
                username: document.getElementById('staff-username').value,
                email: document.getElementById('staff-email').value,
                password: document.getElementById('staff-password').value,
                role: document.getElementById('staff-role').value,
                phoneNumber: document.getElementById('staff-phone').value,
                address: document.getElementById('staff-address').value
            };

            const method = id ? 'PUT' : 'POST';
            const url = id ? `${API_URL}/users/${id}` : `${API_URL}/users`;

            updateSyncIndicator(true);
            const res = await apiFetch(url, { method, body: JSON.stringify(data) });
            updateSyncIndicator(false);

            if (res.ok) {
                showToast(id ? 'Account updated successfully' : 'Personnel account established');
                UI.toggleModal('staff-modal');
                staffForm.reset();
                delete staffForm.dataset.editId;
                refreshDashboardState();
            } else {
                const err = await res.json();
                showToast(err.message || 'Operation failed');
            }
        };
    }
});


window.deleteUser = async (id) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    const res = await apiFetch(`${API_URL}/users/${id}`, { method: 'DELETE' });
    if (res.ok) {
        showToast('User deleted');
        refreshDashboardState();
    }
};

// Batch Status Update Handler
document.addEventListener('DOMContentLoaded', () => {
    const batchBtn = document.getElementById('admin-batch-update-btn');
    if (batchBtn) {
        batchBtn.onclick = async () => {
            const status = document.getElementById('admin-batch-status').value;
            const selectedIds = Array.from(document.querySelectorAll('.admin-order-checkbox:checked')).map(cb => cb.dataset.id);
            if (!status || selectedIds.length === 0) return showToast('Select status and orders');

            // Optimistic Update
            State._prevCache = JSON.parse(JSON.stringify(State._cache));
            State._cache.orders = State._cache.orders.map(o =>
                selectedIds.includes(o.id) ? { ...o, status } : o
            );
            updateUI();

            updateSyncIndicator(true);
            const res = await apiFetch(`${API_URL}/orders/batch-status`, {
                method: 'POST',
                body: JSON.stringify({ ids: selectedIds, status })
            });
            updateSyncIndicator(false);

            if (res.ok) {
                showToast('Orders updated');
                refreshDashboardState();
            } else {
                // Rollback
                State._cache = State._prevCache;
                updateUI();
                const data = await res.json();
                showToast(`Failed to update: ${data.message || 'Server error'}`);
            }
        };
    }

    // Pagination Listeners
    const prevBtn = document.getElementById('prev-orders-btn');
    const nextBtn = document.getElementById('next-orders-btn');
    if (prevBtn) {
        prevBtn.onclick = () => {
            if (State._cache.pagination.currentPage > 1) {
                State._cache.pagination.currentPage--;
                refreshDashboardState();
            }
        };
    }
    if (nextBtn) {
        nextBtn.onclick = () => {
            if (State._cache.pagination.currentPage < State._cache.pagination.totalPages) {
                State._cache.pagination.currentPage++;
                refreshDashboardState();
            }
        };
    }
});

// --- Receipt Viewer ---

window.viewReceipt = async (transactionID) => {
    if (!transactionID || transactionID === 'undefined') return showToast('No transaction found for this order');

    await ModalManager.loadModal('receipt-modal', 'modals/receipt-modal.html');
    UI.toggleModal('receipt-modal');
    const content = document.getElementById('receipt-content');
    content.innerHTML = '<p style="text-align: center; padding: 20px;">Fetching receipt details...</p>';

    try {
        const res = await apiFetch(`/api/payments/receipt/${transactionID}`);
        if (!res.ok) throw new Error('Failed to fetch receipt');
        const data = await res.json();

        content.innerHTML = `
            <div style="background: rgba(255,255,255,0.03); border-radius: 16px; padding: 24px; border: 1px solid var(--border-glass);">
                <div style="display: flex; justify-content: space-between; margin-bottom: 16px; border-bottom: 1px solid var(--border-glass); padding-bottom: 16px;">
                    <span style="color: var(--text-dim);">Transaction ID:</span>
                    <span style="font-family: monospace; color: var(--primary);">${data.transactionID}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                    <span style="color: var(--text-dim);">Order ID:</span>
                    <span>${data.orderID}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                    <span style="color: var(--text-dim);">Date:</span>
                    <span>${new Date(data.timestamp).toLocaleString()}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 24px;">
                    <span style="color: var(--text-dim);">Client:</span>
                    <span>${data.client || 'Guest'}</span>
                </div>
                
                <h4 style="margin-bottom: 12px; color: var(--text-main);">Items</h4>
                <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px;">
                    ${data.items && data.items.length > 0 ? data.items.map(item => `
                        <div style="display: flex; justify-content: space-between; font-size: 0.9rem;">
                            <span>${item.name} x${item.quantity}</span>
                            <span>$${(item.price * item.quantity).toFixed(2)}</span>
                        </div>
                    `).join('') : '<p style="font-size: 0.85rem; color: var(--text-dim);">No item details available.</p>'}
                </div>
                
                <div style="display: flex; justify-content: space-between; border-top: 1px solid var(--border-glass); padding-top: 16px; font-weight: 700; font-size: 1.1rem;">
                    <span>Total Amount:</span>
                    <span style="color: var(--primary);">$${parseFloat(data.amount || 0).toFixed(2)}</span>
                </div>
                <div style="text-align: center; margin-top: 16px;">
                    <span class="status-pill" style="text-transform: uppercase; font-size: 0.7rem;">${data.status}</span>
                </div>
            </div>
        `;
    } catch (err) {
        content.innerHTML = `<p style="color: #ef4444; text-align: center;">Error: ${err.message}</p>`;
    }
};

window.openCreateStaff = async () => {
    await ModalManager.loadModal('staff-modal', 'modals/staff-modal.html');
    const form = document.getElementById('create-staff-form');
    if (form) {
        form.reset();
        delete form.dataset.editId;
        document.querySelector('#staff-modal h3').innerText = 'Create Staff Account';
        document.getElementById('staff-submit-btn').innerText = 'Establish Personnel Account';
        document.getElementById('staff-password-label').innerText = 'Password';
        document.getElementById('staff-password').required = true;
    }
    UI.toggleModal('staff-modal');
};

window.openEditStaff = async (id) => {
    await ModalManager.loadModal('staff-modal', 'modals/staff-modal.html');
    const user = State._cache.users.find(u => (u.id || u._id) === id);
    if (!user) return showToast('User not found');

    const form = document.getElementById('create-staff-form');
    if (form) {
        form.dataset.editId = id;
        document.getElementById('staff-username').value = user.username || '';
        document.getElementById('staff-email').value = user.email || '';
        document.getElementById('staff-role').value = user.role || 'employee';
        document.getElementById('staff-phone').value = user.phoneNumber || '';
        document.getElementById('staff-address').value = user.address || '';
        document.getElementById('staff-password').value = ''; // Don't show hashed password

        document.querySelector('#staff-modal h3').innerText = 'Edit Account Details';
        document.getElementById('staff-submit-btn').innerText = 'Update Personnel Account';
        document.getElementById('staff-password-label').innerText = 'Reset Password (Optional)';
        document.getElementById('staff-password').required = false;
    }
    UI.toggleModal('staff-modal');
};

window.openCreateProduct = async () => {
    await ModalManager.loadModal('create-product-modal', 'modals/create-product-modal.html');
    const form = document.getElementById('create-product-form');
    if (form) {
        form.reset();
        delete form.dataset.editId;
        document.querySelector('#create-product-modal h2').innerText = 'Publish New Design';
    }
    UI.toggleModal('create-product-modal');
};

window.openEditProduct = async (id) => {
    await ModalManager.loadModal('create-product-modal', 'modals/create-product-modal.html');
    const product = State._cache.products.find(p => (p.id || p._id) === id);
    if (!product) return showToast('Design not found');

    const form = document.getElementById('create-product-form');
    if (form) {
        form.dataset.editId = id;
        document.getElementById('product-name').value = product.name || '';
        document.getElementById('product-price').value = product.price || '';
        document.getElementById('product-tag').value = product.tag || '';
        document.getElementById('product-desc').value = product.description || '';
        document.querySelector('#create-product-modal h2').innerText = 'Edit Design Details';
    }
    UI.toggleModal('create-product-modal');
};

window.downloadReceipt = (receiptId) => {
    if (!receiptId) return showToast('Receipt ID missing');
    window.open(`/api/customer/receipt/${receiptId}/download`, '_blank');
};

window.deleteUser = async (id) => {
    if (!confirm('Are you sure you want to remove this personnel account?')) return;
    const response = await apiFetch(`${API_URL}/users/${id}`, { method: 'DELETE' });
    if (response.ok) {
        showToast('Account removed successfully');
        const data = await State.getDashboardState();
        if (data) updateUI();
    } else {
        const err = await response.text();
        showToast(`Failed to remove: ${err}`);
    }
};

window.deleteProduct = async (id) => {
    if (!confirm('Are you sure you want to delete this design?')) return;
    const response = await apiFetch(`${API_URL}/products/${id}`, { method: 'DELETE' });
    if (response.ok) {
        showToast('Design deleted successfully');
        const data = await State.getDashboardState();
        if (data) updateUI();
    } else {
        const err = await response.text();
        showToast(`Deletion failed: ${err}`);
    }
};

window.viewReceipt = async (id) => {
    if (!id || id === 'undefined') return showToast('Transaction ID not available');
    await ModalManager.loadModal('receipt-modal', 'modals/receipt-modal.html');
    UI.toggleModal('receipt-modal');
    
    const content = document.getElementById('receipt-content');
    content.innerHTML = '<p>Retrieving secure transaction data...</p>';
    
    try {
        // We use the customer API for receipts as it's a shared resource
        const res = await apiFetch(`/api/customer/receipt/${id}`);
        if (!res.ok) throw new Error('Receipt not found');
        const data = await res.json();
        
        content.innerHTML = `
            <div style="border-bottom: 1px dashed var(--border-glass); padding-bottom: 15px; margin-bottom: 15px;">
                <p style="font-size: 0.8rem; color: var(--text-dim); text-transform: uppercase;">Transaction ID</p>
                <p style="font-family: monospace; color: var(--primary);">${data.transactionID}</p>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div>
                    <p style="font-size: 0.8rem; color: var(--text-dim); text-transform: uppercase;">Customer</p>
                    <p>${data.client}</p>
                </div>
                <div>
                    <p style="font-size: 0.8rem; color: var(--text-dim); text-transform: uppercase;">Total Amount</p>
                    <p style="font-weight: 700; color: #10b981;">$${parseFloat(data.amount).toFixed(2)}</p>
                </div>
                <div>
                    <p style="font-size: 0.8rem; color: var(--text-dim); text-transform: uppercase;">Date</p>
                    <p>${new Date(data.timestamp).toLocaleDateString()}</p>
                </div>
                <div>
                    <p style="font-size: 0.8rem; color: var(--text-dim); text-transform: uppercase;">Status</p>
                    <p>${data.status}</p>
                </div>
            </div>
            <div style="margin-top: 20px;">
                <p style="font-size: 0.8rem; color: var(--text-dim); text-transform: uppercase; margin-bottom: 10px;">Items</p>
                ${(data.items || []).map(item => `
                    <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <span>${item.name}</span>
                        <span>$${parseFloat(item.price).toFixed(2)}</span>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (err) {
        content.innerHTML = `<p style="color: #ef4444;">${err.message}</p>`;
    }
};

window.openEditOrder = async (id) => {
    await ModalManager.loadModal('edit-order-modal', 'modals/edit-order-modal.html');
    const order = State._cache.orders.find(o => (o.id || o.id) === id);
    if (!order) return showToast('Order not found');

    const form = document.getElementById('edit-order-form');
    if (form) {
        form.dataset.editId = id; // Standardizing on editId for all forms
        document.getElementById('edit-order-status').value = order.status;
        
        // Setup status button group
        const statusBtns = document.querySelectorAll('.status-btn');
        statusBtns.forEach(btn => {
            if (btn.dataset.value === order.status) {
                btn.style.background = 'var(--primary)';
                btn.style.color = 'white';
            } else {
                btn.style.background = 'rgba(255,255,255,0.05)';
                btn.style.color = 'var(--text-dim)';
            }
            
            btn.onclick = () => {
                document.getElementById('edit-order-status').value = btn.dataset.value;
                statusBtns.forEach(b => {
                    b.style.background = 'rgba(255,255,255,0.05)';
                    b.style.color = 'var(--text-dim)';
                });
                btn.style.background = 'var(--primary)';
                btn.style.color = 'white';
            };
        });
    }
    UI.toggleModal('edit-order-modal');
};

// --- Delegated Form Handlers ---
document.addEventListener('submit', async (e) => {
    // 1. Staff Form
    if (e.target.id === 'create-staff-form') {
        e.preventDefault();
        const form = e.target;
        const editId = form.dataset.editId;
        const password = document.getElementById('staff-password').value;
        
        const payload = {
            username: document.getElementById('staff-username').value,
            email: document.getElementById('staff-email').value,
            role: document.getElementById('staff-role').value,
            phoneNumber: document.getElementById('staff-phone').value,
            address: document.getElementById('staff-address').value
        };

        if (password) payload.password = password;

        const method = editId ? 'PUT' : 'POST';
        const url = editId ? `${API_URL}/users/${editId}` : `${API_URL}/users`;

        const response = await apiFetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            showToast(editId ? 'Account updated' : 'Account established');
            UI.toggleModal('staff-modal');
            const data = await State.getDashboardState();
            if (data) updateUI();
        } else {
            const err = await response.text();
            showToast(`Operation failed: ${err}`);
        }
    }

    // 2. Product Form (Multi-part for images)
    if (e.target.id === 'create-product-form') {
        e.preventDefault();
        const form = e.target;
        const editId = form.dataset.editId;
        const formData = new FormData();

        formData.append('name', document.getElementById('product-name').value);
        formData.append('price', document.getElementById('product-price').value);
        formData.append('tag', document.getElementById('product-tag').value);
        formData.append('description', document.getElementById('product-desc').value);

        const imageFile = document.getElementById('product-image-file').files[0];
        if (imageFile) formData.append('image', imageFile);

        const method = editId ? 'PATCH' : 'POST'; // Note: routes/admin.js uses PATCH for edit
        const url = editId ? `${API_URL}/products/${editId}` : `${API_URL}/products`;

        const response = await apiFetch(url, {
            method,
            body: formData // apiFetch handles headers for FormData
        });

        if (response.ok) {
            showToast(editId ? 'Design updated' : 'Design published');
            UI.toggleModal('create-product-modal');
            const data = await State.getDashboardState();
            if (data) updateUI();
        } else {
            const err = await response.text();
            showToast(`Catalog update failed: ${err}`);
        }
    }

    // 3. Edit Order Form
    if (e.target.id === 'edit-order-form') {
        e.preventDefault();
        const form = e.target;
        const orderId = form.dataset.editId;
        const status = document.getElementById('edit-order-status').value;

        if (!status) return showToast('Please select a status');

        const saveBtn = form.querySelector('button[type="submit"]');
        const originalText = saveBtn.innerText;
        saveBtn.innerText = 'Saving...';
        saveBtn.disabled = true;

        try {
            const response = await apiFetch(`${API_URL}/orders/batch-status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: [orderId], status })
            });

            if (response.ok) {
                showToast('Order status updated');
                UI.toggleModal('edit-order-modal');
                const data = await State.getDashboardState();
                if (data) updateUI();
            } else {
                const err = await response.json().catch(() => ({ message: 'Update failed' }));
                showToast(`Error: ${err.message}`);
            }
        } catch (error) {
            showToast('Network error during update');
        } finally {
            saveBtn.innerText = originalText;
            saveBtn.disabled = false;
        }
    }
});

// Global Click Delegation
document.addEventListener('click', (e) => {
    // 1. Status Button Clicks
    const statusBtn = e.target.closest('.status-btn');
    if (statusBtn) {
        document.querySelectorAll('.status-btn').forEach(b => {
            b.classList.remove('btn-primary');
            b.style.background = 'rgba(255,255,255,0.05)';
            b.style.color = 'var(--text-dim)';
        });
        statusBtn.classList.add('btn-primary');
        statusBtn.style.background = 'var(--primary)';
        statusBtn.style.color = 'white';
        
        const input = document.getElementById('edit-order-status');
        if (input) input.value = statusBtn.dataset.value;
        return;
    }
});

// Date Picker Listeners
document.addEventListener('change', (e) => {
    if (e.target.id === 'admin-orders-date' || e.target.id === 'admin-history-date') {
        updateUI();
    }
});


// Initial Load
refreshDashboardState();
