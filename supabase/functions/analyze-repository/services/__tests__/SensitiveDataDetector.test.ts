import { assertEquals } from "https://deno.land/std@0.200.0/testing/asserts.ts";
import { PatternRegistry } from "../PatternRegistry.ts";
import { SensitiveDataDetector } from "../SensitiveDataDetector.ts";
import { ContextPackage } from "../types.ts";

const createMockContext = (
  changedFiles: { path: string; content: string }[] = [],
  fullRepositoryFiles: { path: string; content: string }[] = [],
  dependencies: { path: string; content: string }[] = []
): ContextPackage => ({
  repository: "owner/repo",
  prNumber: 1,
  commitSha: "s",
  changedFiles: changedFiles.map(f => ({ ...f, deleted: false })),
  fullRepositoryFiles: fullRepositoryFiles.map(f => ({ ...f, deleted: false })),
  dependencies,
  missingDependencies: [],
  metadata: { totalFiles: 1, totalChars: 100, truncated: false },
});

Deno.test("SensitiveDataDetector - A secret in a PR-changed file → exactly one SECRET_EXPOSURE", () => {
  const detector = new SensitiveDataDetector(new PatternRegistry());
  const context = createMockContext([
    { path: "src/config.ts", content: "const key = 'sk_live_1234567890abcdefghijklmn';" }
  ]);
  
  const detection = detector.detect(context);
  assertEquals(detection.secretDetectionReport.findings.length, 1);
  assertEquals(detection.secretDetectionReport.findings[0].file, "src/config.ts");
});

Deno.test("SensitiveDataDetector - A secret in an unchanged repository file → SECRET_EXPOSURE is still detected", () => {
  const detector = new SensitiveDataDetector(new PatternRegistry());
  const context = createMockContext(
    [], // No changed files
    [{ path: "src/old_config.ts", content: "const key = 'sk_live_0987654321fedcba';" }] // Full repository
  );
  
  const detection = detector.detect(context);
  assertEquals(detection.secretDetectionReport.findings.length, 1);
  assertEquals(detection.secretDetectionReport.findings[0].file, "src/old_config.ts");
});

Deno.test("SensitiveDataDetector - Same secret present in both changedFiles and fullRepositoryFiles → exactly one finding", () => {
  const detector = new SensitiveDataDetector(new PatternRegistry());
  const fileContent = "const key = 'sk_live_11223344556677889900';"
  const context = createMockContext(
    [{ path: "src/shared.ts", content: fileContent }],
    [{ path: "src/shared.ts", content: fileContent }]
  );
  
  const detection = detector.detect(context);
  // It shouldn't double count the finding because deduplication prevents scanning the same file path twice
  assertEquals(detection.secretDetectionReport.findings.length, 1);
  assertEquals(detection.secretDetectionReport.findings[0].file, "src/shared.ts");
});

Deno.test("SensitiveDataDetector - Normal LLM vulnerability analysis still receives only changedFiles + dependencies", () => {
  // We can verify this structurally by checking that the original ContextPackage is returned unchanged,
  // meaning fullRepositoryFiles wasn't merged into changedFiles in the ContextPackage itself.
  const detector = new SensitiveDataDetector(new PatternRegistry());
  const context = createMockContext(
    [{ path: "src/changed.ts", content: "const a = 1;" }],
    [{ path: "src/unchanged.ts", content: "const b = 2;" }, { path: "src/changed.ts", content: "const a = 1;" }]
  );
  
  const detection = detector.detect(context);
  assertEquals(detection.contextPackage.changedFiles.length, 1);
  assertEquals(detection.contextPackage.changedFiles[0].path, "src/changed.ts");
  
  assertEquals(detection.contextPackage.fullRepositoryFiles.length, 2);
});
