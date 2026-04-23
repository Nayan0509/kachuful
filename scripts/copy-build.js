// Copies client/build → server/public after React build
const fs = require('fs');
const path = require('path');

const src  = path.join(__dirname, '..', 'client', 'build');
const dest = path.join(__dirname, '..', 'server', 'public');

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    entry.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true });
copyDir(src, dest);
console.log('✓ Copied client/build → server/public');
