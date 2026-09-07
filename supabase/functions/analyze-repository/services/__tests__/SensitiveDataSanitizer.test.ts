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

Deno.test("SensitiveDataDetector - Valid Stripe-style secret is detected and redacted", () => {
  const detector = new SensitiveDataDetector(new PatternRegistry());
  const sanitizer = new SensitiveDataSanitizer(new PlaceholderRegistry());
  
  const content = 'const stripeKey = "sk_live_1234567890abcdefghijklmn";';
  const context = createMockContext(content);
  const detection = detector.detect(context);
  const result = sanitizer.sanitize(detection);
  
  assertEquals(detection.secretDetectionReport.findings.length, 1);
  assertEquals(detection.secretDetectionReport.findings[0].category, "API Keys");
  assertEquals(
    result.changedFiles[0].content,
    'const stripeKey = "<REDACTED_API_KEY>";',
    "Valid Stripe secret key must be detected and redacted"
  );
});

Deno.test("SensitiveDataDetector - Hardcoded API credential with test tokens is detected", () => {
  const detector = new SensitiveDataDetector(new PatternRegistry());
  const sanitizer = new SensitiveDataSanitizer(new PlaceholderRegistry());
  
  const content = 'const API_KEY = "sk_live_TEST_SECRET_123456789";';
  const context = createMockContext(content);
  const detection = detector.detect(context);
  const result = sanitizer.sanitize(detection);
  
  assertEquals(detection.secretDetectionReport.findings.length, 1);
  assertEquals(detection.secretDetectionReport.findings[0].category, "API Keys");
  assertEquals(
    result.changedFiles[0].content,
    'const API_KEY = "<REDACTED_API_KEY>";',
    "Hardcoded credential must be detected and redacted"
  );
});

Deno.test("SensitiveDataDetector - Normal string is NOT detected as secret", () => {
  const detector = new SensitiveDataDetector(new PatternRegistry());
  const sanitizer = new SensitiveDataSanitizer(new PlaceholderRegistry());
  
  const content = `const message = "Hello world";
const description = "This is a normal user greeting message.";
const endpoint = "https://api.example.com/v1/users";`;
  const context = createMockContext(content);
  const detection = detector.detect(context);
  const result = sanitizer.sanitize(detection);
  
  assertEquals(detection.secretDetectionReport.findings.length, 0);
  assertEquals(result.changedFiles[0].content, content, "Normal strings must not be modified or flagged");
});

