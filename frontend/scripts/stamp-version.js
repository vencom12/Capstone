const fs = require('fs');
const path = require('path');

const swPath = path.join(__dirname, '..', 'public', 'sw.js');
if (fs.existsSync(swPath)) {
  let content = fs.readFileSync(swPath, 'utf-8');
  const timestamp = new Date().toISOString();

  // Replace or inject BUILD_VERSION
  if (content.includes('const BUILD_VERSION =')) {
    content = content.replace(/const BUILD_VERSION = [^;]+;/, `const BUILD_VERSION = '${timestamp}';`);
  } else {
    content = `// Build Version: ${timestamp}\nconst BUILD_VERSION = '${timestamp}';\n` + content;
  }

  fs.writeFileSync(swPath, content, 'utf-8');
  console.log(`[PWA] Stamped sw.js with build timestamp: ${timestamp}`);
}

