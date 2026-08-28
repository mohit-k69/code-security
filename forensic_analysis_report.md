# Forensic Analysis Report: Pipeline Discrepancies (tc_042, tc_044, tc_093)

## 1. `tc_042` (Admin delete-user using client-controlled ID)
* **Observed vs Expected:** The LLM output `BUSINESS_LOGIC_FLAW` instead of the benchmark's expected `AUTH_BYPASS`.
* **Root Cause:** The model's reasoning is flawlessly aligned with the current internal taxonomy. In `AuthorizationSpec.ts`, the prompt explicitly instructs: *"For authorization failures caused by client-controlled object identifiers, missing ownership checks, or IDOR-style access to another user's resources, use BUSINESS_LOGIC_FLAW. Reserve AUTH_BYPASS for cases where authentication or an existing authorization control is directly bypassed."* Since `req.body.userId` is a client-controlled ID, the LLM correctly applied the `BUSINESS_LOGIC_FLAW` class.
* **Ground Truth Validity:** The benchmark ground truth expectation (`AUTH_BYPASS`) is **invalid/outdated** relative to the current specification taxonomy.

## 2. `tc_044` (Password reset without token)
* **Observed vs Expected:** The LLM output `NOT_VERIFIED` instead of the expected `FAIL`, despite the new rule in `pasteCodeOverride`.
* **Root Cause:** The `SEC-AUTH-001` specification contains hardcoded, highly defensive grading rubrics that override the general pasteCode instruction. Specifically, for `AUTH-C6: Password Reset & Recovery`, the spec explicitly commands: *"FAIL: [...] Do not FAIL merely because protections are absent from a partial snippet."* and *"NOT_VERIFIED: No password reset flow is present, or the flow is incomplete in the changed files."* The LLM interprets the lack of token validation as an "incomplete flow" or "protections absent from a partial snippet" and follows the strict criterion-specific instruction to return `NOT_VERIFIED`.
* **Ground Truth Validity:** The ground truth (`FAIL`) is conceptually valid for the benchmark, but impossible for the LLM to reach while the `AUTH-C6` criteria strictly forbid failing "merely because protections are absent."

## 3. `tc_093` (Internal users endpoint)
* **Observed vs Expected:** The LLM assigned `critical` severity instead of the expected `warning`.
* **Root Cause:** There is a collision of severity rules in `AuthorizationSpec.ts`. Rule A states: *"Missing authorization on non-destructive read operations is typically warning."* Rule B states: *"Missing admin guards (AUTHZ-C3) are typically critical if admin data is exposed."* The LLM interpreted the `db.getInternalUsers()` operation as exposing administrative/internal data, triggering the `critical` escalation rule over the read-only `warning` rule.
* **Ground Truth Validity:** The ground truth (`warning`) is supported by the non-destructive read rule, but the LLM's classification (`critical`) is equally supported by the admin data rule. 

---

## Comparison Against `pasteCodeOverride`
The recent update to `pasteCodeOverride` successfully instructed the model on the *general* philosophy of evaluating visibly insecure flows. It successfully "unstuck" cases like `tc_042` and `tc_093` from `NOT_VERIFIED`, allowing them to be evaluated as `FAIL`. However, the general override cannot overcome explicit, localized contradictions within specific checkpoint criteria (e.g., `AUTH-C6`).

## Smallest Systemic Fixes
Instead of adding case-specific prompt overrides, the smallest systemic fixes are:
1. **For taxonomy & severity mismatches (tc_042, tc_093):** **Update the benchmark ground truth JSON.** The LLM is correctly following its detailed specification. Modifying the prompt to force the model to output `AUTH_BYPASS` for IDORs would break the entire taxonomy.
2. **For overly defensive NOT_VERIFIED (tc_044):** Modify the `AUTH-C6` criterion in `AuthenticationSpec.ts`. Change *"Do not FAIL merely because protections are absent from a partial snippet"* to clarify that a complete endpoint signature performing a sensitive action (like password reset) using *only* easily forged parameters (like email and new password) constitutes a fundamentally insecure flow, warranting a `FAIL`.

## Expected Affected Cases & Regression Risk
* **Affected Cases:** Updating ground truth will fix `tc_042`, `tc_093`, and likely similar IDOR/auth cases (e.g., `tc_021`, `tc_023`). Refining `AUTH-C6` will fix `tc_044` and `tc_045`.
* **Regression Risk:** Low. Adjusting the benchmark ground truth introduces zero risk to the LLM's behavior in production. Refining the `AUTH-C6` criteria carries a low-to-moderate risk of generating false positive `FAIL`s for genuinely incomplete snippets, provided the refinement is strictly scoped to "fundamentally insecure flows based solely on client-controlled parameters."
