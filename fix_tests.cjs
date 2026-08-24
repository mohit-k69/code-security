const fs = require('fs');
const path = 'supabase/functions/analyze-repository/orchestrator/router/__tests__/CheckpointRouter.test.ts';
let content = fs.readFileSync(path, 'utf8');

// Replace all router.route with await router.route
content = content.replace(/router\.route\(/g, 'await router.route(');

const mockFetch = `
// ─── Mock Fetch for Tier-2 Classifier ───────────────────────────
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const bodyStr = options?.body || "";
  if (bodyStr.includes("tier2_file")) {
    return new Response(JSON.stringify({ checkpoints: ["SEC-FILE-001"] }));
  }
  if (bodyStr.includes("tier2_empty")) {
    return new Response(JSON.stringify({ checkpoints: [] }));
  }
  if (bodyStr.includes("tier2_invalid")) {
    return new Response(JSON.stringify({ checkpoints: ["SEC-INVALID-999", "SEC-FILE-001"] }));
  }
  return new Response(JSON.stringify({ checkpoints: [] }));
};

`;

content = content.replace('// ─── Test Helpers', mockFetch + '// ─── Test Helpers');

const newTests = `
// ── Test 24: Tier-2 Integration (Policy D) ───────────────────────
console.log("\\n── Test 24: Tier-2 Integration (Policy D) ──");
{
  const router = new CheckpointRouter(ALL_IDS);
  
  // no Tier-1 match → Tier-2 selects SEC-FILE-001
  const d1 = await router.route(["tier2_file"], true);
  assert(d1.selectedCheckpointIds.includes("SEC-FILE-001"), "Tier-2 selects SEC-FILE-001");
  assert(d1.explanation.some(e => e.includes("Tier-2 Semantic Classifier identified")), "Explanation mentions Tier-2");

  // no Tier-1 match → Tier-2 returns [] → no checkpoints
  const d2 = await router.route(["tier2_empty"], true);
  assert(d2.selectedCheckpointIds.length === 0, "Tier-2 returns empty set");
  assert(d2.isFallback === true, "Fallback true on empty result");

  // invalid Tier-2 checkpoint IDs are rejected
  const d3 = await router.route(["tier2_invalid"], true);
  assert(d3.selectedCheckpointIds.includes("SEC-FILE-001"), "Valid ID accepted");
  assert(!d3.selectedCheckpointIds.includes("SEC-INVALID-999"), "Invalid ID rejected");
  assert(d3.selectedCheckpointIds.length === 1, "Only valid ID kept");

  // Tier-1 match → Tier-2 is not called (we use 'exec' which matches Tier 1)
  const d4 = await router.route(["exec('tier2_file')"], true); // has tier2_file string but also exec
  assert(d4.selectedCheckpointIds.includes("SEC-INPUT-001"), "Tier-1 matched");
  assert(!d4.selectedCheckpointIds.includes("SEC-FILE-001"), "Tier-2 not called");
}
`;

content = content.replace('// ─── Summary', newTests + '\\n// ─── Summary');

fs.writeFileSync(path, content);
