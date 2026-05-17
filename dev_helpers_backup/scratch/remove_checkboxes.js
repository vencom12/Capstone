const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../frontend/src/app/employee/page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Remove the select dropdown and Apply button from the header of Active Order Queue
const regex = /<select\b[\s\S]*?value=\{batchStatus\}[\s\S]*?<\/select>\s*<button\b[\s\S]*?handleBatchStatusUpdate[\s\S]*?Apply[\s\S]*?<\/button>/;

if (regex.test(content)) {
  content = content.replace(regex, '');
  console.log('✅ Successfully removed batch status select and apply button!');
} else {
  console.log('❌ RegEx did not match.');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('🎉 Done updating page.tsx');
