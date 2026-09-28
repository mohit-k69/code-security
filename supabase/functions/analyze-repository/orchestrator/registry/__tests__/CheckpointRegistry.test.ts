import { CHECKPOINT_REGISTRY, getEnabledCheckpoints, getCheckpointById } from "../CheckpointRegistry.ts";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
}

console.log("Running CheckpointRegistry tests...");

// Test 1
assert(CHECKPOINT_REGISTRY.length === 10, "There should be exactly 10 mandatory checkpoints registered");
console.log("✅ Passed: Exactly 10 checkpoints registered");

// Test 2
for (const cp of CHECKPOINT_REGISTRY) {
  assert(!!cp.spec, `Checkpoint ${cp.id} must have a spec`);
  assert(!!cp.dataset, `Checkpoint ${cp.id} must have a dataset`);
  assert(cp.id === cp.spec.id, `Registry ID must match Spec ID for ${cp.id}`);
  assert(cp.id === cp.dataset.checkpointId, `Registry ID must match Dataset ID for ${cp.id}`);
  
  // Verify new fields requested by user
  assert(!!cp.name, `Checkpoint ${cp.id} must have a name`);
  assert(!!cp.version, `Checkpoint ${cp.id} must have a version`);
  assert(!!cp.category, `Checkpoint ${cp.id} must have a category`);
}
console.log("✅ Passed: All checkpoints have matching specs, datasets, and extended metadata");

// Test 3
const originalEnabled = CHECKPOINT_REGISTRY[0].enabled;
CHECKPOINT_REGISTRY[0].enabled = false;
const enabledCount = getEnabledCheckpoints().length;
assert(enabledCount === 9, "Should return exactly 9 checkpoints when one is disabled");
CHECKPOINT_REGISTRY[0].enabled = originalEnabled;
console.log("✅ Passed: getEnabledCheckpoints filters correctly");

// Test 4
const cp = getCheckpointById("SEC-AUTH-001");
assert(!!cp && cp.id === "SEC-AUTH-001", "Should return SEC-AUTH-001");
const missing = getCheckpointById("SEC-DOES-NOT-EXIST");
assert(missing === undefined, "Should return undefined for missing checkpoint");
console.log("✅ Passed: getCheckpointById returns correctly");

console.log("🎉 All CheckpointRegistry tests passed!");
