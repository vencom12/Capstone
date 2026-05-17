const fs = require('fs');
const path = require('path');

const cssRoot = 'public/legacy/css';
const files = [
    'base/base.min.css',
    'header/header-base.min.css',
    'header/header-logo.min.css',
    'header/header-navbar.min.css',
    'header/header-user.min.css',
    'sidebar/sidebar-base.min.css',
    'sidebar/sidebar-nav.min.css',
    'sidebar/sidebar-toggle.min.css',
    'sidebar/sidebar-submenu.min.css',
    'content/content-base.min.css',
    'content/content-cards.min.css',
    'content/content-table.min.css',
    'content/content-forms.min.css',
    'utilities/utilities.min.css'
];

let bundled = '';
files.forEach(file => {
    const filePath = path.join(cssRoot, file);
    if (fs.existsSync(filePath)) {
        bundled += fs.readFileSync(filePath, 'utf8') + '\n';
    } else {
        console.warn(`File not found: ${filePath}`);
    }
});

const outputPath = path.join(cssRoot, 'main.min.css');
fs.writeFileSync(outputPath, bundled);
console.log(`Successfully bundled 14 files into ${outputPath}`);
