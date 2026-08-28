const fs = require('fs');
let code = fs.readFileSync('supabase/functions/analyze-repository/services/__tests__/CheckpointRunner.test.ts', 'utf8');
code = code.replace(/import { assertEquals } from "https:\/\/deno.land\/std@0.220.0\/assert\/mod.ts";/, 'import assert from "node:assert";\nconst assertEquals = assert.strictEqual;');
code = code.replace(/import assert from "node:assert";\nconst assertEquals = assert.strictEqual;\nconst assertEquals = assert.strictEqual;/, 'import assert from "node:assert";\nconst assertEquals = assert.strictEqual;'); // fix any duplicate sed
code = `
import assert from "node:assert";
const assertEquals = assert.deepStrictEqual;
const tests = [];
globalThis.Deno = {
  test: (name, fn) => { tests.push({name, fn}); }
};
` + code.replace(/import assert from "node:assert";\nconst assertEquals = assert.strictEqual;/g, '') + `
;(async () => {
  let passed = 0, failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log('✅ ' + t.name);
      passed++;
    } catch (e) {
      console.error('❌ ' + t.name);
      console.error(e.message);
      failed++;
    }
  }
  console.log(\`Results: \${passed} passed, \${failed} failed\`);
})();
`;
fs.writeFileSync('scratch/runner_patched.ts', code);
