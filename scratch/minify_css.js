const fs = require('fs');
const path = require('path');

const cssDir = 'public/legacy/css';
const files = ['base.css', 'layout.css', 'modules.css'];

files.forEach(file => {
    const filePath = path.join(cssDir, file);
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        
        // Basic minification
        let minified = content
            .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
            .replace(/\s+/g, ' ')             // Collapse whitespace
            .replace(/\s*([{}:;,])\s*/g, '$1') // Remove spaces around delimiters
            .trim();
        
        const minPath = path.join(cssDir, file.replace('.css', '.min.css'));
        fs.writeFileSync(minPath, minified);
        console.log(`Minified ${file} to ${minPath}`);
    }
});
