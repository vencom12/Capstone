const fs = require('fs');
const path = 'c:/Users/revin/Downloads/Capstone/public/legacy/admin.html';
let content = fs.readFileSync(path, 'utf8');

const target = /[\s\S]*?<!-- Section: Inventory \(Remade\) -->/;
// This regex will match everything from the start of the file to the inventory comment.
// No, that's not good.

// Let's just find the point after the last </div> before Inventory.
const searchStr = 'of 1</span>\n                            <button id="next-orders-btn" class="btn glass" style="padding: 6px 12px;">→</button>\n                        </div>\n                    </div>';
const replacement = `                    </div>
            </section>

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

            <!-- Section: Inventory (Remade) -->`;

// Actually, I'll just look for the first occurrence of section-inventory and insert before it.
const inventoryIndex = content.indexOf('<section id="section-inventory"');
if (inventoryIndex !== -1) {
    const before = content.substring(0, inventoryIndex);
    const after = content.substring(inventoryIndex);
    
    // Check if </section> is missing before inventoryIndex
    const lastSectionClose = before.lastIndexOf('</section>');
    const lastSectionOpen = before.lastIndexOf('<section');
    
    if (lastSectionClose < lastSectionOpen) {
        console.log('Detected missing section close. Fixing...');
        const fixedContent = before + '\n            </section>\n\n' + after;
        fs.writeFileSync(path, fixedContent, 'utf8');
    }
}
