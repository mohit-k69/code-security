const fs = require('fs');
const path = require('path');

function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (full.endsWith('.ts')) {
      let content = fs.readFileSync(full, 'utf8');
      
      content = content.replace(/\.eq\('([^']+)', '([^']+)'\]/g, ".eq('$1', '$2')");
      
      fs.writeFileSync(full, content);
    }
  }
}
walk('supabase/functions');
