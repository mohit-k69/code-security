import { assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { CheckpointRunner } from "../CheckpointRunner.ts";
import type { ILLMProvider } from "../../orchestrator/providers/ILLMProvider.ts";
import type { SanitizedContextPackage } from "../types.ts";
import type { ReviewSpecification } from "../../prompts/specifications/ReviewSpecification.ts";

class MockProvider implements ILLMProvider {
  name = "MockProvider";
  constructor(private responseText: string) {}
  async generateContent(systemPrompt: string, userPrompt: string, model?: string): Promise<any> {
    return { text: this.responseText };
  }
}

const mockSpec: ReviewSpecification = {
  id: "TEST-1",
  name: "Test Spec",
  version: "1.0",
  category: "test",
  description: "Test",
  criteria: [],
  promptInstruction: ""
};

const mockContext: any = {
  packageId: "test",
  repository: "owner/repo",
  prNumber: 1,
  commitSha: "s",
  changedFiles: [],
  dependencies: [],
  metadata: { totalSecretsReplaced: 0, replacementTypes: {}, ignoredReplacements: 0, processingTimeMs: 0 }
};

function createMockResponse(cwesPayload: string): string {
  return `{
    "verdict": "FAIL",
    "confidence": 1.0,
    "summary": "Mock",
    "findings": [
      {
        "criterionId": "TEST-C1",
        "vulnerabilityClass": "JWT_SECURITY",
        ${cwesPayload}
        "primaryLocation": { "file": "test.ts", "line": 1 },
        "title": "Title",
        "severity": "critical",
        "description": "Desc",
        "suggestion": "Fix",
        "evidence": [
          { "file": "test.ts", "line": 1, "snippet": "code", "explanation": "expl" }
        ]
      }
    ]
  }`;
}

Deno.test("CheckpointRunner - valid single CWE -> preserved", async () => {
  const runner = new CheckpointRunner(new MockProvider(createMockResponse(`"cwes": ["CWE-798"],`)));
  const result = await runner.run(mockContext, "framework", mockSpec);
  assertEquals(result.findings[0].cwes, ["CWE-798"]);
});

Deno.test("CheckpointRunner - valid multiple CWEs -> preserved", async () => {
  const runner = new CheckpointRunner(new MockProvider(createMockResponse(`"cwes": ["CWE-798", "CWE-20"],`)));
  const result = await runner.run(mockContext, "framework", mockSpec);
  assertEquals(result.findings[0].cwes, ["CWE-798", "CWE-20"]);
});

Deno.test("CheckpointRunner - missing cwes -> normalized to []", async () => {
  const runner = new CheckpointRunner(new MockProvider(createMockResponse(``)));
  const result = await runner.run(mockContext, "framework", mockSpec);
  assertEquals(result.findings[0].cwes, []);
});

Deno.test("CheckpointRunner - malformed/non-string CWE entries -> ignored", async () => {
  const runner = new CheckpointRunner(new MockProvider(createMockResponse(`"cwes": ["CWE-798", 123, null, "CWE-20"],`)));
  const result = await runner.run(mockContext, "framework", mockSpec);
  assertEquals(result.findings[0].cwes, ["CWE-798", "CWE-20"]);
});

Deno.test("CheckpointRunner - existing findings without a reliable CWE -> still valid", async () => {
  const runner = new CheckpointRunner(new MockProvider(createMockResponse(`"cwes": [],`)));
  const result = await runner.run(mockContext, "framework", mockSpec);
  assertEquals(result.findings[0].cwes, []);
  assertEquals(result.findings[0].vulnerabilityClass, "JWT_SECURITY");
});
