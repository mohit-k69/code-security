import type { EvalDataset } from "../types.ts";

export const XssEvalDataset: EvalDataset = {
  checkpointId: "SEC-XSS-001",
  version: "1.0",
  scenarios: [
    // ═══════════════════════════════════════════════════════════════════
    // XSS-C1: Output Encoding
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "XSS-FAIL-01",
      description: "Direct interpolation into HTML string",
      tags: ["xss", "encoding", "interpolation", "html"],
      criteriaTargeted: ["XSS-C1"],
      changedFiles: [
        {
          path: "src/views/profile.ts",
          content: `
export function renderProfile(user) {
  // Directly inserting user input into HTML without encoding
  return \`
    <div class="profile">
      <h1>Welcome, \${user.displayName}</h1>
      <p>\${user.bio}</p>
    </div>
  \`;
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "XSS-C1",
          expectedEvidence: [{ file: "src/views/profile.ts", snippetSubstr: "\${user.displayName}" }]
        }
      ],
      rationale: "String interpolation into HTML without entity encoding allows attackers to inject arbitrary <script> tags."
    },
    {
      id: "XSS-FAIL-02",
      description: "Direct interpolation into a JavaScript block (XSS in JS Context)",
      tags: ["xss", "encoding", "javascript-context"],
      criteriaTargeted: ["XSS-C1"],
      changedFiles: [
        {
          path: "src/views/tracking.ts",
          content: `
export function renderTrackingCode(userId, username) {
  // Directly inserting user input into a JavaScript block
  return \`
    <script>
      window.CURRENT_USER = {
        id: "\${userId}",
        name: "\${username}" // Attacker inputs: "; alert(1); //
      };
    </script>
  \`;
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "XSS-C1",
          expectedEvidence: [{ file: "src/views/tracking.ts", snippetSubstr: "name: \"\${username}\"" }]
        }
      ],
      rationale: "Inserting untrusted data directly into a `<script>` block allows attackers to break out of the string literal and execute arbitrary JS."
    },
    {
      id: "XSS-PASS-01",
      description: "Safe output encoding using a library",
      tags: ["secure", "encoding", "escape-html"],
      criteriaTargeted: ["XSS-C1"],
      changedFiles: [
        {
          path: "src/views/profile.ts",
          content: `
import escapeHtml from 'escape-html';

export function renderProfile(user) {
  // Safely encoding HTML entities before rendering
  return \`
    <div class="profile">
      <h1>Welcome, \${escapeHtml(user.displayName)}</h1>
      <p>\${escapeHtml(user.bio)}</p>
    </div>
  \`;
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Using an established library to encode HTML entities neutralizes XSS payloads."
    },

    // ═══════════════════════════════════════════════════════════════════
    // XSS-C2: Unsafe DOM Manipulation
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "XSS-FAIL-03",
      description: "Unsafe use of innerHTML",
      tags: ["xss", "dom", "innerhtml"],
      criteriaTargeted: ["XSS-C2"],
      changedFiles: [
        {
          path: "src/client/comments.js",
          content: `
function renderComment(commentText) {
  const div = document.createElement('div');
  // VULNERABLE: Direct assignment to innerHTML
  div.innerHTML = commentText; 
  document.body.appendChild(div);
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "XSS-C2",
          expectedEvidence: [{ file: "src/client/comments.js", snippetSubstr: "div.innerHTML = commentText;" }]
        }
      ],
      rationale: "Assigning untrusted data to `innerHTML` allows the browser to parse and execute any malicious script tags contained within."
    },
    {
      id: "XSS-FAIL-04",
      description: "DOM-based XSS via location.hash (Enhancement)",
      tags: ["xss", "dom-based", "location"],
      criteriaTargeted: ["XSS-C2"],
      changedFiles: [
        {
          path: "src/client/router.js",
          content: `
function loadTab() {
  const hash = window.location.hash.substring(1);
  if (hash) {
    // VULNERABLE: Takes input from the URL fragment and renders it
    document.getElementById('current-tab').innerHTML = "Loading tab: " + hash;
  }
}
window.addEventListener('hashchange', loadTab);
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "XSS-C2",
          expectedEvidence: [{ file: "src/client/router.js", snippetSubstr: "innerHTML = \"Loading tab: \" + hash;" }]
        }
      ],
      rationale: "DOM-based XSS occurs when a script reads data from an attacker-controllable source (like location.hash) and passes it to an unsafe sink (like innerHTML)."
    },
    {
      id: "XSS-PASS-02",
      description: "Safe DOM manipulation using textContent",
      tags: ["secure", "dom", "textcontent"],
      criteriaTargeted: ["XSS-C2"],
      changedFiles: [
        {
          path: "src/client/comments.js",
          content: `
function renderComment(commentText) {
  const div = document.createElement('div');
  // SAFE: textContent does not parse HTML
  div.textContent = commentText; 
  document.body.appendChild(div);
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "`textContent` safely treats the input as plain text, preventing the browser from parsing it as executable HTML."
    },

    // ═══════════════════════════════════════════════════════════════════
    // XSS-C3: Template Rendering Safety
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "XSS-FAIL-05",
      description: "Disabling escaping in Handlebars (triple-stash)",
      tags: ["xss", "template", "handlebars", "unescaped"],
      criteriaTargeted: ["XSS-C3"],
      changedFiles: [
        {
          path: "src/views/email.hbs",
          content: `
<div>
  <!-- VULNERABLE: Triple stash disables HTML escaping -->
  <p>Message from user: {{{ userMessage }}}</p>
</div>
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "XSS-C3",
          expectedEvidence: [{ file: "src/views/email.hbs", snippetSubstr: "{{{ userMessage }}}" }]
        }
      ],
      rationale: "Using `{{{ }}}` in Handlebars intentionally disables HTML escaping, allowing XSS if the variable contains untrusted data."
    },
    {
      id: "XSS-FAIL-06",
      description: "Disabling escaping in Pug",
      tags: ["xss", "template", "pug", "unescaped"],
      criteriaTargeted: ["XSS-C3"],
      changedFiles: [
        {
          path: "src/views/dashboard.pug",
          content: `
div.dashboard
  h1 Dashboard
  //- VULNERABLE: != operator disables escaping in Pug
  div.content != userDashboardConfig
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "XSS-C3",
          expectedEvidence: [{ file: "src/views/dashboard.pug", snippetSubstr: "!= userDashboardConfig" }]
        }
      ],
      rationale: "The `!=` operator in Pug instructs the engine to render the string as raw, unescaped HTML."
    },
    {
      id: "XSS-PASS-03",
      description: "Safe default template escaping",
      tags: ["secure", "template", "escaped"],
      criteriaTargeted: ["XSS-C3"],
      changedFiles: [
        {
          path: "src/views/email.hbs",
          content: `
<div>
  <!-- SAFE: Double stash automatically escapes HTML -->
  <p>Message from user: {{ userMessage }}</p>
</div>
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Using the standard template tags (`{{ }}`) ensures that the templating engine automatically escapes dangerous characters."
    },

    // ═══════════════════════════════════════════════════════════════════
    // XSS-C4: Dangerous HTML Rendering
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "XSS-FAIL-07",
      description: "Unsafe dangerouslySetInnerHTML in React",
      tags: ["xss", "react", "dangerouslySetInnerHTML"],
      criteriaTargeted: ["XSS-C4"],
      changedFiles: [
        {
          path: "src/components/BlogPost.jsx",
          content: `
import React from 'react';

export function BlogPost({ post }) {
  return (
    <div className="blog-post">
      <h1>{post.title}</h1>
      {/* VULNERABLE: Rendering raw HTML from the database without sanitization */}
      <div dangerouslySetInnerHTML={{ __html: post.content }} />
    </div>
  );
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "XSS-C4",
          expectedEvidence: [{ file: "src/components/BlogPost.jsx", snippetSubstr: "dangerouslySetInnerHTML={{ __html: post.content }}" }]
        }
      ],
      rationale: "React's `dangerouslySetInnerHTML` bypasses the virtual DOM's automatic escaping. If the content is not strictly sanitized, it allows XSS."
    },
    {
      id: "XSS-FAIL-08",
      description: "Unsafe v-html in Vue",
      tags: ["xss", "vue", "v-html"],
      criteriaTargeted: ["XSS-C4"],
      changedFiles: [
        {
          path: "src/components/Comment.vue",
          content: `
<template>
  <div class="comment">
    <strong>{{ author }}</strong>
    <!-- VULNERABLE: v-html renders unescaped HTML -->
    <div v-html="commentHtml"></div>
  </div>
</template>
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "XSS-C4",
          expectedEvidence: [{ file: "src/components/Comment.vue", snippetSubstr: "v-html=\"commentHtml\"" }]
        }
      ],
      rationale: "The `v-html` directive in Vue behaves like `innerHTML`. Passing untrusted data to it directly results in XSS."
    },
    {
      id: "XSS-PASS-04",
      description: "Sanitizing Markdown output before React rendering (Enhancement)",
      tags: ["secure", "react", "markdown", "dompurify"],
      criteriaTargeted: ["XSS-C4"],
      changedFiles: [
        {
          path: "src/components/MarkdownViewer.jsx",
          content: `
import React from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

export function MarkdownViewer({ text }) {
  // 1. Convert markdown to HTML
  const rawHtml = marked(text);
  // 2. Strict sanitization before rendering
  const cleanHtml = DOMPurify.sanitize(rawHtml);
  
  return <div dangerouslySetInnerHTML={{ __html: cleanHtml }} />;
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Markdown parsers often allow HTML by default. Passing the output through DOMPurify securely strips any malicious scripts before rendering."
    },
    {
      id: "XSS-PASS-05",
      description: "Using dangerouslySetInnerHTML with strictly trusted static data",
      tags: ["secure", "react", "trusted-data"],
      criteriaTargeted: ["XSS-C4"],
      changedFiles: [
        {
          path: "src/components/IconBox.jsx",
          content: `
import React from 'react';
import { iconRegistry } from '../constants/icons.js';

export function IconBox({ iconName }) {
  // Statically fetching a trusted SVG string from an internal hardcoded registry
  const svgString = iconRegistry[iconName] || iconRegistry.default;
  
  // SAFE: The input is entirely trusted and internally managed
  return <div className="icon" dangerouslySetInnerHTML={{ __html: svgString }} />;
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "The use of `dangerouslySetInnerHTML` is secure here because the payload is explicitly sourced from a trusted, hardcoded internal registry, not user input."
    },

    // ═══════════════════════════════════════════════════════════════════
    // XSS-C5: Content Security Policy (CSP)
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "XSS-FAIL-09",
      description: "Weak CSP allowing unsafe-inline",
      tags: ["xss", "csp", "unsafe-inline"],
      criteriaTargeted: ["XSS-C5"],
      changedFiles: [
        {
          path: "src/server/headers.ts",
          content: `
export function setHeaders(req, res, next) {
  // VULNERABLE: unsafe-inline completely breaks XSS protection for scripts
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'");
  next();
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "XSS-C5",
          expectedEvidence: [{ file: "src/server/headers.ts", snippetSubstr: "'unsafe-inline'" }]
        }
      ],
      rationale: "Using `'unsafe-inline'` in the `script-src` directive allows any injected `<script>` tags or inline event handlers to execute, bypassing the CSP."
    },
    {
      id: "XSS-PASS-06",
      description: "Strict Content Security Policy (Nonces)",
      tags: ["secure", "csp", "nonce"],
      criteriaTargeted: ["XSS-C5"],
      changedFiles: [
        {
          path: "src/server/headers.ts",
          content: `
import crypto from 'crypto';

export function setCsp(req, res, next) {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.nonce = nonce;
  
  // STRICT CSP: Only allows scripts with the securely generated, request-specific nonce
  res.setHeader("Content-Security-Policy", \`default-src 'self'; script-src 'self' 'nonce-\${nonce}'\`);
  next();
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "A nonce-based CSP ensures that only explicitly authorized `<script>` blocks (containing the unpredictable nonce) can execute, stopping injected scripts."
    },

    // ═══════════════════════════════════════════════════════════════════
    // XSS-C6: JavaScript URL & Event Handler Injection
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "XSS-FAIL-10",
      description: "Unvalidated javascript: URL injection in React",
      tags: ["xss", "react", "javascript-url", "href"],
      criteriaTargeted: ["XSS-C6"],
      changedFiles: [
        {
          path: "src/components/UserLink.jsx",
          content: `
import React from 'react';

export function UserLink({ url, text }) {
  // VULNERABLE: React does NOT protect against javascript: URIs in href
  return <a href={url}>{text}</a>;
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "XSS-C6",
          expectedEvidence: [{ file: "src/components/UserLink.jsx", snippetSubstr: "href={url}" }]
        }
      ],
      rationale: "If `url` is `javascript:alert(1)`, clicking the link executes the JavaScript. URLs must be validated to ensure they use safe protocols (`http:`, `https:`)."
    },
    {
      id: "XSS-FAIL-11",
      description: "Inline event handler injection in template",
      tags: ["xss", "template", "event-handler", "inline"],
      criteriaTargeted: ["XSS-C6"],
      changedFiles: [
        {
          path: "src/views/button.hbs",
          content: `
<!-- VULNERABLE: If buttonAction contains quotes, an attacker can inject arbitrary JS -->
<button onclick="executeAction('{{ buttonAction }}')">Click Me</button>
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "XSS-C6",
          expectedEvidence: [{ file: "src/views/button.hbs", snippetSubstr: "onclick=\"executeAction('{{ buttonAction }}')\"" }]
        }
      ],
      rationale: "Escaping HTML does not secure data placed directly inside an executable JavaScript context (like an `onclick` attribute). The attacker can break out with `'); alert(1);//`."
    },
    {
      id: "XSS-PASS-07",
      description: "Validating URLs before rendering",
      tags: ["secure", "url", "validation"],
      criteriaTargeted: ["XSS-C6"],
      changedFiles: [
        {
          path: "src/components/UserLink.jsx",
          content: `
import React from 'react';

export function UserLink({ url, text }) {
  // Validate protocol
  let safeUrl = '#';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      safeUrl = parsed.href;
    }
  } catch (e) {
    // Invalid URL
  }
  
  return <a href={safeUrl}>{text}</a>;
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Strictly validating that the URL uses HTTP/HTTPS neutralizes `javascript:` URI attacks."
    },

    // ═══════════════════════════════════════════════════════════════════
    // Cross-Cutting Scenarios
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "XSS-PASS-08",
      description: "Perfectly secured rich text rendering",
      tags: ["comprehensive", "secure", "rich-text"],
      criteriaTargeted: ["XSS-C2", "XSS-C4", "XSS-C6"],
      changedFiles: [
        {
          path: "src/components/RichText.jsx",
          content: `
import React from 'react';
import DOMPurify from 'dompurify';

export function RichText({ htmlInput }) {
  // DOMPurify handles recursive sanitization and strips javascript: URLs by default
  const clean = DOMPurify.sanitize(htmlInput, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a'],
    ALLOWED_ATTR: ['href']
  });
  
  return <div dangerouslySetInnerHTML={{ __html: clean }} />;
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Uses a vetted sanitization library with a strict allowlist before rendering dangerous HTML."
    },
    {
      id: "XSS-NV-01",
      description: "PR modifies backend SQL queries only",
      tags: ["unrelated", "backend", "sql"],
      criteriaTargeted: [],
      changedFiles: [
        {
          path: "src/db/queries.ts",
          content: `
export function getUser(id) {
  return db.query('SELECT * FROM users WHERE id = ?', [id]);
}
`.trim()
        }
      ],
      expectedVerdict: "NOT_VERIFIED",
      rationale: "No frontend rendering, DOM manipulation, or template logic is present."
    }
  ]
};
