const fs = require('fs');
const path = 'public/legacy/styles.css';
const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);
// We want to remove the lines that correspond to what we saw as 1340-1396 in the view_file tool.
// view_file line numbers are 1-indexed.
// lines 1340 to 1396 (inclusive)
const start = 1339; // 0-indexed index for line 1340
const end = 1396; // 0-indexed index for line 1397 (exclusive)
lines.splice(start, end - start);
fs.writeFileSync(path, lines.join('\n'));
console.log('Successfully removed lines.');
