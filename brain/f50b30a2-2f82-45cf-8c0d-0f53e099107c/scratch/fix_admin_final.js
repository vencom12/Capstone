const fs = require('fs');
const path = 'c:/Users/revin/Downloads/Capstone/public/legacy/admin.html';
let content = fs.readFileSync(path, 'utf8');

// 1. Remove the extra </div> at line 303 (roughly)
// It's after </header> and before <div class="table-container
content = content.replace(/<\/header>\s*<\/div>\s*<div class="table-container/g, '</header>\n\n                <div class="table-container');

// 2. Restore the AI Production Advice and fix the end of Section Overview
const overviewEndSearch = /<\/table>\s*<\/div>\s*<\/div>\s*<\/section>/; 
// Wait, I need to be careful.

// Let's just find the end of the orders table and put the AI block there.
const ordersTableEnd = 'admin-orders-pagination" class="pagination-controls"';
const tableContainerEnd = '<!-- Pagination Controls -->\n                        <div id="admin-orders-pagination"';
// This is too complex.

// I'll just rewrite the whole Overview section from 305 to 352.
const startMarker = '<div class="table-container glass">';
const endMarker = '<section id="section-inventory"';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex !== -1 && endIndex !== -1) {
    const replacement = `<div class="table-container glass">
                        <table>
                            <thead>
                                <tr>
                                    <th>Order ID</th>
                                    <th>Client</th>
                                    <th>Design</th>
                                    <th>Total</th>
                                    <th>Status</th>
                                    <th>Timestamp</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody id="admin-order-table-body">
                                <!-- Skeleton Loaders -->
                                <tr class="skeleton-row">
                                    <td data-label="Order ID"><div class="skeleton skeleton-line"></div></td>
                                    <td data-label="Customer"><div class="skeleton skeleton-line"></div></td>
                                    <td data-label="Design"><div class="skeleton skeleton-line"></div></td>
                                    <td data-label="Total"><div class="skeleton skeleton-line"></div></td>
                                    <td data-label="Status"><div class="skeleton skeleton-line"></div></td>
                                    <td data-label="Timestamp"><div class="skeleton skeleton-line"></div></td>
                                    <td data-label="Action"><div class="skeleton skeleton-line"></div></td>
                                </tr>
                            </tbody>
                        </table>
                        <!-- Pagination Controls -->
                        <div id="admin-orders-pagination" class="pagination-controls"
                            style="margin-top: 20px; display: flex; justify-content: center; gap: 10px; align-items: center;">
                            <button id="prev-orders-btn" class="btn glass" style="padding: 6px 12px;">←</button>
                            <span id="orders-page-indicator" style="color: var(--text-dim); font-size: 0.9rem;">Page 1
                                of 1</span>
                            <button id="next-orders-btn" class="btn glass" style="padding: 6px 12px;">→</button>
                        </div>
                    </div>

                    <!-- AI-Driven Production Optimizer -->
                    <div id="ai-production-advice" class="glass"
                        style="margin-top: 24px; padding: 24px; border-left: 4px solid var(--primary); display: flex; flex-direction: column; gap: 8px;">
                        <div style="display:flex; gap:12px; align-items:center;">
                            <div
                                style="width:10px; height:10px; border-radius:50%; background:var(--primary); box-shadow:0 0 10px var(--primary);">
                            </div>
                            <p style="font-size:0.9rem; color:var(--text-main); font-weight:600;">Stitch-Opt Intelligence Report</p>
                        </div>
                        <p id="ai-main-tip" style="font-size:0.85rem; color:var(--text-main); margin-top:4px; line-height:1.4; font-weight: 500;">Analyzing current production queue...</p>
                        <div id="ai-insights-container" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;">
                            <!-- Dynamically filled by JS -->
                        </div>
                    </div>
            </section>

            `;
    
    const newContent = content.substring(0, startIndex) + replacement + content.substring(endIndex);
    fs.writeFileSync(path, newContent, 'utf8');
    console.log('Successfully rebuilt Overview section and fixed extra div.');
} else {
    console.log('Could not find markers:', {startIndex, endIndex});
}
