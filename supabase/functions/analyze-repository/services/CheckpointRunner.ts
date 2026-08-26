// ─── Checkpoint Runner v2.1 ──────────────────────────────────────
// Single checkpoint execution engine decoupled from LLM providers.
// Receives an ILLMProvider via dependency injection.
//
// Provider responsibilities:
//   - Request construction
//   - Execution and Retries
//   - Timeouts
//   - Parsing raw text response
//
// Runner responsibilities:
//   - Building the review prompt strings
//   - Validating the AI response against the schema
//   - Generating deterministic finding IDs
//   - Returning CheckpointResult

import { SanitizedContextPackage } from "./types.ts";
import type { ReviewSpecification } from "../prompts/specifications/ReviewSpecification.ts";
import type { ILLMProvider, TokenUsage, ProviderResponse } from "../orchestrator/providers/ILLMProvider.ts";
import { FindingGuardrail } from "./FindingGuardrail.ts";
import { VulnerabilityClass } from "../orchestrator/types/VulnerabilityClass.ts";
import { ProviderError } from "../orchestrator/providers/ProviderError.ts";
import { SECURITY_REVIEW_FRAMEWORK } from "../prompts/SecurityReviewFramework.ts";

/** Helper to encode ArrayBuffer to hex string */
function encodeHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Re-export so existing consumers don't break
export type { ReviewSpecification } from "../prompts/specifications/ReviewSpecification.ts";
export type { EvaluationCriterion } from "../prompts/specifications/ReviewSpecification.ts";

// ─── Output Types ────────────────────────────────────────────────

export type CheckpointVerdict = "PASS" | "FAIL" | "NOT_VERIFIED";

export interface Location {
  file: string;
  line: number;
}

export interface CheckpointEvidence {
  file: string;
  line: number;
  snippet: string;
  explanation: string;
}

export interface CheckpointFinding {
  findingId: string; // Generated deterministically by the backend
  criterionId: string;
  vulnerabilityClass: VulnerabilityClass;
  cwes: string[];
  primaryLocation: Location;
  title: string;
  severity: "critical" | "warning" | "info";
  description: string;
  suggestion: string;
  evidence: CheckpointEvidence[];
}

export interface ExecutionMetadata {
  executionTimeMs: number;
  llmDurationMs: number;
  model: string;
  timestamp: string;
  tokenUsage?: TokenUsage;
}

export interface CheckpointResult {
  checkpointId: string;
  checkpointName: string;
  verdict: CheckpointVerdict;
  applicability: "APPLICABLE" | "NOT_APPLICABLE" | "UNKNOWN";
  confidence: number;
  summary: string;
  findings: CheckpointFinding[];
  status: "completed" | "error";
  error?: string;
  execution: ExecutionMetadata;
}

// ─── Checkpoint Runner ──────────────────────────────────────────

export class CheckpointRunner {
  private provider: ILLMProvider;
  private model: string | undefined;

  /**
   * Initializes the runner with an injected LLM provider.
   * @param provider The provider implementation (e.g., GeminiProvider, OpenRouterProvider)
   * @param model Optional model override
   */
  constructor(provider: ILLMProvider, model?: string) {
    this.provider = provider;
    this.model = model;
  }

  /**
   * Execute a single checkpoint against a sanitized context package.
   */
  public async run(
    sanitizedPackage: SanitizedContextPackage,
    frameworkPrompt: string,
    spec: ReviewSpecification
  ): Promise<CheckpointResult> {
    const startTime = performance.now();
    const effectiveModel = this.model || "default";

    try {
      const userPrompt = this.buildUserPrompt(sanitizedPackage, spec);
      
      // ─── TEMPORARY DIAGNOSTIC INSTRUMENTATION ─────────────────
      // Remove after verifying context correctness.
      const changedFilePaths = sanitizedPackage.changedFiles.map(f => f.path);
      const depFilePaths = sanitizedPackage.dependencies.map(d => d.path);
      const allPaths = [...changedFilePaths, ...depFilePaths];
      const suspectFiles = [
        "server/controllers/userController.js",
        "server/utils/generateToken.js",
      ];
      const suspectInContext = suspectFiles.filter(s =>
        allPaths.some(p => p.includes(s)) || userPrompt.includes(s)
      );

      console.log("\n" + "═".repeat(80));
      console.log("🔍 CHECKPOINT RUNNER DIAGNOSTIC");
      console.log("═".repeat(80));
      console.log(`Checkpoint:       ${spec.id} — ${spec.name}`);
      console.log(`Repository:       ${sanitizedPackage.repository}`);
      console.log(`PR Number:        #${sanitizedPackage.prNumber}`);
      console.log(`Commit SHA:       ${sanitizedPackage.commitSha}`);
      console.log(`Changed Files (${changedFilePaths.length}):`);
      changedFilePaths.forEach(p => console.log(`  • ${p}`));
      console.log(`Dependency Files (${depFilePaths.length}):`);
      depFilePaths.forEach(p => console.log(`  • ${p}`));
      console.log(`Total files in context: ${allPaths.length}`);
      console.log(`Prompt length:    ${userPrompt.length} chars`);
      console.log(`Suspect files found in context: ${suspectInContext.length > 0 ? suspectInContext.join(", ") : "NONE"}`);
      // Safe preview: first 500 chars of the context section only (no secrets)
      const contextStart = userPrompt.indexOf("## Pull Request Context");
      const contextPreview = contextStart >= 0
        ? userPrompt.substring(contextStart, contextStart + 500)
        : "(context section not found)";
      console.log(`Context preview:\n${contextPreview}`);
      console.log("═".repeat(80) + "\n");
      // ─── END DIAGNOSTIC ───────────────────────────────────────

      // 2. Execute LLM Call (provider handles retries and timeouts)
      const llmStartTime = Date.now();
      const response: ProviderResponse = await this.provider.generateContent(
        frameworkPrompt,
        userPrompt,
        this.model
      );
      const llmDurationMs = Date.now() - llmStartTime;

      // 3. Parse and Validate Response
      const result = await this.validateResponse(
        response.text,
        sanitizedPackage,
        spec,
        this.provider.name,
        startTime,
        llmDurationMs,
        response.usage
      );
      return result;
    } catch (err: any) {
      // Return a structured error, letting the orchestrator decide if it ruins the whole run
      return this.buildErrorResult(spec, this.provider.name, startTime, err.message);
    }
  }

  // ─── Private Methods ────────────────────────────────────────────

  /**
   * Construct the combined user prompt for the provider.
   */
  private buildUserPrompt(
    sanitizedPackage: SanitizedContextPackage,
    spec: ReviewSpecification
  ): string {

    // ── Section 2: Review Specification ───────────────────────────
    const criteriaBlock = spec.criteria.length > 0
      ? `### Evaluation Criteria\n\n| # | Criterion | Description |\n|---|-----------|-------------|\n${spec.criteria.map(c => `| ${c.id} | ${c.name} | ${c.description} |`).join("\n")}\n`
      : "";

    const additionalInstructions = spec.promptInstruction.trim()
      ? `### Additional Instructions\n\n${spec.promptInstruction.trim()}\n`
      : "";

    const specSection = `
## Review Specification

**Checkpoint ID:** ${spec.id}
**Checkpoint Name:** ${spec.name}
**Version:** ${spec.version}
**Category:** ${spec.category}
**Description:** ${spec.description}

${criteriaBlock}${additionalInstructions}
`.trim();

    // ── Section 3: Sanitized Context Package ─────────────────────
    const changedFilesBlock = sanitizedPackage.changedFiles
      .map(f => {
        if (f.deleted) return `--- ${f.path} [DELETED] ---`;
        return `--- ${f.path} ---\n${f.content || "(no content)"}`;
      })
      .join("\n\n");

    const dependencyBlock = sanitizedPackage.dependencies.length > 0
      ? sanitizedPackage.dependencies
          .map(d => `--- ${d.path} ---\n${d.content}`)
          .join("\n\n")
      : "(no dependency files)";

    const isPasteCode = sanitizedPackage.repository.endsWith("paste_snippet");
    const pasteCodeOverride = isPasteCode ? `
## Paste Code Specific Verdict Rules

You are analyzing a standalone code snippet pasted by a user, not a full repository. Override the standard framework verdict semantics with the following:

- **PASS**: Use PASS when the provided pasted code contains no demonstrated security vulnerability and the relevant security behavior can reasonably be evaluated from the supplied code. 
  IMPORTANT: If the pasted code contains no functionality relevant to a checkpoint's security domain, that checkpoint must return PASS, not NOT_VERIFIED.
- **FAIL**: Use FAIL when the pasted code contains concrete evidence of a security vulnerability.
- **NOT_VERIFIED**: Use NOT_VERIFIED only when the pasted code contains security-sensitive behavior where an important security property genuinely depends on missing code, configuration, infrastructure, middleware, or downstream implementation. Do not use NOT_VERIFIED merely because the pasted snippet is not the entire application.

**Opaque/Unseen Implementation Rule:**
When a security-critical property is delegated to an unseen/opaque implementation, you MUST NOT assume that implementation is secure. Examples include:
- unseen authentication/authorization functions
- imported security helpers whose implementation is not provided
- opaque middleware when its relevant security behavior cannot be verified
- external payment/security services whose security behavior is not visible
- custom wrappers whose validation/authentication behavior cannot be inspected

If the supplied snippet contains no independently visible unsafe behavior, but correctness of the security property depends on such unseen implementation, return NOT_VERIFIED rather than PASS. However, do NOT turn every imported function, middleware, ORM, library, or helper into NOT_VERIFIED. If the snippet itself provides sufficient visible evidence that the relevant security property is safely enforced, return PASS.

When you apply this opaque implementation rule and return NOT_VERIFIED because a security-critical implementation is delegated to an unseen/opaque implementation:
1. verdict MUST be NOT_VERIFIED.
2. applicability MUST be APPLICABLE.
3. Do NOT use NOT_APPLICABLE merely because the implementation is unseen.
4. NOT_APPLICABLE should mean the checkpoint's security property genuinely does not apply to the supplied code.
5. UNKNOWN should not be used when the opaque implementation rule clearly applies; use APPLICABLE + NOT_VERIFIED.

**Authentication & Authorization Context:**
For Paste Code, do not treat missing inline middleware as proof that a route is unprotected. If a sensitive route/action is present but authentication/authorization logic is not visible in the supplied snippet, assume it may be applied globally or elsewhere and return NOT_VERIFIED rather than FAIL.

Example:
- Small, self-contained safe snippet → PASS
- Clearly vulnerable snippet → FAIL
- Security-sensitive partial snippet where an important control depends on unseen code → NOT_VERIFIED
` : "";

    const contextSection = `
${pasteCodeOverride}
## Pull Request Context

**Repository:** ${sanitizedPackage.repository}
**Pull Request:** #${sanitizedPackage.prNumber}
**Commit:** ${sanitizedPackage.commitSha}

### Changed Files

${changedFilesBlock}

### Dependency Files (for context only)

${dependencyBlock}
`.trim();

    const allowedClasses = Object.values(VulnerabilityClass).join(", ");

    // ── Section 4: Required Output JSON Schema ───────────────────
    const outputSchemaSection = `
## Required Output JSON Schema

You MUST respond with valid JSON matching this exact schema. Do not include any text outside the JSON object.

{
  "verdict": "PASS" | "FAIL" | "NOT_VERIFIED",
  "applicability": "APPLICABLE" | "NOT_APPLICABLE",
  "confidence": <number between 0.0 and 1.0>,
  "summary": "<one paragraph summarizing your assessment>",
  "findings": [
    {
      "criterionId": "<the ID of the specific evaluation criterion this finding relates to, e.g. AUTH-C1>",
      "vulnerabilityClass": "<MUST be exactly one of: ${allowedClasses}>",
      "cwes": ["<CWE-798>", "<CWE-20>"], // array of strings, or [] if unable to map confidently
      "primaryLocation": {
        "file": "<file path containing the vulnerability root cause>",
        "line": <line number>
      },
      "title": "<short title>",
      "severity": "critical" | "warning" | "info",
      "description": "<detailed description of the issue>",
      "suggestion": "<actionable fix>",
      "evidence": [
        {
          "file": "<file path>",
          "line": <line number>,
          "snippet": "<relevant code>",
          "explanation": "<why this is evidence>"
        }
      ]
    }
  ]
}

If no issues are found, return verdict "PASS" with an empty findings array.
If you cannot determine the result due to missing/unseen code, return verdict "NOT_VERIFIED" with an empty findings array. Do not generate speculative or informational findings for security controls that are simply not visible.
Determine applicability from explicit security-sensitive logic present in the supplied code.
Merely using Express, defining generic routes, creating a router, starting an HTTP server, or importing a framework does not make a security domain applicable.
Examples:
- app.listen() alone -> not Security Configuration applicable.
- express.Router() alone -> not Authentication/Session applicable.
- A database query alone -> not Authorization applicable unless authorization-related logic is actually present.
- Explicit CORS/security headers/TLS/cookie security/auth middleware/JWT/session logic -> potentially applicable.
Evaluate only the security behavior explicitly visible in the snippet.

1. FAIL: If the visible code contains unsafe implementation (for example missing expirations, trusting client-controlled identities, missing credential checks, or other explicitly unsafe behavior), flag it. Do not assume unseen code provides protection against a visible flaw.

2. PASS: If the visible code demonstrates a security control that is safe and sufficiently verifiable from the shown implementation, return PASS. Do not return NOT_VERIFIED merely because the snippet covers only one phase of a larger lifecycle. When a checkpoint contains multiple criteria, evaluate only criteria for which the snippet contains relevant code. If every applicable criterion can be positively verified as PASS and no applicable criterion is FAIL or NOT_VERIFIED, the checkpoint verdict MUST be PASS. Treat a criterion as applicable only if the snippet explicitly demonstrates behavior or functionality relevant to it. Do not require unrelated lifecycle phases to be verified if they are not represented in the snippet. However, if a criterion is directly relevant to the visible behavior, and its correctness genuinely depends on unseen code, you must evaluate that criterion as NOT_VERIFIED. Never convert an actual FAIL into PASS.

3. NOT_VERIFIED: Return NOT_VERIFIED only when there is no visible unsafe behavior AND the core security property being evaluated is entirely delegated to an opaque or unseen implementation, leaving no concrete security behavior to verify.

Do not treat ordinary use of a known library/API as automatically opaque when the security-relevant behavior and parameters are visible.
If no relevant security-sensitive logic is explicitly present, return "NOT_APPLICABLE".
`.trim();

    return [
      specSection,
      contextSection,
      outputSchemaSection,
    ].join("\n\n---\n\n");
  }

  /**
   * Generates a deterministic finding ID based on normalized attributes.
   */
  private async generateFindingId(vulnClass: string, file: string, line: number): Promise<string> {
    const raw = `${vulnClass}|${file}|${line}`;
    const data = new TextEncoder().encode(raw);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return encodeHex(hashBuffer).substring(0, 16);
  }

  /**
   * Validate the raw LLM response against the full checkpoint schema.
   * Returns a valid CheckpointResult or throws.
   */
  private async validateResponse(
    rawText: string,
    sanitizedPackage: SanitizedContextPackage,
    spec: ReviewSpecification,
    providerName: string,
    startTime: number,
    llmDurationMs: number,
    tokenUsage?: TokenUsage
  ): Promise<CheckpointResult> {

    // 1. Parse JSON
    let parsed: any;
    try {
      const cleanText = rawText.replace(/^\\s*```json/i, '').replace(/```\\s*$/, '').trim();
      parsed = JSON.parse(cleanText);
    } catch {
      throw new Error(`LLM response is not valid JSON: \${rawText.slice(0, 200)}`);
    }

    // 2. Validate verdict
    const validVerdicts: CheckpointVerdict[] = ["PASS", "FAIL", "NOT_VERIFIED"];
    if (!parsed.verdict || !validVerdicts.includes(parsed.verdict)) {
      throw new Error(`Invalid or missing verdict. Got: "${parsed.verdict}"`);
    }

    // 2.5 Parse Applicability
    let applicability: "APPLICABLE" | "NOT_APPLICABLE" | "UNKNOWN" = "UNKNOWN";
    if (parsed.applicability === "APPLICABLE" || parsed.applicability === "NOT_APPLICABLE") {
      applicability = parsed.applicability;
    }

    // 3. Validate confidence
    if (typeof parsed.confidence !== "number" || parsed.confidence < 0 || parsed.confidence > 1) {
      throw new Error(`Invalid confidence. Expected 0.0–1.0, got: \${parsed.confidence}`);
    }

    // 4. Validate summary
    if (typeof parsed.summary !== "string" || parsed.summary.trim().length === 0) {
      throw new Error("Missing or empty summary field.");
    }

    // 5. Validate findings array
    if (!Array.isArray(parsed.findings)) {
      throw new Error("Missing or invalid findings array.");
    }

    const validSeverities = ["critical", "warning", "info"];
    const validatedFindings: CheckpointFinding[] = [];

    const allowedClasses = Object.values(VulnerabilityClass) as string[];

    for (let i = 0; i < parsed.findings.length; i++) {
      const f = parsed.findings[i];
      const prefix = `findings[\${i}]`;

      if (typeof f.criterionId !== "string" || f.criterionId.trim().length === 0) {
        throw new Error(`\${prefix}: missing or empty criterionId.`);
      }
      
      if (!allowedClasses.includes(f.vulnerabilityClass)) {
        throw new Error(`\${prefix}: invalid vulnerabilityClass "\${f.vulnerabilityClass}". Must be one of: \${allowedClasses.join(", ")}`);
      }

      if (!f.primaryLocation || typeof f.primaryLocation.file !== "string" || typeof f.primaryLocation.line !== "number") {
        throw new Error(`\${prefix}: missing or invalid primaryLocation. Requires file (string) and line (number).`);
      }

      if (typeof f.title !== "string" || f.title.trim().length === 0) {
        throw new Error(`\${prefix}: missing or empty title.`);
      }
      if (!validSeverities.includes(f.severity)) {
        throw new Error(`\${prefix}: invalid severity "\${f.severity}".`);
      }
      if (typeof f.description !== "string" || f.description.trim().length === 0) {
        throw new Error(`\${prefix}: missing or empty description.`);
      }
      if (typeof f.suggestion !== "string" || f.suggestion.trim().length === 0) {
        throw new Error(`\${prefix}: missing or empty suggestion.`);
      }

      // Validate evidence array
      const validatedEvidence: CheckpointEvidence[] = [];
      if (Array.isArray(f.evidence)) {
        for (let j = 0; j < f.evidence.length; j++) {
          const e = f.evidence[j];
          const ePrefix = `\${prefix}.evidence[\${j}]`;

          if (typeof e.file !== "string") {
            throw new Error(`\${ePrefix}: missing file path.`);
          }
          if (typeof e.line !== "number") {
            throw new Error(`\${ePrefix}: missing or invalid line number.`);
          }
          if (typeof e.snippet !== "string") {
            throw new Error(`\${ePrefix}: missing snippet.`);
          }
          if (typeof e.explanation !== "string") {
            throw new Error(`\${ePrefix}: missing explanation.`);
          }

          validatedEvidence.push({
            file: e.file,
            line: e.line,
            snippet: e.snippet,
            explanation: e.explanation,
          });
        }
      }

      const findingId = await this.generateFindingId(f.vulnerabilityClass, f.primaryLocation.file, f.primaryLocation.line);

      validatedFindings.push({
        findingId,
        criterionId: f.criterionId,
        vulnerabilityClass: f.vulnerabilityClass as VulnerabilityClass,
        cwes: Array.isArray(f.cwes) ? f.cwes.filter((c: any) => typeof c === "string") : [],
        primaryLocation: {
          file: f.primaryLocation.file,
          line: f.primaryLocation.line
        },
        title: f.title,
        severity: f.severity,
        description: f.description,
        suggestion: f.suggestion,
        evidence: validatedEvidence,
      });
    }

    const rawResult: CheckpointResult = {
      checkpointId: spec.id,
      checkpointName: spec.name,
      verdict: parsed.verdict as CheckpointVerdict,
      applicability,
      confidence: parsed.confidence,
      summary: parsed.summary,
      findings: validatedFindings,
      status: "completed",
      execution: {
        executionTimeMs: Math.round(performance.now() - startTime),
        llmDurationMs,
        model: this.model || providerName,
        timestamp: new Date().toISOString(),
        tokenUsage,
      },
    };

    return FindingGuardrail.applyGuardrails(rawResult, sanitizedPackage);
  }

  /**
   * Build a standardized error result when the checkpoint fails.
   */
  private buildErrorResult(
    spec: ReviewSpecification,
    providerName: string,
    startTime: number,
    message: string
  ): CheckpointResult {
    return {
      checkpointId: spec.id,
      checkpointName: spec.name,
      verdict: "NOT_VERIFIED",
      applicability: "UNKNOWN",
      confidence: 0,
      summary: `Checkpoint failed: \${message}`,
      findings: [],
      status: "error",
      error: message,
      execution: {
        executionTimeMs: Math.round(performance.now() - startTime),
        llmDurationMs: Math.round(performance.now() - startTime),
        model: this.model || providerName,
        timestamp: new Date().toISOString(),
      },
    };
  }
}
