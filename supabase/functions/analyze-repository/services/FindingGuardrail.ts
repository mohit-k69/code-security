import type { CheckpointFinding, CheckpointResult } from "./CheckpointRunner.ts";
import type { SanitizedContextPackage } from "./types.ts";
export class FindingGuardrail {
  /**
   * Applies deterministic guardrail rules to filter or modify findings
   * before they are aggregated.
   */
  public static applyGuardrails(result: CheckpointResult, contextPackage?: SanitizedContextPackage): CheckpointResult {
    if (result.status !== "completed" || !result.findings) {
      return result;
    }

    const filteredFindings: CheckpointFinding[] = [];

    for (const finding of result.findings) {
      if (this.shouldSuppress(finding, contextPackage)) {
        continue;
      }
      
      // Apply severity sanity checks/downgrades if necessary
      const sanityCheckedFinding = this.applySeveritySanityCheck(finding);
      filteredFindings.push(sanityCheckedFinding);
    }

    // Re-evaluate verdict if findings were dropped
    let newVerdict = result.verdict;
    if (result.verdict === "FAIL" && filteredFindings.length === 0) {
      // All findings were dropped by the guardrail.
      newVerdict = "NOT_VERIFIED";
    }

    return {
      ...result,
      verdict: newVerdict,
      findings: filteredFindings,
    };
  }

  private static shouldSuppress(finding: CheckpointFinding, contextPackage?: SanitizedContextPackage): boolean {
    const combinedEvidenceSnippet = finding.evidence.map((e: any) => e.snippet).join("\n");
    const combinedEvidenceExplanation = finding.evidence.map((e: any) => e.explanation).join("\\n");
    const combinedText = finding.title + " " + finding.description + " " + combinedEvidenceExplanation;

    // 1. Suppression: INPUT-C6 Optional schema absence
    // Suppress only findings that represent absence of optional schema-validation tooling
    // without concrete security impact.
    if (finding.criterionId === "INPUT-C6" || finding.title.includes("INPUT_VALIDATION")) {
      const isComplainingAboutMissingSchema = /(missing|does not use).*schema validation library/i.test(combinedText) ||
                                              /(missing|does not use).*(zod|joi|json schema)/i.test(combinedText);
      if (isComplainingAboutMissingSchema && (finding.severity === "info" || finding.severity === "warning")) {
        return true;
      }
    }

    // 2. Suppression: AUTH-C8 process.env.JWT_SECRET without unsafe fallback
    // Suppress only findings that complain about secret entropy/strength when the evidence
    // shows direct environment-variable retrieval without an unsafe fallback.
    if (finding.criterionId === "AUTH-C8" || finding.title.includes("JWT_SECURITY")) {
      const hasProcessEnv = /process\.env\.\w+/.test(combinedEvidenceSnippet);
      const hasUnsafeFallback = /process\.env\.\w+\s*(\|\||\?\?)\s*['"]/i.test(combinedEvidenceSnippet);
      const isComplainingAboutEntropy = /(validation.*strength|length|entropy|weak value)/i.test(combinedText);

      if (hasProcessEnv && !hasUnsafeFallback && isComplainingAboutEntropy && (finding.severity === "warning" || finding.severity === "info")) {
        return true;
      }
    }

    // 3. Suppression: jwt.verify(..., { algorithms: ["HS256"] }) false critical finding
    if (finding.vulnerabilityClass === "JWT_SECURITY" && finding.severity === "critical") {
      const hasExplicitAlgorithm = /algorithms\s*:\s*\[\s*['"]HS256['"]\s*\]/i.test(combinedEvidenceSnippet);
      const isComplainingAboutNone = /('none'|none algorithm)/i.test(finding.description);
      if (hasExplicitAlgorithm && isComplainingAboutNone) {
        return true; // False positive hallucination
      }
    }

    // 4. Suppression: Absence of context
    // No finding when the claim is based only on absence of context
    const isBasedOnMissingContext = /(is not shown|not visible in the provided|cannot be determined from the snippet)/i.test(combinedText);
    if (isBasedOnMissingContext) {
       return true;
    }

    // 5. Suppression: Truthiness/Falsy Hallucination
    // Detect when the cited snippet contains a JavaScript falsy check such as if (!secret)
    // and the finding claims an empty string can bypass that check.
    const hasFalsyCheck = /if\s*\(\s*!\w+\s*\)/.test(combinedEvidenceSnippet);
    const complainsAboutEmptyString = /(empty string|""|'')/i.test(combinedEvidenceExplanation) || /(empty string|""|'')/i.test(finding.description);
    if (hasFalsyCheck && complainsAboutEmptyString) {
      return true;
    }

    // 6. Suppression: Optional Input Hardening
    // Suppress INPUT_VALIDATION warnings/info whose primary complaint is only missing length limits,
    // strict format/regex validation, or email-format hardening.
    if (finding.vulnerabilityClass === "INPUT_VALIDATION" && (finding.severity === "warning" || finding.severity === "info")) {
      const complainsAboutFormatOrLength = /(length limit|length validation|format validation|email format|malformed email|regular expression|regex|maximum length|excessively long string)/i.test(combinedText);
      if (complainsAboutFormatOrLength) {
        return true;
      }
    }

    // 7. Suppression: Parameterized SQL Injection False Positives
    // Suppress SQL_INJECTION if it clearly uses parameter placeholders without unsafe string concatenation/interpolation
    if (finding.vulnerabilityClass === "SQL_INJECTION") {
      const isSqlContext = /(SELECT|INSERT|UPDATE|DELETE|db\.execute|db\.query)/i.test(combinedEvidenceSnippet);
      const hasPlaceholders = /(\?|\$\d+|:\w+)/.test(combinedEvidenceSnippet);
      const hasUnsafeConcatenation = /(\$\{.*\}|['"]\s*\+)/.test(combinedEvidenceSnippet);
      
      if (isSqlContext && hasPlaceholders && !hasUnsafeConcatenation) {
        return true;
      }
    }

    // 8. Suppression: Generic missing validation on variable assignment or parameterized SQL
    if (finding.vulnerabilityClass === "INPUT_VALIDATION") {
      // Condition A: Evidence snippet is solely a variable extraction (e.g., const id = req.body.id;)
      const isJustExtraction = /^\s*(const|let|var)\s+.*?=\s*req\.(body|query|params).*?;?$/im.test(combinedEvidenceSnippet.trim());
      
      // Condition B: Evidence shows a parameterized SQL query without unsafe string concatenation
      const isSqlContext = /(SELECT|INSERT|UPDATE|DELETE|db\.execute|db\.query)/i.test(combinedEvidenceSnippet);
      const hasPlaceholders = /(\?|\$\d+|:\w+)/.test(combinedEvidenceSnippet);
      const hasUnsafeConcatenation = /(\$\{.*\}|['"]\s*\+)/.test(combinedEvidenceSnippet);
      const isSafeParameterizedSql = isSqlContext && hasPlaceholders && !hasUnsafeConcatenation;

      const complainsAboutMissingValidation = /(without any validation|lack of validation|extracted directly|no validation)/i.test(combinedText);

      if (complainsAboutMissingValidation && (isJustExtraction || isSafeParameterizedSql)) {
        return true;
      }
    }

    // 8. Suppression: Operational/Debugging Preference (Generic Errors)
    // Suppress findings that merely complain that a generic error message makes debugging harder.
    const complainsAboutGenericError = /(generic.*message|generic.*response)/i.test(combinedText);
    const complainsAboutDebugging = /(debugging|differentiate between|distinguish)/i.test(combinedText);
    if (complainsAboutGenericError && complainsAboutDebugging && finding.severity !== "critical") {
      return true;
    }

    // 9. Suppression: IDOR false positives on partial snippets
    if (
      (finding.vulnerabilityClass === "AUTH_BYPASS" ||
       finding.vulnerabilityClass === "BUSINESS_LOGIC_FLAW") &&
      finding.criterionId !== "AUTH-C6"
    ) {
      let codeContext = combinedEvidenceSnippet;
      
      if (contextPackage && finding.primaryLocation?.file) {
        const fileData = contextPackage.changedFiles.find(f => f.path === finding.primaryLocation.file);
        if (fileData && fileData.content) {
          codeContext = fileData.content;
        }
      }

      // Strip comments to prevent matching auth keywords in explanatory text
      const cleanCodeContext = codeContext.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");

      const isClientControlledId = /req\.(body|query|params)/i.test(cleanCodeContext);
      const isDbOperation = /(SELECT|INSERT|UPDATE|DELETE|db\.execute|db\.query)/i.test(cleanCodeContext);
      
      const hasExplicitAuthLogic = /(bypass|role|admin|permission|ownerId|req\.session|req\.user|jwt|verify|auth)/i.test(cleanCodeContext);

      if (isClientControlledId && isDbOperation && !hasExplicitAuthLogic) {
        return true;
      }
    }

    return false;
  }

  private static applySeveritySanityCheck(finding: CheckpointFinding): CheckpointFinding {
    // Implement any future severity downgrades here if needed
    return finding;
  }
}
