// ─── Default Routing Rules ──────────────────────────────────────
// Data-driven configuration mapping file patterns to checkpoints.
// To add a new checkpoint's routing, add a new RoutingRule entry.
// To modify routing, edit the matchPatterns array.
// No code changes to the Router itself are ever required.

import type { RoutingRule } from "./types.ts";

export const DEFAULT_ROUTING_RULES: RoutingRule[] = [
  {
    name: "Authentication",
    matchPatterns: [
      "auth", "login", "signup", "signin", "register",
      "password", "credential", "oauth", "passport",
      "sso", "saml", "oidc", "mfa", "2fa", "totp",
    ],
    checkpointIds: ["SEC-AUTH-001"],
  },
  {
    name: "Authorization",
    matchPatterns: [
      "policy", "permission", "acl", "role", "guard",
      "middleware", "authorize", "rbac", "abac", "access-control",
      "can-access", "is-allowed",
    ],
    checkpointIds: ["SEC-AUTHZ-001"],
  },
  {
    name: "Input Validation",
    matchPatterns: [
      "validator", "validation", "sanitize", "sanitizer",
      "schema", "zod", "joi", "yup", "ajv",
      "form", "input", "parser", "deserializ",
    ],
    checkpointIds: ["SEC-INPUT-001"],
  },
  {
    name: "Secrets Management",
    matchPatterns: [
      ".env", "secret", "credential", "apikey", "api_key",
      "api-key", "private_key", "private-key", "token",
      "vault", "keystore", "keyring",
    ],
    checkpointIds: ["SEC-SECRET-001"],
  },
  {
    name: "Session & JWT",
    matchPatterns: [
      "session", "jwt", "jsonwebtoken", "cookie",
      "token", "refresh-token", "access-token",
      "csrf", "xsrf",
    ],
    checkpointIds: ["SEC-SESSION-001"],
  },
  {
    name: "Cryptography",
    matchPatterns: [
      "crypto", "encrypt", "decrypt", "hash", "cipher",
      "hmac", "bcrypt", "scrypt", "argon", "pbkdf",
      "aes", "rsa", "tls", "ssl", "certificate",
      "x509", "pem", "pkcs",
    ],
    checkpointIds: ["SEC-CRYPTO-001"],
  },
  {
    name: "Security Configuration",
    matchPatterns: [
      "dockerfile", "docker-compose", "nginx", "apache",
      "terraform", "kubernetes", "k8s", "helm",
      "cloudformation", "serverless", "cdk",
      "cors", "csp", "security-header", "helmet",
      ".yaml", ".yml",
    ],
    checkpointIds: ["SEC-CONFIG-001"],
  },
  {
    name: "Cross-Site Scripting (XSS)",
    matchPatterns: [
      ".html", ".htm", ".jsx", ".tsx", ".vue",
      ".svelte", ".ejs", ".hbs", ".handlebars",
      ".pug", ".jade", "template", "render",
      "dangerouslysetinnerhtml", "innerhtml",
    ],
    checkpointIds: ["SEC-XSS-001"],
  },
  {
    name: "File & Path Security",
    matchPatterns: [
      "upload", "download", "file", "path",
      "stream", "multer", "busboy", "formidable",
      "fs", "filesystem", "storage", "blob",
      "attachment", "media",
    ],
    checkpointIds: ["SEC-FILE-001"],
  },
  {
    name: "Supply Chain & Dependencies",
    matchPatterns: [
      "package.json", "package-lock.json", "yarn.lock",
      "pnpm-lock.yaml", "shrinkwrap",
      "go.mod", "go.sum",
      "cargo.toml", "cargo.lock",
      "requirements.txt", "pipfile", "poetry.lock",
      "pom.xml", "build.gradle", "build.sbt",
      "gemfile", "composer.json", "mix.exs",
      ".github/workflows", ".github/actions",
      "renovate", "dependabot",
    ],
    checkpointIds: ["SEC-SUPPLY-001"],
  },
];
