const fs = require('fs');
const path = require('path');

function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (full.endsWith('.ts')) {
      let content = fs.readFileSync(full, 'utf8');
      
      // Fix ["something") to ["something"]
      content = content.replace(/\["([^"]+)"\)/g, '["$1"]');
      content = content.replace(/\['([^']+)'\)/g, "['$1']");
      // Fix "something", "something") to "something"]
      content = content.replace(/,\s*"([^"]+)"\)/g, ', "$1"]');
      content = content.replace(/,\s*'([^']+)'\)/g, ", '$1']");
      // Fix empty arrays
      content = content.replace(/\["\)/g, '[""]');

      fs.writeFileSync(full, content);
    }
  }
}
walk('supabase/functions');
