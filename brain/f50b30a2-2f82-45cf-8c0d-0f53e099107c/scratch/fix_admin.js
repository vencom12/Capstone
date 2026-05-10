const fs = require('fs');
const path = 'c:/Users/revin/Downloads/Capstone/public/legacy/admin.html';
let content = fs.readFileSync(path, 'utf8');


content = content.replace(target, replacement);
fs.writeFileSync(path, content, 'utf8');
console.log('Fixed admin.html');
