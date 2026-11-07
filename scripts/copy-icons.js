// Copia le icone SVG accanto ai file compilati in dist/
const fs = require('fs');
const path = require('path');

for (const dir of ['credentials', 'nodes/UnifiAccess']) {
  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith('.svg')) {
      const target = path.join('dist', dir);
      fs.mkdirSync(target, { recursive: true });
      fs.copyFileSync(path.join(dir, file), path.join(target, file));
    }
  }
}
