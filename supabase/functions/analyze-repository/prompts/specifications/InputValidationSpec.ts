import type { ReviewSpecification } from "./ReviewSpecification.ts";

export const InputValidationSpec: ReviewSpecification = {
  id: "SEC-INPUT-001",
  name: "Input Validation Review",
  version: "1.0",
  category: "input-validation",

  description:
    "Determines whether all untrusted user input is validated and safely handled " +
    "before it is processed by the application. Evaluates validation of required " +
    "fields, data types, formats, length limits, server-side enforcement, safe " +
    "handling of dangerous or unexpected input, file upload constraints, and " +
    "schema validation.",

  criteria: [
    // ────────────────────────────────────────────────────────────────
    // C1 — Input Validation
    // ────────────────────────────────────────────────────────────────
    {
      id: "INPUT-C1",
      name: "Input Validation",
      description:
        "Incoming user input must be validated for required fields, expected data types, " +
        "allowed values, valid formats, and length limits. Applications should employ " +
        "an 'allowlist' approach where possible, explicitly defining what input is valid.\n\n" +
        "PASS: Input fields are explicitly validated for presence, type, format, and " +
        "length limits before processing.\n" +
        "FAIL: Input is accepted and processed without validation. Missing length limits " +
        "on string inputs. Relying on weak validation logic (e.g., flawed regex).\n" +
        "NOT_VERIFIED: Validation is handled by a middleware or framework mechanism " +
        "not visible in the provided context.",
    },

    // ────────────────────────────────────────────────────────────────
    // C2 — Input Sanitization
    // ────────────────────────────────────────────────────────────────
    {
      id: "INPUT-C2",
      name: "Input Sanitization",
      description:
        "Potentially dangerous user input must be safely handled (sanitized, encoded, " +
        "or escaped) before being stored or processed. Focus on whether the input is " +
        "prepared safely for its destination context. Note: Detailed XSS or specific " +
        "Injection reviews are covered in dedicated checkpoints; this criterion focuses " +
        "on the general principle of safe input preparation.\n\n" +
        "PASS: Input is safely sanitized, type-cast, or encoded before storage or " +
        "processing (e.g., using DOMPurify for rich text, stripping null bytes).\n" +
        "FAIL: Raw user input is passed directly to sensitive sinks or storage mechanisms " +
        "without any preparation or sanitization.\n" +
        "NOT_VERIFIED: Sanitization happens in an external service, middleware, or " +
        "ORM layer not visible in the provided context.",
    },

    // ────────────────────────────────────────────────────────────────
    // C3 — Server-side Validation
    // ────────────────────────────────────────────────────────────────
    {
      id: "INPUT-C3",
      name: "Server-side Validation",
      description:
        "Input validation must be enforced on the backend. Client-side validation " +
        "(e.g., HTML5 'required' attributes, React form validation libraries) is for " +
        "UX purposes only and is easily bypassed. Every API endpoint must independently " +
        "validate the input it receives.\n\n" +
        "PASS: The backend endpoint or server action independently validates the input.\n" +
        "FAIL: Validation exists only on the frontend, while the corresponding backend " +
        "endpoint accepts the data without validation.\n" +
        "NOT_VERIFIED: The backend code is not provided in the context.",
    },

    // ────────────────────────────────────────────────────────────────
    // C4 — Dangerous Input Handling
    // ────────────────────────────────────────────────────────────────
    {
      id: "INPUT-C4",
      name: "Dangerous Input Handling",
      description:
        "Malformed, oversized, unexpected, null, or invalid input must be safely " +
        "rejected before business logic executes. Applications must not crash or " +
        "enter undefined states when encountering bad input.\n\n" +
        "PASS: Unexpected input types (e.g., arrays instead of strings), null values, " +
        "or excessively large payloads are explicitly rejected or safely handled.\n" +
        "FAIL: Application crashes, throws unhandled exceptions, or exhibits unexpected " +
        "behavior due to type confusion (e.g., calling .replace() on an array passed in " +
        "JSON), null pointer dereferences, or lack of payload size limits.\n" +
        "NOT_VERIFIED: Error handling and payload parsing are managed by the framework " +
        "or middleware out of context.",
    },

    // ────────────────────────────────────────────────────────────────
    // C5 — File Upload Validation
    // ────────────────────────────────────────────────────────────────
    {
      id: "INPUT-C5",
      name: "File Upload Validation",
      description:
        "If file uploads exist, uploaded files must be strictly validated. Validation " +
        "should include file type checking (MIME type and extension), strict size limits, " +
        "and potentially other security constraints (like safe storage paths or AV scanning).\n\n" +
        "PASS: Uploaded files have strict size limits enforced and file types are " +
        "verified (preferably beyond just trusting the extension).\n" +
        "FAIL: File uploads lack size limits, accept dangerous file types (e.g., .exe, " +
        ".php, .sh), or trust client-provided MIME types without verification.\n" +
        "NOT_VERIFIED: The application has no file upload functionality in the provided " +
        "context, or the upload logic is handled by a third-party service.",
    },

    // ────────────────────────────────────────────────────────────────
    // C6 — Schema Validation
    // ────────────────────────────────────────────────────────────────
    {
      id: "INPUT-C6",
      name: "Schema Validation",
      description:
        "Incoming requests (especially JSON payloads) should be validated against a " +
        "defined request schema before reaching business logic. Using robust schema " +
        "validation libraries (e.g., Zod, Joi, JSON Schema, OpenAPI validators) provides " +
        "a defense-in-depth approach to input validation.\n\n" +
        "PASS: The endpoint validates the entire request payload against a strictly " +
        "defined schema.\n" +
        "FAIL: The endpoint manually extracts fields from the request body without " +
        "comprehensive schema validation, potentially allowing unexpected fields or " +
        "bypassing structural validation.\n" +
        "NOT_VERIFIED: Schema validation is enforced globally at the API Gateway or " +
        "framework level not visible in the context.",
    },
  ],

  promptInstruction:
    "Focus your analysis on the changed files. For each criterion, determine " +
    "whether the code introduces, modifies, or fails to address the input validation concern.\n\n" +

    "### Finding Requirements\n\n" +
    "Every finding MUST include:\n" +
    "1. **criterionId** — The exact criterion ID (INPUT-C1 through INPUT-C6) this finding relates to.\n" +
    "2. **evidence** — At least one evidence entry with the exact file path, line number, " +
    "and code snippet from the provided context. Never fabricate evidence.\n" +
    "3. **risk** — A clear description of the security risk (e.g., 'Missing length limits " +
    "can lead to Denial of Service via resource exhaustion').\n" +
    "4. **remediation** — A concrete, implementable fix (not generic advice).\n\n" +

    "### Verdict Assignment Rules\n\n" +
    "- Report each distinct issue as a separate finding.\n" +
    "- A single criterion can have multiple findings if multiple issues exist.\n" +
    "- If a criterion is not applicable to the changed code (e.g., no file uploads exist, " +
    "return NOT_VERIFIED for INPUT-C5). Do not report it as a finding — note its absence in the summary.\n" +
    "- If a criterion cannot be fully evaluated because required context is missing, use " +
    "NOT_VERIFIED rather than assumptions.\n" +
    "- Never infer vulnerabilities without sufficient code evidence.\n\n" +

    "### Analysis Priorities\n\n" +
    "- Unrestricted file uploads (INPUT-C5) are almost always **critical** severity.\n" +
    "- Client-only validation without backend enforcement (INPUT-C3) is a **FAIL** and " +
    "typically **critical**.\n" +
    "- Missing length limits (INPUT-C1) or missing schema validation (INPUT-C6) on " +
    "complex JSON payloads is a **FAIL** and typically **warning** or **moderate**.\n" +
    "- For INPUT-C2, focus on the general principle of safely preparing untrusted input " +
    "before processing or storage. Do not perform a deep XSS or specific injection review, " +
    "as those are covered in dedicated checkpoints.",
};
