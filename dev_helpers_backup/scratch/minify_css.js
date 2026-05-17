const fs = require('fs');
const path = require('path');

const cssRoot = 'public/legacy/css';
const subdirs = ['base', 'header', 'sidebar', 'content', 'utilities'];

subdirs.forEach(subdir => {
    const dirPath = path.join(cssRoot, subdir);
    if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath);
        files.forEach(file => {
            if (file.endsWith('.css') && !file.endsWith('.min.css')) {
                const filePath = path.join(dirPath, file);
                let content = fs.readFileSync(filePath, 'utf8');
                
                // Basic minification
                let minified = content
                    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
                    .replace(/\s+/g, ' ')             // Collapse whitespace
                    .replace(/\s*([{}:;,])\s*/g, '$1') // Remove spaces around delimiters
                    .trim();
                
                const minPath = path.join(dirPath, file.replace('.css', '.min.css'));
                fs.writeFileSync(minPath, minified);
                console.log(`Minified ${file} to ${minPath}`);
            }
        });
    }
});
