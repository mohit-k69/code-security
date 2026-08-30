import { assertEquals } from "https://deno.land/std@0.200.0/testing/asserts.ts";
import { PatternRegistry } from "../PatternRegistry.ts";
import { PlaceholderRegistry } from "../PlaceholderRegistry.ts";
import { SensitiveDataDetector } from "../SensitiveDataDetector.ts";
import { SensitiveDataSanitizer } from "../SensitiveDataSanitizer.ts";
import { ContextPackage } from "../types.ts";

const createMockContext = (content: string): ContextPackage => ({
  repository: "owner/repo",
  prNumber: 1,
  commitSha: "s",
  changedFiles: [{ path: "test.ts", content, deleted: false }],
  dependencies: [],
  missingDependencies: [],
  metadata: { totalFiles: 1, totalChars: content.length, truncated: false },
});

Deno.test("SensitiveDataSanitizer - Preserves existing behavior for genuine AWS credentials", () => {
  const detector = new SensitiveDataDetector(new PatternRegistry());
  const sanitizer = new SensitiveDataSanitizer(new PlaceholderRegistry());
  
  const content = "const awsKey = 'AKIAIOSFODNN7REALKEY';";
  const context = createMockContext(content);
  const result = sanitizer.sanitize(detector.detect(context));
  
  assertEquals(
    result.changedFiles[0].content,
    "const awsKey = '<REDACTED_CLOUD_CREDENTIAL>';",
    "Genuine AWS credentials should be fully redacted without synthetic markers"
  );
});

Deno.test("SensitiveDataSanitizer - Synthetic/example credential remains distinguishable as synthetic", () => {
  const detector = new SensitiveDataDetector(new PatternRegistry());
  const sanitizer = new SensitiveDataSanitizer(new PlaceholderRegistry());
  
  const content = "const testAwsKey = 'AKIAIOSFODNN7EXAMPLE';";
  const context = createMockContext(content);
  const result = sanitizer.sanitize(detector.detect(context));
  
  assertEquals(
    result.changedFiles[0].content,
    "const testAwsKey = '<REDACTED_CLOUD_CREDENTIAL_EXAMPLE>';",
    "Synthetic marker (EXAMPLE) should be embedded into the placeholder"
  );
});

Deno.test("SensitiveDataSanitizer - tc_010 regression (multiple markers and fake secrets)", () => {
  const detector = new SensitiveDataDetector(new PatternRegistry());
  const sanitizer = new SensitiveDataSanitizer(new PlaceholderRegistry());
  
  const content = `const AWS = require('aws-sdk');
AWS.config.update({
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
});`;

  const context = createMockContext(content);
  const result = sanitizer.sanitize(detector.detect(context));
  
  assertEquals(
    result.changedFiles[0].content,
    `const AWS = require('aws-sdk');
AWS.config.update({
  accessKeyId: '<REDACTED_CLOUD_CREDENTIAL_EXAMPLE>',
  secretAccessKey: '<REDACTED_CLOUD_CREDENTIAL_EXAMPLE>'
});`,
    "tc_010 snippet should have EXAMPLE embedded in redacted fields for BOTH access key and secret key"
  );
});

Deno.test("SensitiveDataDetector - Genuine AWS Secret Access Key is detected", () => {
  const detector = new SensitiveDataDetector(new PatternRegistry());
  const sanitizer = new SensitiveDataSanitizer(new PlaceholderRegistry());
  
  // High entropy, 40-char base64 string without any synthetic markers
  const content = "const secret = 'vXalrXUtnFEMI/K7MDENG/bPxRfiCYabcDEF1234';";
  const context = createMockContext(content);
  const result = sanitizer.sanitize(detector.detect(context));
  
  assertEquals(
    result.changedFiles[0].content,
    "const secret = '<REDACTED_CLOUD_CREDENTIAL>';",
    "Genuine AWS Secret Access Key should be fully redacted without synthetic markers"
  );
});

Deno.test("SensitiveDataDetector - Arbitrary 40-char hex string (like git sha) is ignored", () => {
  const detector = new SensitiveDataDetector(new PatternRegistry());
  const sanitizer = new SensitiveDataSanitizer(new PlaceholderRegistry());
  
  // 40-char hex string, typical of a git commit sha or regular sha1 hash
  const content = "const commit = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';";
  const context = createMockContext(content);
  const result = sanitizer.sanitize(detector.detect(context));
  
  assertEquals(
    result.changedFiles[0].content,
    "const commit = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';",
    "A 40-character hex string should not trigger the AWS Secret Access Key regex"
  );
});
