// ─── CheckpointRouter Unit Tests ────────────────────────────────
// Verifies deterministic routing, fallback behavior,
// multi-match union, and data-driven configurability.

import { CheckpointRouter } from "../CheckpointRouter.ts";
import type { RoutingRule } from "../types.ts";

// ─── Test Helpers ───────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  } else {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  }
}

// All 10 checkpoint IDs from the registry
const ALL_IDS = [
  "SEC-AUTH-001",
  "SEC-AUTHZ-001",
  "SEC-INPUT-001",
  "SEC-SECRET-001",
  "SEC-SESSION-001",
  "SEC-CRYPTO-001",
  "SEC-CONFIG-001",
  "SEC-XSS-001",
  "SEC-FILE-001",
  "SEC-SUPPLY-001",
];

console.log("\n═══════════════════════════════════════════════════");
console.log("  CheckpointRouter Unit Tests");
console.log("═══════════════════════════════════════════════════\n");

// ── Test 1: Authentication changes ──────────────────────────────
console.log("── Test 1: Authentication changes ──");
{
  const router = new CheckpointRouter(ALL_IDS);
  const decision = router.route(["src/services/AuthService.ts", "src/utils/logger.ts"]);
  assert(decision.selectedCheckpointIds.includes("SEC-AUTH-001"), "Auth checkpoint selected");
  assert(!decision.isFallback, "Not a fallback");
  assert(decision.explanation.length > 0, "Explanation provided");
}

// ── Test 2: Frontend-only changes ───────────────────────────────
console.log("\n── Test 2: Frontend-only changes ──");
{
  const router = new CheckpointRouter(ALL_IDS);
  const decision = router.route(["src/components/Dashboard.tsx", "src/pages/Home.jsx"]);
  assert(decision.selectedCheckpointIds.includes("SEC-XSS-001"), "XSS checkpoint selected for .tsx/.jsx");
  assert(!decision.selectedCheckpointIds.includes("SEC-SUPPLY-001"), "Supply chain NOT selected");
  assert(!decision.isFallback, "Not a fallback");
}

// ── Test 3: Dependency updates ──────────────────────────────────
console.log("\n── Test 3: Dependency updates ──");
{
  const router = new CheckpointRouter(ALL_IDS);
  const decision = router.route(["package.json", "package-lock.json"]);
  assert(decision.selectedCheckpointIds.includes("SEC-SUPPLY-001"), "Supply chain selected");
  assert(!decision.isFallback, "Not a fallback");
}

// ── Test 4: Configuration changes ───────────────────────────────
console.log("\n── Test 4: Configuration changes ──");
{
  const router = new CheckpointRouter(ALL_IDS);
  const decision = router.route(["infra/Dockerfile", "infra/nginx.conf"]);
  assert(decision.selectedCheckpointIds.includes("SEC-CONFIG-001"), "Config checkpoint selected");
  assert(!decision.isFallback, "Not a fallback");
}

// ── Test 5: Multiple simultaneous matches ───────────────────────
console.log("\n── Test 5: Multiple simultaneous matches ──");
{
  const router = new CheckpointRouter(ALL_IDS);
  const decision = router.route([
    "src/auth/login.ts",       // Auth
    "src/components/Form.tsx",  // XSS + Input (form)
    "package.json",             // Supply chain
    ".env.production",          // Secrets
  ]);
  assert(decision.selectedCheckpointIds.includes("SEC-AUTH-001"), "Auth selected");
  assert(decision.selectedCheckpointIds.includes("SEC-XSS-001"), "XSS selected");
  assert(decision.selectedCheckpointIds.includes("SEC-SUPPLY-001"), "Supply chain selected");
  assert(decision.selectedCheckpointIds.includes("SEC-SECRET-001"), "Secrets selected");
  assert(!decision.isFallback, "Not a fallback");
  // Verify no duplicates
  const unique = new Set(decision.selectedCheckpointIds);
  assert(unique.size === decision.selectedCheckpointIds.length, "No duplicate checkpoint IDs");
}

// ── Test 6: Unknown file types → fail open ──────────────────────
console.log("\n── Test 6: Unknown file types → fail open ──");
{
  const router = new CheckpointRouter(ALL_IDS);
  const decision = router.route(["docs/README.md", "LICENSE", "CHANGELOG.txt"]);
  assert(decision.isFallback, "Fallback triggered for unknown files");
  assert(decision.selectedCheckpointIds.length === ALL_IDS.length, "All checkpoints selected");
  assert(decision.skippedCheckpointIds.length === 0, "None skipped");
}

// ── Test 7: Empty pull request → fail open ──────────────────────
console.log("\n── Test 7: Empty pull request → fail open ──");
{
  const router = new CheckpointRouter(ALL_IDS);
  const decision = router.route([]);
  assert(decision.isFallback, "Fallback triggered for empty PR");
  assert(decision.selectedCheckpointIds.length === ALL_IDS.length, "All checkpoints selected");
}

// ── Test 8: Case insensitive matching ───────────────────────────
console.log("\n── Test 8: Case insensitive matching ──");
{
  const router = new CheckpointRouter(ALL_IDS);
  const decision = router.route(["src/Services/AuthService.TS", "Dockerfile"]);
  assert(decision.selectedCheckpointIds.includes("SEC-AUTH-001"), "Auth matched case-insensitively");
  assert(decision.selectedCheckpointIds.includes("SEC-CONFIG-001"), "Config matched case-insensitively");
}

// ── Test 9: Skipped checkpoints are correct ─────────────────────
console.log("\n── Test 9: Skipped checkpoints are correct ──");
{
  const router = new CheckpointRouter(ALL_IDS);
  const decision = router.route(["package.json"]);
  assert(decision.skippedCheckpointIds.length === ALL_IDS.length - decision.selectedCheckpointIds.length, "Skipped count = total - selected");
  assert(!decision.skippedCheckpointIds.includes("SEC-SUPPLY-001"), "Supply chain NOT in skipped list");
}

// ── Test 10: Custom routing rules ───────────────────────────────
console.log("\n── Test 10: Custom routing rules ──");
{
  const customRules: RoutingRule[] = [
    { name: "Custom", fileMatchPatterns: ["magic"], contentMatchPatterns: ["magic"], checkpointIds: ["SEC-AUTH-001", "SEC-XSS-001"] },
  ];
  const router = new CheckpointRouter(ALL_IDS, customRules);
  const decision = router.route(["src/magic-handler.ts"]);
  assert(decision.selectedCheckpointIds.includes("SEC-AUTH-001"), "Custom rule selected Auth");
  assert(decision.selectedCheckpointIds.includes("SEC-XSS-001"), "Custom rule selected XSS");
  assert(decision.selectedCheckpointIds.length === 2, "Only 2 checkpoints selected by custom rule");
}

// ── Test 11: Deterministic output ───────────────────────────────
console.log("\n── Test 11: Deterministic output ──");
{
  const router = new CheckpointRouter(ALL_IDS);
  const files = ["src/auth/login.ts", "package.json"];
  const d1 = router.route(files);
  const d2 = router.route(files);
  assert(JSON.stringify(d1.selectedCheckpointIds) === JSON.stringify(d2.selectedCheckpointIds), "Same input produces same selected output");
  assert(JSON.stringify(d1.skippedCheckpointIds) === JSON.stringify(d2.skippedCheckpointIds), "Same input produces same skipped output");
  assert(d1.isFallback === d2.isFallback, "Same fallback status");
}

// ── Test 12: Explanation is human-readable ──────────────────────
console.log("\n── Test 12: Explanation is human-readable ──");
{
  const router = new CheckpointRouter(ALL_IDS);
  const decision = router.route(["src/auth/login.ts"]);
  assert(decision.explanation.some(e => e.includes("Authentication")), "Explanation mentions rule name");
  assert(decision.explanation.some(e => e.includes("SEC-AUTH-001")), "Explanation mentions checkpoint ID");
  assert(decision.explanation.some(e => e.includes("login")), "Explanation mentions matched file");
}

// ── Test 13: Cryptography changes ───────────────────────────────
console.log("\n── Test 13: Cryptography changes ──");
{
  const router = new CheckpointRouter(ALL_IDS);
  const decision = router.route(["lib/encryption.ts", "utils/hashPassword.ts"]);
  assert(decision.selectedCheckpointIds.includes("SEC-CRYPTO-001"), "Crypto checkpoint selected");
}

// ── Test 14: File upload changes ────────────────────────────────
console.log("\n── Test 14: File upload changes ──");
{
  const router = new CheckpointRouter(ALL_IDS);
  const decision = router.route(["api/uploadHandler.ts", "services/fileStorage.ts"]);
  assert(decision.selectedCheckpointIds.includes("SEC-FILE-001"), "File security checkpoint selected");
}

// ── Test 15: Paste Code with jwt.verify() routes to Session/Auth ──
console.log("\n── Test 15: Paste Code with jwt.verify() ──");
{
  const router = new CheckpointRouter(ALL_IDS);
  const decision = router.route(["const token = jwt.verify(t, 'secret');"], true);
  assert(decision.selectedCheckpointIds.includes("SEC-SESSION-001"), "Session & JWT selected");
  assert(decision.selectedCheckpointIds.includes("SEC-AUTH-001"), "Auth selected");
}

// ── Test 16: Paste Code with concrete SQL query ──
console.log("\n── Test 16: Paste Code with SQL query ──");
{
  const router = new CheckpointRouter(ALL_IDS);
  const decision = router.route(["db.query(`SELECT * FROM users WHERE id = ${id}`)"], true);
  assert(decision.selectedCheckpointIds.includes("SEC-INPUT-001"), "Input Validation selected");
}

// ── Test 17: Paste Code with XSS sink ──
console.log("\n── Test 17: Paste Code with XSS sink ──");
{
  const router = new CheckpointRouter(ALL_IDS);
  const decision = router.route(["res.send(html);"], true);
  assert(decision.selectedCheckpointIds.includes("SEC-XSS-001"), "XSS selected");
}

// ── Test 18: Paste Code with helmet() / CORS / TLS ──
console.log("\n── Test 18: Paste Code with config ──");
{
  const router = new CheckpointRouter(ALL_IDS);
  const decision = router.route(["app.use(helmet()); app.use(cors());"], true);
  assert(decision.selectedCheckpointIds.includes("SEC-CONFIG-001"), "Config selected");
}

// ── Test 19: Plain /health snippet selects no specialized checkpoints ──
console.log("\n── Test 19: Plain /health snippet (empty fallback) ──");
{
  const router = new CheckpointRouter(ALL_IDS);
  const decision = router.route(["app.get('/health', (req, res) => res.json({status: 'ok'})); app.listen(3000);"], true);
  assert(decision.isFallback, "Is fallback");
  assert(decision.selectedCheckpointIds.length === 0, "No checkpoints selected");
}

// ── Test 20: Implicit AuthZ: userService.deleteUser ──
console.log("\n── Test 20: Implicit AuthZ routing ──");
{
  const router = new CheckpointRouter(ALL_IDS);
  const decision = router.route(["userService.deleteUser(userId)"], true);
  assert(decision.selectedCheckpointIds.includes("SEC-AUTHZ-001"), "AuthZ selected for deleteUser");
}

// ── Test 21: Generic Express route alone does not trigger AuthZ ──
console.log("\n── Test 21: Generic route without keywords ──");
{
  const router = new CheckpointRouter(ALL_IDS);
  const decision = router.route(["app.get('/settings', (req, res) => res.json({}));"], true);
  assert(decision.isFallback, "Is fallback");
  assert(decision.selectedCheckpointIds.length === 0, "No specialized checkpoints selected for generic route");
}

// ── Test 22: Comments with security keywords do not trigger routing ──
console.log("\n── Test 22: Comments do not trigger routing ──");
{
  const router = new CheckpointRouter(ALL_IDS);
  const decision = router.route(["// Need to add authorization and jwt and deleteuser here\napp.get('/health', (req, res) => res.send('ok'));"], true);
  assert(decision.isFallback, "Is fallback");
  assert(decision.selectedCheckpointIds.length === 0, "No specialized checkpoints selected for comments");
}

// ─── Summary ────────────────────────────────────────────────────

console.log("\n═══════════════════════════════════════════════════");
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log("═══════════════════════════════════════════════════\n");

if (failed > 0) {
  process.exit(1);
}
