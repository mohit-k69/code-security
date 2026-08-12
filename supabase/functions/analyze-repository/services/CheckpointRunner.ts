// ─── Checkpoint Runner v1.1 ──────────────────────────────────────
// Single checkpoint execution engine.
// Receives a sanitized context package, the global security review
// framework prompt, and a review specification. Builds one Gemini
// request, executes it, validates the response, and returns a
// standardized result.
//
// Gemini request composition order:
//   1. Security Review Framework  (system_instruction)
//   2. Review Specification       (user prompt — section 1)
//   3. Sanitized Context Package  (user prompt — section 2)
//   4. Required Output JSON Schema(user prompt — section 3)
//
// No retries. No parallelism. No orchestration.

import { SanitizedContextPackage } from "./types.ts";
import type { ReviewSpecification } from "../prompts/specifications/ReviewSpecification.ts";

// Re-export so existing consumers don't break
export type { ReviewSpecification } from "../prompts/specifications/ReviewSpecification.ts";
export type { EvaluationCriterion } from "../prompts/specifications/ReviewSpecification.ts";

// ─── Output Types ────────────────────────────────────────────────

export type CheckpointVerdict = "PASS" | "FAIL" | "NOT_VERIFIED";

export interface CheckpointEvidence {
  file: string;
  line: number;
  snippet: string;          // The relevant code snippet
  explanation: string;      // Why this is evidence of the finding
}

export interface CheckpointFinding {
  title: string;
  severity: "critical" | "warning" | "info";
  description: string;
  suggestion: string;
  evidence: CheckpointEvidence[];
}

export interface ExecutionMetadata {
  executionTimeMs: number;
  model: string;
  timestamp: string;        // ISO 8601
}

export interface CheckpointResult {
  checkpointId: string;
  checkpointName: string;
  verdict: CheckpointVerdict;
  confidence: number;       // 0.0 – 1.0
  summary: string;          // One-paragraph summary of the checkpoint outcome
  findings: CheckpointFinding[];
  status: "completed" | "error";
  error?: string;
  execution: ExecutionMetadata;
}

// ─── Constants ───────────────────────────────────────────────────

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.0-flash";

// ─── Checkpoint Runner ──────────────────────────────────────────

export class CheckpointRunner {

  /**
   * Execute a single checkpoint against a sanitized context package.
   */
  public async run(
    sanitizedPackage: SanitizedContextPackage,
    frameworkPrompt: string,
    spec: ReviewSpecification
  ): Promise<CheckpointResult> {
    const startTime = performance.now();
    const model = this.getModel();

    try {
      const apiKey = this.getApiKey();
      const requestBody = this.buildRequest(sanitizedPackage, frameworkPrompt, spec);
      const rawText = await this.executeCall(apiKey, model, requestBody);
      const result = this.validateResponse(rawText, spec, model, startTime);
      return result;
    } catch (err: any) {
      return this.buildErrorResult(spec, model, startTime, err.message);
    }
  }

  // ─── Private Methods ────────────────────────────────────────────

  private getApiKey(): string {
    const key = Deno.env.get("GEMINI_API_KEY");
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is not set.");
    }
    return key;
  }

  private getModel(): string {
    return Deno.env.get("GEMINI_MODEL") || DEFAULT_MODEL;
  }

  /**
   * Construct the Gemini generateContent request body.
   *
   * Composition order:
   *   1. Security Review Framework  → system_instruction
   *   2. Review Specification       → user prompt section 1
   *   3. Sanitized Context Package  → user prompt section 2
   *   4. Required Output JSON Schema→ user prompt section 3
   */
  private buildRequest(
    sanitizedPackage: SanitizedContextPackage,
    frameworkPrompt: string,
    spec: ReviewSpecification
  ): Record<string, unknown> {

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

    // ── Compose the full user prompt ─────────────────────────────
    const userPrompt = [
      specSection,
      contextSection,
      outputSchemaSection,
    ].join("\n\n---\n\n");

    return {
      // Section 1: Security Review Framework
      system_instruction: {
        parts: [{ text: frameworkPrompt }],
      },
      // Sections 2–4: Spec → Context → Schema
      contents: [
        {
          role: "user",
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    };
  }

  /**
   * Execute a single Gemini API call. Returns the raw text from the response.
   */
  private async executeCall(
    apiKey: string,
    model: string,
    requestBody: Record<string, unknown>
  ): Promise<string> {
    const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Gemini API returned ${response.status}: ${errorBody}`);
    }

    const json = await response.json();

    // Extract text from Gemini response structure
    const candidates = json?.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error("Gemini returned no candidates.");
    }

    const text = candidates[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("Gemini response contained no text content.");
    }

    return text;
  }

  /**
   * Validate the raw Gemini response against the full checkpoint schema.
   * Returns a valid CheckpointResult or throws.
   */
  private validateResponse(
    rawText: string,
    spec: ReviewSpecification,
    model: string,
    startTime: number
  ): CheckpointResult {

    // 1. Parse JSON
    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new Error(`Gemini response is not valid JSON: ${rawText.slice(0, 200)}`);
    }

    // 2. Validate verdict
    const validVerdicts: CheckpointVerdict[] = ["PASS", "FAIL", "NOT_VERIFIED"];
    if (!parsed.verdict || !validVerdicts.includes(parsed.verdict)) {
      throw new Error(`Invalid or missing verdict. Got: "${parsed.verdict}"`);
    }

    // 3. Validate confidence
    if (typeof parsed.confidence !== "number" || parsed.confidence < 0 || parsed.confidence > 1) {
      throw new Error(`Invalid confidence. Expected 0.0–1.0, got: ${parsed.confidence}`);
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

    for (let i = 0; i < parsed.findings.length; i++) {
      const f = parsed.findings[i];
      const prefix = `findings[${i}]`;

      if (typeof f.title !== "string" || f.title.trim().length === 0) {
        throw new Error(`${prefix}: missing or empty title.`);
      }
      if (!validSeverities.includes(f.severity)) {
        throw new Error(`${prefix}: invalid severity "${f.severity}".`);
      }
      if (typeof f.description !== "string" || f.description.trim().length === 0) {
        throw new Error(`${prefix}: missing or empty description.`);
      }
      if (typeof f.suggestion !== "string" || f.suggestion.trim().length === 0) {
        throw new Error(`${prefix}: missing or empty suggestion.`);
      }

      // Validate evidence array
      const validatedEvidence: CheckpointEvidence[] = [];
      if (Array.isArray(f.evidence)) {
        for (let j = 0; j < f.evidence.length; j++) {
          const e = f.evidence[j];
          const ePrefix = `${prefix}.evidence[${j}]`;

          if (typeof e.file !== "string") {
            throw new Error(`${ePrefix}: missing file path.`);
          }
          if (typeof e.line !== "number") {
            throw new Error(`${ePrefix}: missing or invalid line number.`);
          }
          if (typeof e.snippet !== "string") {
            throw new Error(`${ePrefix}: missing snippet.`);
          }
          if (typeof e.explanation !== "string") {
            throw new Error(`${ePrefix}: missing explanation.`);
          }

          validatedEvidence.push({
            file: e.file,
            line: e.line,
            snippet: e.snippet,
            explanation: e.explanation,
          });
        }
      }

      validatedFindings.push({
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
        model,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Build a standardized error result when the checkpoint fails.
   */
  private buildErrorResult(
    spec: ReviewSpecification,
    model: string,
    startTime: number,
    message: string
  ): CheckpointResult {
    return {
      checkpointId: spec.id,
      checkpointName: spec.name,
      verdict: "NOT_VERIFIED",
      confidence: 0,
      summary: `Checkpoint failed: ${message}`,
      findings: [],
      status: "error",
      error: message,
      execution: {
        executionTimeMs: Math.round(performance.now() - startTime),
        model,
        timestamp: new Date().toISOString(),
      },
    };
  }
}
