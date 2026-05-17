const path = require('path');
const fs = require('fs');

console.log('--- Path Diagnostic ---');
console.log('Current Process Dir:', process.cwd());
console.log('__dirname (this script):', __dirname);

const relativePath = path.resolve(__dirname, 'uploads');
console.log('Resolved uploads (local):', relativePath);

const parentRelative = path.resolve(__dirname, '../uploads');
console.log('Resolved uploads (parent):', parentRelative);

if (fs.existsSync(parentRelative)) {
    console.log('SUCCESS: Parent uploads directory exists at:', parentRelative);
} else {
    console.log('FAILURE: Parent uploads directory NOT FOUND at:', parentRelative);
}
