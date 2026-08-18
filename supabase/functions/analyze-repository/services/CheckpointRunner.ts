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
  cwe?: string;
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

    const contextSection = `
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
  "confidence": <number between 0.0 and 1.0>,
  "summary": "<one paragraph summarizing your assessment>",
  "findings": [
    {
      "criterionId": "<the ID of the specific evaluation criterion this finding relates to, e.g. AUTH-C1>",
      "vulnerabilityClass": "<MUST be exactly one of: ${allowedClasses}>",
      "cwe": "<optional CWE identifier, e.g., CWE-79>",
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
If you cannot determine the result due to insufficient context, return verdict "NOT_VERIFIED".
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
      throw new Error(`Invalid or missing verdict. Got: "\${parsed.verdict}"`);
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
        cwe: typeof f.cwe === "string" ? f.cwe : undefined,
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

    return {
      checkpointId: spec.id,
      checkpointName: spec.name,
      verdict: parsed.verdict,
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
