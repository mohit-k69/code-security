import { tests } from './deno_polyfill.ts';
import './supabase/functions/analyze-repository/services/__tests__/CheckpointRunner.test.ts';

async function run() {
  let passed = 0, failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`✅ PASS: ${t.name}`);
      passed++;
    } catch (e: any) {
      console.error(`❌ FAIL: ${t.name}\n`, e);
      failed++;
    }
  }
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
run();
