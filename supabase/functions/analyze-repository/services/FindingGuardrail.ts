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
      
      // Refine location for AUTH_BYPASS if incorrectly attached to data extraction/query line
      const locationRefinedFinding = this.refineFindingLocation(finding, contextPackage);

      // Apply severity sanity checks/downgrades if necessary
      const sanityCheckedFinding = this.applySeveritySanityCheck(locationRefinedFinding);
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

    // 3.5. Suppression: Spurious JWT_SECURITY on route declaration or benign header/token extraction
    if (finding.vulnerabilityClass === "JWT_SECURITY") {
      let localContext = combinedEvidenceSnippet;
      let currentLineText = "";

      if (contextPackage && finding.primaryLocation?.file) {
        const fileData = contextPackage.changedFiles.find(f => f.path === finding.primaryLocation.file);
        if (fileData && fileData.content && typeof finding.primaryLocation.line === "number") {
          const lines = fileData.content.split("\n");
          const lineIdx = finding.primaryLocation.line - 1;
          currentLineText = lines[lineIdx] || "";
          const { startIdx, endIdx } = this.getLocalContextRange(lines, lineIdx);
          localContext = lines.slice(startIdx, endIdx + 1).join("\n");
        }
      }

      const hasConcreteJwtOperation =
        /\bjwt\.(decode|verify|sign)\s*\(/i.test(combinedEvidenceSnippet) ||
        /\bjwt\.(decode|verify|sign)\s*\(/i.test(localContext) ||
        /\balgorithm\s*:\s*['"]none['"]/i.test(combinedEvidenceSnippet) ||
        /\balgorithm\s*:\s*['"]none['"]/i.test(localContext);

      // Case A: Route declaration flagged as JWT_SECURITY without JWT operations
      const isRouteDeclaration =
        /^\s*(app|router)\.(get|post|put|delete|patch|all|use)\s*\(/im.test(combinedEvidenceSnippet) ||
        /^\s*(app|router)\.(get|post|put|delete|patch|all|use)\s*\(/im.test(currentLineText) ||
        /['"]\/(admin|api\/admin|dashboard)['"]/i.test(combinedEvidenceSnippet) ||
        /['"]\/(admin|api\/admin|dashboard)['"]/i.test(currentLineText);

      if (isRouteDeclaration && !hasConcreteJwtOperation) {
        return true;
      }

      // Case B: Pure req.headers.authorization or bearer token extraction without JWT operations
      const isOnlyHeaderExtraction =
        /^\s*(const|let|var)?\s*(\{[^}]*\}|\w+)\s*=\s*(req\.headers(\.authorization|\[['"]authorization['"]\]|\.get\(['"]authorization['"]\)|;\s*$)|authHeader)/im.test(combinedEvidenceSnippet.trim()) ||
        /^\s*(const|let|var)?\s*\w+\s*=\s*authHeader\.split/im.test(combinedEvidenceSnippet.trim()) ||
        /req\.headers(\.authorization|\[['"]authorization['"]\])/i.test(combinedEvidenceSnippet) ||
        /req\.headers(\.authorization|\[['"]authorization['"]\])/i.test(currentLineText) ||
        /authHeader\s*=\s*req\.headers/i.test(currentLineText);

      if (isOnlyHeaderExtraction && !hasConcreteJwtOperation) {
        return true;
      }
    }

    // 4. Suppression: Absence of context (Genuinely speculative findings)
    // Suppress findings where the vulnerability claim itself is based purely on missing context / absence of code,
    // rather than concrete affirmative insecure patterns visible in the evidence snippet.
    const mentionsMissingContext = /(is not shown|not visible in the provided|cannot be determined from the snippet|without seeing the rest|full server context is not visible)/i.test(combinedText);
    if (mentionsMissingContext) {
      // Check if the evidence snippet contains concrete affirmative insecure code
      const hasWildcardOrReflectedOrigin =
        (/access-control-allow-origin/i.test(combinedEvidenceSnippet) && /\*/.test(combinedEvidenceSnippet)) ||
        /origin\s*[:=,]\s*['"]?\*/i.test(combinedEvidenceSnippet) ||
        /cors\s*\(\s*\{.*origin\s*:\s*['"]?\*/is.test(combinedEvidenceSnippet);

      const hasCredentialsTrue =
        (/access-control-allow-credentials/i.test(combinedEvidenceSnippet) && /true/i.test(combinedEvidenceSnippet)) ||
        /credentials\s*[:=,]\s*(true|['"]true['"])/i.test(combinedEvidenceSnippet);

      const hasConcreteCorsMisconfig = hasWildcardOrReflectedOrigin && hasCredentialsTrue;

      const hasConcreteReflectedOrigin =
        (/access-control-allow-origin/i.test(combinedEvidenceSnippet) && /req\.(headers|get).*origin/i.test(combinedEvidenceSnippet)) ||
        /origin\s*[:=,]\s*.*req\.(headers|get).*origin/i.test(combinedEvidenceSnippet);

      const hasConcreteDangerousSink =
        /\b(eval|exec|spawn|createSessionToken|generateToken|jwt\.sign|axios\.(get|post)|fetch\(|http\.get)\b/i.test(combinedEvidenceSnippet) ||
        /\b(SELECT|INSERT|UPDATE|DELETE).*\$\{/i.test(combinedEvidenceSnippet);

      const hasConcreteVisibleFlaw = hasConcreteCorsMisconfig || hasConcreteReflectedOrigin || hasConcreteDangerousSink;

      // Suppress if the finding is purely speculative and lacks concrete visible flaws
      if (!hasConcreteVisibleFlaw) {
        return true;
      }
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

    // 9. Suppression: IDOR false positives on partial snippets / inferred missing authorization
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

      const isRouteDefinition = /\b(app|router)\.(get|post|put|delete|patch)\b/i.test(cleanCodeContext) || /\/api\//i.test(cleanCodeContext);
      const isClientControlledId = /req\.(body|query|params)/i.test(cleanCodeContext);
      const isDbOperation = /(SELECT|INSERT|UPDATE|DELETE|db\.execute|db\.query|db\.\w+\.(find|update|delete|query))/i.test(cleanCodeContext);
      
      const hasExplicitBypass = /(bypass|admin|role)\s*===?|req\.body\.(admin|role)|req\.query\.bypass/i.test(cleanCodeContext);
      const hasExplicitAuthCheck = /\b(requireAuth|checkAuth|isAuthenticated|req\.session|req\.user|jwt\.verify|createSessionToken|generateToken|createToken|issueToken|signToken|jwt\.sign|createSession)\b/i.test(cleanCodeContext);
      const hasExplicitAuthLogic = hasExplicitBypass || hasExplicitAuthCheck;

      if (!isRouteDefinition && (isClientControlledId || isDbOperation) && !hasExplicitAuthLogic) {
        return true;
      }
    }

    // 10. Suppression: Non-secret PII / user profile data / database queries misclassified as SECRET_EXPOSURE
    if (finding.vulnerabilityClass === "SECRET_EXPOSURE") {
      const isQueryingOrReturningUserData = /(SELECT.*(ssn|password_hash|email|phone|address|user)|db\.\w+\.find|res\.(json|send).*(user|profile|data)|req\.(body|params|query))/i.test(combinedEvidenceSnippet) ||
                                            /\b(ssn|social security|personal data|pii|user profile|password_hash|email address)\b/i.test(combinedText);
      const isActualHardcodedSecret = /=\s*['"][a-zA-Z0-9_\-\.\/+=]{8,}['"]/i.test(combinedEvidenceSnippet) ||
                                      /(AKIA[0-9A-Z]{16}|sk_live_[0-9a-zA-Z]+|ghp_[0-9a-zA-Z]+|-----BEGIN [A-Z ]*PRIVATE KEY-----)/.test(combinedEvidenceSnippet) ||
                                      /(mongodb(\+srv)?|postgres(ql)?|mysql|redis):\/\/[^\s'"]+:[^\s'"]+@/i.test(combinedEvidenceSnippet);

      if (isQueryingOrReturningUserData && !isActualHardcodedSecret) {
        return true;
      }
    }

    return false;
  }

  private static applySeveritySanityCheck(finding: CheckpointFinding): CheckpointFinding {
    // Implement any future severity downgrades here if needed
    return finding;
  }

  private static refineFindingLocation(
    finding: CheckpointFinding,
    contextPackage?: SanitizedContextPackage
  ): CheckpointFinding {
    if (!contextPackage || !finding.primaryLocation?.file) {
      return finding;
    }

    if (finding.vulnerabilityClass !== "AUTH_BYPASS" && finding.vulnerabilityClass !== "SSRF" && finding.vulnerabilityClass !== "JWT_SECURITY") {
      return finding;
    }

    const fileData = contextPackage.changedFiles.find(f => f.path === finding.primaryLocation.file);
    if (!fileData || !fileData.content) {
      return finding;
    }

    const lines = fileData.content.split("\n");
    const currentLineIdx = finding.primaryLocation.line - 1;
    const currentLineText = lines[currentLineIdx] || "";

    if (finding.vulnerabilityClass === "AUTH_BYPASS") {
      // Check if the current location points to an input extraction or user query/data retrieval line
      const isInputExtractionOrQuery =
        /^\s*(const|let|var)?\s*(\{[^}]*\}|\w+)\s*=\s*(req\.(body|query|params)|await\s+(getUser|findUser|fetchUser|db\..*query|db\..*find|User\.find|User\.get|User\.getBy)).*;/i.test(currentLineText) ||
        /^\s*(const|let|var)?\s*user\s*=\s*.*getUser/i.test(currentLineText) ||
        /getUserByUsername\s*\(/i.test(currentLineText) ||
        /^\s*(const|let|var)\s+\w+\s*=\s*req\.body/i.test(currentLineText);

      // Check if the current line itself already has the token creation / session setting / auth decision
      const hasAuthDecisionOnCurrentLine =
        /(createSessionToken|generateToken|createToken|issueToken|signToken|jwt\.sign|createSession|req\.session\.\w+\s*=|setAuthCookie|setSessionCookie|grantAccess)/i.test(currentLineText);

      if (isInputExtractionOrQuery && !hasAuthDecisionOnCurrentLine) {
        // Look for the auth decision / token creation line in the file (preferring lines after currentLineIdx)
        let targetLineIdx = -1;

        for (let i = currentLineIdx + 1; i < lines.length; i++) {
          if (
            /(createSessionToken|generateToken|createToken|issueToken|signToken|jwt\.sign|createSession|req\.session\.\w+\s*=|setAuthCookie|setSessionCookie|grantAccess|res\.(json|send)\s*\(\s*\{.*token)/i.test(lines[i])
          ) {
            targetLineIdx = i;
            break;
          }
        }

        // If not found after, search whole file
        if (targetLineIdx === -1) {
          for (let i = 0; i < lines.length; i++) {
            if (
              /(createSessionToken|generateToken|createToken|issueToken|signToken|jwt\.sign|createSession|req\.session\.\w+\s*=|setAuthCookie|setSessionCookie|grantAccess|res\.(json|send)\s*\(\s*\{.*token)/i.test(lines[i])
            ) {
              targetLineIdx = i;
              break;
            }
          }
        }

        if (targetLineIdx !== -1) {
          const targetLineNumber = targetLineIdx + 1;
          const targetSnippet = lines[targetLineIdx].trim();

          // Update evidence to point to the decision line
          const updatedEvidence = finding.evidence.map(e => {
            if (e.file === finding.primaryLocation.file && (e.line === finding.primaryLocation.line || /getUserByUsername|req\.body/i.test(e.snippet))) {
              return {
                file: finding.primaryLocation.file,
                line: targetLineNumber,
                snippet: targetSnippet,
                explanation: "Authentication decision / session token creation performed without credential verification"
              };
            }
            return e;
          });

          // Ensure at least one evidence points to targetLineNumber
          if (!updatedEvidence.some(e => e.line === targetLineNumber)) {
            updatedEvidence.unshift({
              file: finding.primaryLocation.file,
              line: targetLineNumber,
              snippet: targetSnippet,
              explanation: "Authentication decision / session token creation performed without credential verification"
            });
          }

          return {
            ...finding,
            primaryLocation: {
              file: finding.primaryLocation.file,
              line: targetLineNumber
            },
            evidence: updatedEvidence
          };
        }
      }
    }

    if (finding.vulnerabilityClass === "SSRF") {
      // Check if current location points to an input extraction or assignment line
      const isInputExtractionOrAssign =
        /^\s*(const|let|var)?\s*(\{[^}]*\}|\w+)\s*=\s*(req\.(query|body|params)|new URL|params\.|query\.)/i.test(currentLineText) ||
        /req\.(query|body|params)/i.test(currentLineText);

      // Check if the current line already has the outbound request sink
      const hasOutboundSinkOnCurrentLine =
        /\b(axios\.(get|post|put|delete|patch|request)|axios\(|fetch\(|http\.(get|request)|https\.(get|request)|needle\(|got\(|urllib\(|request\()/i.test(currentLineText);

      if (isInputExtractionOrAssign && !hasOutboundSinkOnCurrentLine) {
        // Look for outbound network request sink in the file (preferring lines after currentLineIdx)
        let targetLineIdx = -1;

        for (let i = currentLineIdx + 1; i < lines.length; i++) {
          if (
            /\b(axios\.(get|post|put|delete|patch|request)|axios\(|fetch\(|http\.(get|request)|https\.(get|request)|needle\(|got\(|urllib\(|request\()/i.test(lines[i])
          ) {
            targetLineIdx = i;
            break;
          }
        }

        // If not found after, search whole file
        if (targetLineIdx === -1) {
          for (let i = 0; i < lines.length; i++) {
            if (
              /\b(axios\.(get|post|put|delete|patch|request)|axios\(|fetch\(|http\.(get|request)|https\.(get|request)|needle\(|got\(|urllib\(|request\()/i.test(lines[i])
            ) {
              targetLineIdx = i;
              break;
            }
          }
        }

        if (targetLineIdx !== -1) {
          const targetLineNumber = targetLineIdx + 1;
          const targetSnippet = lines[targetLineIdx].trim();

          // Update evidence to point to the actual SSRF sink
          const updatedEvidence = finding.evidence.map(e => {
            if (e.file === finding.primaryLocation.file && (e.line === finding.primaryLocation.line || /req\.(query|body|params)/i.test(e.snippet))) {
              return {
                file: finding.primaryLocation.file,
                line: targetLineNumber,
                snippet: targetSnippet,
                explanation: "Outbound HTTP request executed with untrusted user-controlled URL/input (SSRF sink)"
              };
            }
            return e;
          });

          // Ensure at least one evidence points to targetLineNumber
          if (!updatedEvidence.some(e => e.line === targetLineNumber)) {
            updatedEvidence.unshift({
              file: finding.primaryLocation.file,
              line: targetLineNumber,
              snippet: targetSnippet,
              explanation: "Outbound HTTP request executed with untrusted user-controlled URL/input (SSRF sink)"
            });
          }

          return {
            ...finding,
            primaryLocation: {
              file: finding.primaryLocation.file,
              line: targetLineNumber
            },
            evidence: updatedEvidence
          };
        }
      }
    }

    if (finding.vulnerabilityClass === "JWT_SECURITY") {
      // Check if current location points to header reading, token extraction, or route declaration
      const isHeaderExtractionOrRoute =
        /req\.headers(\.authorization|\[['"]authorization['"]\]|\.get\(['"]authorization['"]\))/i.test(currentLineText) ||
        /authHeader(\.split|\.replace|\.substring|\.slice|\s*=)/i.test(currentLineText) ||
        /^\s*(const|let|var)\s+\w+\s*=\s*req\.headers/i.test(currentLineText) ||
        /^\s*(app|router)\.(get|post|put|delete|patch|all|use)\s*\(/i.test(currentLineText);

      // Check if current line already has the jwt.decode or verification operation
      const hasJwtOperationOnCurrentLine =
        /\b(jwt\.decode|jwt\.verify|jwt\.sign)\b/i.test(currentLineText);

      if (isHeaderExtractionOrRoute && !hasJwtOperationOnCurrentLine) {
        // Look for jwt.decode or trust decision within local context (preferring lines after currentLineIdx)
        const { startIdx, endIdx } = this.getLocalContextRange(lines, currentLineIdx);
        let targetLineIdx = -1;

        for (let i = currentLineIdx + 1; i <= endIdx; i++) {
          if (/\bjwt\.decode\s*\(/i.test(lines[i]) || /req\.(user|session)\s*=\s*(decoded|jwt\.decode|token|payload|user)/i.test(lines[i])) {
            targetLineIdx = i;
            break;
          }
        }

        if (targetLineIdx === -1) {
          for (let i = startIdx; i < currentLineIdx; i++) {
            if (/\bjwt\.decode\s*\(/i.test(lines[i]) || /req\.(user|session)\s*=\s*(decoded|jwt\.decode|token|payload|user)/i.test(lines[i])) {
              targetLineIdx = i;
              break;
            }
          }
        }

        if (targetLineIdx !== -1) {
          const targetLineNumber = targetLineIdx + 1;
          const targetSnippet = lines[targetLineIdx].trim();

          const updatedEvidence = finding.evidence.map(e => {
            if (e.file === finding.primaryLocation.file && (e.line === finding.primaryLocation.line || /req\.headers|authHeader|app\.|router\./i.test(e.snippet))) {
              return {
                file: finding.primaryLocation.file,
                line: targetLineNumber,
                snippet: targetSnippet,
                explanation: "Unverified token decoded or trusted for authentication context (actual JWT vulnerability sink)"
              };
            }
            return e;
          });

          if (!updatedEvidence.some(e => e.line === targetLineNumber)) {
            updatedEvidence.unshift({
              file: finding.primaryLocation.file,
              line: targetLineNumber,
              snippet: targetSnippet,
              explanation: "Unverified token decoded or trusted for authentication context (actual JWT vulnerability sink)"
            });
          }

          return {
            ...finding,
            primaryLocation: {
              file: finding.primaryLocation.file,
              line: targetLineNumber
            },
            evidence: updatedEvidence
          };
        }
      }
    }

    return finding;
  }

  /**
   * Scopes code context to the immediate enclosing route handler, function, or local block
   * around lineIdx, preventing leaks across endpoints in multi-endpoint files.
   */
  private static getLocalContextRange(lines: string[], lineIdx: number): { startIdx: number; endIdx: number } {
    if (lineIdx < 0 || lineIdx >= lines.length) {
      return { startIdx: 0, endIdx: 0 };
    }

    const currentLine = lines[lineIdx] || "";
    const isRouteDecl = /^\s*(app|router)\.(get|post|put|delete|patch|all|use)\s*\(/i.test(currentLine);

    let startIdx = lineIdx;
    if (!isRouteDecl) {
      // Scan upward to find the start of the current route or function
      for (let i = lineIdx - 1; i >= 0 && i >= lineIdx - 30; i--) {
        const line = lines[i];
        if (/^\s*(app|router)\.(get|post|put|delete|patch|all|use)\s*\(/i.test(line)) {
          startIdx = i;
          break;
        }
        if (/^\s*(async\s+)?function\s*\w*\s*\(/i.test(line) || /^\s*(const|let|var)\s+\w+\s*=\s*(async\s*)?\([^)]*\)\s*=>/i.test(line)) {
          startIdx = i;
          break;
        }
        if (/^\s*\}\s*\)\s*;?\s*$/i.test(line) || /^\}\s*;?\s*$/i.test(line)) {
          // Closed previous block/function
          startIdx = i + 1;
          break;
        }
        startIdx = i;
      }
    }

    let endIdx = lineIdx;
    // Scan downward to find the end of the current route or function
    for (let i = lineIdx + 1; i < lines.length && i <= lineIdx + 30; i++) {
      const line = lines[i];
      if (/^\s*(app|router)\.(get|post|put|delete|patch|all|use)\s*\(/i.test(line)) {
        // Next route starts
        break;
      }
      if (/^\s*(async\s+)?function\s+\w+\s*\(/i.test(line)) {
        // Next function starts
        break;
      }
      endIdx = i;
      if (/^\s*\}\s*\)\s*;?\s*$/i.test(line) || /^\}\s*;?\s*$/i.test(line)) {
        // Closing of the current route handler or function
        break;
      }
    }

    return { startIdx, endIdx };
  }
}
