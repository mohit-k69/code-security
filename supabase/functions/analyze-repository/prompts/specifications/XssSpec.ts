import type { ReviewSpecification } from "./ReviewSpecification.ts";

export const XssSpec: ReviewSpecification = {
  id: "SEC-XSS-001",
  name: "Cross-Site Scripting (XSS) Review",
  version: "1.0",
  category: "xss",

  description:
    "Determines whether untrusted user-controlled content can be rendered or " +
    "executed as JavaScript in a user's browser. Evaluates output encoding, " +
    "DOM manipulation, template rendering, and Content Security Policy (CSP).",

  criteria: [
    // ────────────────────────────────────────────────────────────────
    // C1 — Output Encoding
    // ────────────────────────────────────────────────────────────────
    {
      id: "XSS-C1",
      name: "Output Encoding",
      description:
        "Untrusted data must be safely encoded before being rendered into HTML, " +
        "JavaScript, CSS, or URLs. Detect direct rendering of untrusted content " +
        "without appropriate context-specific encoding.\n\n" +
        "PASS: User input is properly HTML-entity encoded before being placed in " +
        "the DOM, or safely URL-encoded before being placed in a link.\n" +
        "FAIL: User input is directly interpolated into an HTML string or script " +
        "block without any encoding (e.g., `<script>var user = '\${userInput}';</script>`).\n" +
        "NOT_VERIFIED: Output encoding is handled completely by a frontend framework " +
        "that is not part of the analyzed context.",
    },

    // ────────────────────────────────────────────────────────────────
    // C2 — Unsafe DOM Manipulation
    // ────────────────────────────────────────────────────────────────
    {
      id: "XSS-C2",
      name: "Unsafe DOM Manipulation",
      description:
        "The application must not use unsafe browser APIs that can execute attacker-" +
        "controlled content. Examples include `innerHTML`, `outerHTML`, `document.write()`, " +
        "or evaluating strings as code (`setTimeout(string)`, `eval()`).\n\n" +
        "PASS: The application uses safe APIs like `textContent`, `innerText`, or " +
        "`setAttribute()` when updating the DOM with user input.\n" +
        "FAIL: The application assigns untrusted user input directly to `element.innerHTML` " +
        "or uses `document.write(userInput)`.\n" +
        "NOT_VERIFIED: DOM manipulation happens in an external library outside the code context.",
    },

    // ────────────────────────────────────────────────────────────────
    // C3 — Template Rendering Safety
    // ────────────────────────────────────────────────────────────────
    {
      id: "XSS-C3",
      name: "Template Rendering Safety",
      description:
        "Server-side and client-side template rendering must safely escape untrusted " +
        "values by default. Detect when automatic escaping is explicitly disabled.\n\n" +
        "PASS: Templates use standard, safe tags (e.g., `{{ value }}` in Handlebars/Jinja) " +
        "that automatically HTML-escape the output.\n" +
        "FAIL: Templates explicitly use unsafe, unescaped tags (e.g., `{{{ value }}}` in " +
        "Handlebars, `!=` in Pug, or `| safe` in Jinja) to render untrusted user input.\n" +
        "NOT_VERIFIED: The template engine configuration is unknown, making it impossible " +
        "to determine if escaping is enabled by default.",
    },

    // ────────────────────────────────────────────────────────────────
    // C4 — Dangerous HTML Rendering
    // ────────────────────────────────────────────────────────────────
    {
      id: "XSS-C4",
      name: "Dangerous HTML Rendering",
      description:
        "If user-controlled HTML must be rendered (e.g., rich text editors, markdown), " +
        "it must be strictly sanitized using a vetted library (like DOMPurify) before rendering.\n\n" +
        "PASS: Untrusted HTML is passed through `DOMPurify.sanitize()` before being rendered " +
        "via React's `dangerouslySetInnerHTML` or Vue's `v-html`.\n" +
        "FAIL: Untrusted HTML is passed directly to `dangerouslySetInnerHTML`, `v-html`, " +
        "or Angular's `bypassSecurityTrustHtml()` without sanitization.\n" +
        "NOT_VERIFIED: The payload passed to the dangerous rendering function is statically " +
        "imported from a trusted internal module, not from user input.",
    },

    // ────────────────────────────────────────────────────────────────
    // C5 — Content Security Policy (CSP)
    // ────────────────────────────────────────────────────────────────
    {
      id: "XSS-C5",
      name: "Content Security Policy (CSP)",
      description:
        "The application should use an appropriate Content Security Policy as a defense-in-depth " +
        "measure. Detect unsafe CSP configurations that weaken XSS protections.\n\n" +
        "PASS: A strict CSP is implemented, avoiding `unsafe-inline` and `unsafe-eval` for scripts.\n" +
        "FAIL: The CSP explicitly allows `'unsafe-inline'` or `'unsafe-eval'` for the `script-src` " +
        "directive, rendering it largely ineffective against XSS.\n" +
        "NOT_VERIFIED: CSP is managed entirely by infrastructure (e.g., Nginx, API Gateway, CDN) " +
        "outside the available code context.",
    },

    // ────────────────────────────────────────────────────────────────
    // C6 — JavaScript URL & Event Handler Injection
    // ────────────────────────────────────────────────────────────────
    {
      id: "XSS-C6",
      name: "JavaScript URL & Event Handler Injection",
      description:
        "User-controlled input must not reach executable JavaScript contexts such as " +
        "`javascript:` URLs or inline event handlers (`onclick`, `onerror`, `onload`).\n\n" +
        "PASS: URLs are validated to ensure they start with `http://` or `https://` before " +
        "being placed in an `href` attribute. Event listeners are attached securely via JS.\n" +
        "FAIL: A user-provided URL is placed directly into `<a href=\"\${userInput}\">`. " +
        "If the user inputs `javascript:alert(1)`, it executes XSS when clicked.\n" +
        "NOT_VERIFIED: The URL validation logic happens in a backend microservice not present " +
        "in the context.",
    },
  ],

  promptInstruction:
    "Focus your analysis on the changed files. For each criterion, determine " +
    "whether the code introduces, modifies, or fails to address the XSS concern.\n\n" +

    "### Finding Requirements\n\n" +
    "Every finding MUST include:\n" +
    "1. **criterionId** — The exact criterion ID (XSS-C1 through XSS-C6) this finding relates to.\n" +
    "2. **evidence** — At least one evidence entry with the exact file path, line number, " +
    "and code snippet from the provided context. Never fabricate evidence.\n" +
    "3. **risk** — A clear description of the security risk (e.g., 'Using dangerouslySetInnerHTML " +
    "with unsanitized input allows an attacker to execute arbitrary JavaScript in the victim\\'s browser').\n" +
    "4. **remediation** — A concrete, implementable fix.\n\n" +

    "### Verdict Assignment Rules\n\n" +
    "- Report each distinct issue as a separate finding.\n" +
    "- Distinguish between user-controlled input and trusted application content. Do not flag " +
    "`innerHTML` or `dangerouslySetInnerHTML` if the input is provably static, trusted, or " +
    "sanitized via a vetted library like DOMPurify.\n" +
    "- Using `dangerouslySetInnerHTML`, `v-html`, or `innerHTML` with unsanitized user input " +
    "(XSS-C2, XSS-C4) is a **FAIL** and a critical vulnerability.\n" +
    "- Injecting user input directly into an `href` attribute without URL validation (XSS-C6) " +
    "is a **FAIL** due to the `javascript:` URI vector.\n" +
    "- Unescaped template tags (e.g., `{{{ ... }}}` in Handlebars) used with user input (XSS-C3) " +
    "is a **FAIL**.\n" +
    "- Never infer XSS vulnerabilities without explicit code evidence.",
};
