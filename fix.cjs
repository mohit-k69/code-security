const fs = require('fs');
const path = require('path');

function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (full.endsWith('.ts')) {
      let content = fs.readFileSync(full, 'utf8');
      
      // Revert the naive replacements
      content = content.replace(/']/g, "')").replace(/"]/g, '")');
      
      // Now specifically fix process.env
      content = content.replace(/process\.env\[([^)]+)\)/g, (match, p1) => {
        return `process.env[${p1}]`;
      });
      
      fs.writeFileSync(full, content);
    }
  }
}
walk('supabase/functions');
