import type { ReviewSpecification } from "./ReviewSpecification.ts";

export const SecurityConfigurationSpec: ReviewSpecification = {
  id: "SEC-CONFIG-001",
  name: "Security Configuration Review",
  version: "1.0",
  category: "security-configuration",

  description:
    "Determines whether the application and its security-related configuration " +
    "follow secure defaults and industry best practices. Evaluates HTTP security " +
    "headers, CORS, HTTPS enforcement, debug/development exposures, and framework " +
    "security settings.",

  criteria: [
    // ────────────────────────────────────────────────────────────────
    // C1 — Security Headers
    // ────────────────────────────────────────────────────────────────
    {
      id: "CONFIG-C1",
      name: "Security Headers",
      description:
        "Appropriate HTTP security headers must be configured where applicable. " +
        "This includes Content-Security-Policy (CSP), X-Frame-Options, X-Content-Type-Options, " +
        "Referrer-Policy, and Strict-Transport-Security (HSTS).\n\n" +
        "PASS: The application explicitly sets security headers (e.g., via `helmet` in Node, " +
        "or secure middleware in other frameworks).\n" +
        "FAIL: The application explicitly disables security headers, or configures them " +
        "insecurely (e.g., `unsafe-inline` in CSP where avoidable, missing X-Frame-Options).\n" +
        "NOT_VERIFIED: Security headers are managed by a reverse proxy, WAF, or CDN " +
        "not visible in the provided code context, or the server initialization snippet is simply incomplete.",
    },

    // ────────────────────────────────────────────────────────────────
    // C2 — CORS Configuration
    // ────────────────────────────────────────────────────────────────
    {
      id: "CONFIG-C2",
      name: "CORS Configuration",
      description:
        "Cross-Origin Resource Sharing (CORS) must be configured securely. Detect " +
        "overly permissive configurations such as unrestricted origins (`*`), methods, " +
        "or allowing credentials with wildcard origins.\n\n" +
        "PASS: CORS is restricted to a specific allowlist of trusted domains, and " +
        "`credentials: true` is only used when strictly necessary with exact origins.\n" +
        "FAIL: CORS origin is set to `*` (especially on authenticated endpoints), or " +
        "dynamic CORS origin reflects the requesting Origin header blindly.\n" +
        "NOT_VERIFIED: CORS is handled by an API Gateway or reverse proxy.",
    },

    // ────────────────────────────────────────────────────────────────
    // C3 — HTTPS Enforcement
    // ────────────────────────────────────────────────────────────────
    {
      id: "CONFIG-C3",
      name: "HTTPS Enforcement",
      description:
        "Sensitive traffic must be protected using HTTPS. Detect disabled TLS enforcement, " +
        "insecure redirects, or insecure transport configuration within the application.\n\n" +
        "PASS: The application enforces HTTPS redirection, sets HSTS headers, and " +
        "requires secure connections.\n" +
        "FAIL: The application forces traffic to HTTP, or explicitly disables TLS verification.\n" +
        "NOT_VERIFIED: HTTPS enforcement, TLS termination, and redirects are managed by " +
        "an external load balancer (e.g., AWS ALB) or reverse proxy (e.g., Nginx).",
    },

    // ────────────────────────────────────────────────────────────────
    // C4 — Debug & Development Configuration
    // ────────────────────────────────────────────────────────────────
    {
      id: "CONFIG-C4",
      name: "Debug & Development Configuration",
      description:
        "Production deployments must not expose debug mode, verbose error pages, " +
        "development endpoints, test APIs, or unnecessary diagnostics.\n\n" +
        "PASS: Debug flags are disabled in production, and error handlers return generic " +
        "error messages without stack traces to the client.\n" +
        "FAIL: Stack traces, internal memory states, or debug endpoints (e.g., `/api/dev/dump`) " +
        "are exposed in production, or framework debug modes are hardcoded to `true`.\n" +
        "NOT_VERIFIED: Environment parity is assumed, but deployment targets/environments " +
        "cannot be determined from the code.",
    },

    // ────────────────────────────────────────────────────────────────
    // C5 — Secure Framework Configuration
    // ────────────────────────────────────────────────────────────────
    {
      id: "CONFIG-C5",
      name: "Secure Framework Configuration",
      description:
        "Security-related framework settings must be configured securely. This includes " +
        "CSRF protection enabled, secure cookie defaults, request size limits, and secure middleware.\n\n" +
        "PASS: The framework is configured with CSRF tokens for stateful endpoints, " +
        "payload sizes are strictly limited, and secure middleware is active.\n" +
        "FAIL: Built-in CSRF protections are explicitly disabled without a safe alternative, " +
        "payload limits are massive or nonexistent, or insecure template engines are used.\n" +
        "NOT_VERIFIED: Framework configuration is implicit or occurs in separate configuration " +
        "repositories.",
    },

    // ────────────────────────────────────────────────────────────────
    // C6 — Default Secure Configuration
    // ────────────────────────────────────────────────────────────────
    {
      id: "CONFIG-C6",
      name: "Default Secure Configuration",
      description:
        "The application must follow secure-by-default configuration principles. " +
        "Detect unnecessary services, unsafe default settings, disabled security " +
        "protections, or insecure feature flags.\n\n" +
        "PASS: Feature flags default to restrictive states, and unnecessary legacy " +
        "components are disabled.\n" +
        "FAIL: The application runs with elevated privileges by default, binds to " +
        "`0.0.0.0` unnecessarily exposing admin interfaces, or enables risky experimental " +
        "features by default.\n" +
        "NOT_VERIFIED: Default deployments are controlled by external orchestration " +
        "(e.g., Kubernetes manifests) not visible in the context.",
    },
  ],

  promptInstruction:
    "Focus your analysis on the changed files. For each criterion, determine " +
    "whether the code introduces, modifies, or fails to address the security configuration concern.\n\n" +

    "### Finding Requirements\n\n" +
    "Every finding MUST include:\n" +
    "1. **criterionId** — The exact criterion ID (CONFIG-C1 through CONFIG-C6) this finding relates to.\n" +
    "2. **evidence** — At least one evidence entry with the exact file path, line number, " +
    "and code snippet from the provided context. Never fabricate evidence.\n" +
    "3. **risk** — A clear description of the security risk (e.g., 'Wildcard CORS on authenticated " +
    "endpoints allows malicious sites to perform Cross-Site Request Forgery (CSRF)').\n" +
    "4. **remediation** — A concrete, implementable fix.\n\n" +

    "### Analysis Priorities\n\n" +
    "- Setting CORS `origin: '*'` with `credentials: true` (CONFIG-C2) is a **FAIL** and a critical vulnerability.\n" +
    "- Setting CORS `origin: '*'` without additional sensitive context is **NOT_VERIFIED**, as it lacks enough application context to determine if it is a vulnerability.\n" +
    "- However, dynamically reflecting `req.headers.origin` blindly (e.g., `req.headers.origin || '*'`) is a **FAIL** under CONFIG-C2 and a critical vulnerability.\n\n" +

    "### Verdict Assignment Rules\n\n" +
    "- Report each distinct issue as a separate finding.\n" +
    "- Exposing stack traces or debug mode in production (CONFIG-C4) is a **FAIL**.\n" +
    "- Explicitly disabling framework CSRF protections (CONFIG-C5) without replacing them " +
    "with stateless token architectures is a **FAIL**.\n" +
    "- If security headers or HTTPS enforcement are missing in application code, evaluate " +
    "if they are likely handled by a reverse proxy. If handled externally, use **NOT_VERIFIED** " +
    "rather than falsely failing the application logic.\n" +
    "- Never infer insecure configuration without explicit code evidence.",
};
