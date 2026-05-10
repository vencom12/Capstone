const fs = require('fs');
const path = require('path');

const stylesPath = 'public/legacy/styles.css';
const cssRoot = 'public/legacy/css';
const content = fs.readFileSync(stylesPath, 'utf8');

const buckets = {
    'base/base.css': [],
    'header/header-base.css': [],
    'header/header-logo.css': [],
    'header/header-navbar.css': [],
    'header/header-user.css': [],
    'sidebar/sidebar-base.css': [],
    'sidebar/sidebar-nav.css': [],
    'sidebar/sidebar-toggle.css': [],
    'sidebar/sidebar-submenu.css': [],
    'content/content-base.css': [],
    'content/content-cards.css': [],
    'content/content-table.css': [],
    'content/content-forms.css': [],
    'utilities/utilities.css': []
};

// Simplified parser to split rules (handling nested media queries is complex, so we'll do block-based)
// This is a rough heuristic-based splitter.
const rules = content.split(/(?=\n[.#*@:\[])/);

rules.forEach(rule => {
    const lower = rule.toLowerCase();
    
    // Base
    if (lower.includes(':root') || lower.includes('@keyframes') || lower.includes('body {') || lower.startsWith('* {') || lower.includes('scrollbar') || lower.includes('.skeleton')) {
        buckets['base/base.css'].push(rule);
    }
    // Header
    else if (lower.includes('.storefront-header')) {
        buckets['header/header-base.css'].push(rule);
    }
    else if (lower.includes('.header-brand') || lower.includes('.nav-logo')) {
        buckets['header/header-logo.css'].push(rule);
    }
    else if (lower.includes('.header-search') || lower.includes('.header-actions') || lower.includes('.header-btn')) {
        buckets['header/header-user.css'].push(rule);
    }
    // Sidebar
    else if (lower.includes('.sidebar') && !lower.includes('.nav-links') && !lower.includes('.category')) {
        buckets['sidebar/sidebar-base.css'].push(rule);
    }
    else if (lower.includes('.nav-links')) {
        buckets['sidebar/sidebar-nav.css'].push(rule);
    }
    else if (lower.includes('.category')) {
        buckets['sidebar/sidebar-submenu.css'].push(rule);
    }
    // Content / Components
    else if (lower.includes('.product-card') || lower.includes('.stat-card') || lower.includes('.task-card') || lower.includes('.glass {')) {
        buckets['content/content-cards.css'].push(rule);
    }
    else if (lower.includes('table') || lower.includes('.table-container') || lower.includes('.table-header') || lower.includes('.table-controls')) {
        buckets['content/content-table.css'].push(rule);
    }
    else if (lower.includes('.input-group') || lower.includes('.glass-select') || lower.includes('input[') || lower.includes('.checkout') || lower.includes('.payment')) {
        buckets['content/content-forms.css'].push(rule);
    }
    else if (lower.includes('main {') || lower.includes('.module-section') || lower.includes('-grid') || lower.includes('.dashboard-container') || lower.includes('.storefront-container')) {
        buckets['content/content-base.css'].push(rule);
    }
    // Utilities / Catch-all
    else {
        buckets['utilities/utilities.css'].push(rule);
    }
});

// Write files
for (const [file, lines] of Object.entries(buckets)) {
    const filePath = path.join(cssRoot, file);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `/* Refactored from styles.css */\n` + lines.join('\n'));
    console.log(`Wrote ${lines.length} rules to ${filePath}`);
}
