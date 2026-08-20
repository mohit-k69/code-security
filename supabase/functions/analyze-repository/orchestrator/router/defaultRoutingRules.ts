// ─── Default Routing Rules ──────────────────────────────────────
// Data-driven configuration mapping file patterns to checkpoints.
// To add a new checkpoint's routing, add a new RoutingRule entry.
// To modify routing, edit the matchPatterns array.
// No code changes to the Router itself are ever required.

import type { RoutingRule } from "./types.ts";

export const DEFAULT_ROUTING_RULES: RoutingRule[] = [
  {
    name: "Authentication",
    fileMatchPatterns: [
      "auth", "login", "signup", "signin", "register",
      "password", "credential", "oauth", "passport",
      "sso", "saml", "oidc", "mfa", "2fa", "totp",
    ],
    contentMatchPatterns: [
      "jwt.sign", "jwt.verify", "jsonwebtoken", "authenticate", "authorization", "session", "password"
    ],
    checkpointIds: ["SEC-AUTH-001"],
  },
  {
    name: "Authorization",
    fileMatchPatterns: [
      "policy", "permission", "acl", "role", "guard",
      "middleware", "authorize", "rbac", "abac", "access-control",
      "can-access", "is-allowed",
    ],
    contentMatchPatterns: [
      "permission", "role",
      "deleteuser", "updateuser", "getuser", "createuser",
      "deleteaccount", "updateaccount", "getaccount",
      "/delete-user", "/update-user", "/delete-account", "/update-account",
      "userservice.", "accountservice."
    ],
    checkpointIds: ["SEC-AUTHZ-001"],
  },
  {
    name: "Input Validation",
    fileMatchPatterns: [
      "validator", "validation", "sanitize", "sanitizer",
      "schema", "zod", "joi", "yup", "ajv",
      "form", "input", "parser", "deserializ",
    ],
    contentMatchPatterns: [
      "select ", "select * from", "insert into", "update ", "delete from", "db.query", "db.execute"
    ],
    checkpointIds: ["SEC-INPUT-001"],
  },
  {
    name: "Secrets Management",
    fileMatchPatterns: [
      ".env", "secret", "credential", "apikey", "api_key",
      "api-key", "private_key", "private-key", "token",
      "vault", "keystore", "keyring",
    ],
    contentMatchPatterns: [
      "secret", "token", "apikey"
    ],
    checkpointIds: ["SEC-SECRET-001"],
  },
  {
    name: "Session & JWT",
    fileMatchPatterns: [
      "session", "jwt", "jsonwebtoken", "cookie",
      "token", "refresh-token", "access-token",
      "csrf", "xsrf",
    ],
    contentMatchPatterns: [
      "jwt.sign", "jwt.verify", "jsonwebtoken", "session"
    ],
    checkpointIds: ["SEC-SESSION-001"],
  },
  {
    name: "Cryptography",
    fileMatchPatterns: [
      "crypto", "encrypt", "decrypt", "hash", "cipher",
      "hmac", "bcrypt", "scrypt", "argon", "pbkdf",
      "aes", "rsa", "tls", "ssl", "certificate",
      "x509", "pem", "pkcs",
    ],
    contentMatchPatterns: [
      "crypto", "encrypt", "hash", "aes", "rsa"
    ],
    checkpointIds: ["SEC-CRYPTO-001"],
  },
  {
    name: "Security Configuration",
    fileMatchPatterns: [
      "dockerfile", "docker-compose", "nginx", "apache",
      "terraform", "kubernetes", "k8s", "helm",
      "cloudformation", "serverless", "cdk",
      "cors", "csp", "security-header", "helmet",
      ".yaml", ".yml",
    ],
    contentMatchPatterns: [
      "helmet(", "cors(", "tls.createserver", "https.createserver", "secure: true", "httponly: true", "x-frame-options", "x-xss-protection"
    ],
    checkpointIds: ["SEC-CONFIG-001"],
  },
  {
    name: "Cross-Site Scripting (XSS)",
    fileMatchPatterns: [
      ".html", ".htm", ".jsx", ".tsx", ".vue",
      ".svelte", ".ejs", ".hbs", ".handlebars",
      ".pug", ".jade", "template", "render",
      "dangerouslysetinnerhtml", "innerhtml",
    ],
    contentMatchPatterns: [
      "innerhtml", "dangerouslysetinnerhtml", "res.send(html)"
    ],
    checkpointIds: ["SEC-XSS-001"],
  },
  {
    name: "File & Path Security",
    fileMatchPatterns: [
      "upload", "download", "file", "path",
      "stream", "multer", "busboy", "formidable",
      "fs", "filesystem", "storage", "blob",
      "attachment", "media",
    ],
    contentMatchPatterns: [
      "fs.readfile", "fs.writefile", "fs.createwritestream", "multer", "upload"
    ],
    checkpointIds: ["SEC-FILE-001"],
  },
  {
    name: "Supply Chain & Dependencies",
    fileMatchPatterns: [
      "package.json", "package-lock.json", "yarn.lock",
      "pnpm-lock.yaml", "shrinkwrap",
      "requirements.txt", "pipfile", "pyproject.toml",
      "gemfile", "composer.json",
      "build.gradle", "pom.xml",
      "go.mod", "go.sum",
    ],
    contentMatchPatterns: [
      "package.json", "package-lock.json"
    ],
    checkpointIds: ["SEC-SUPPLY-001"],
  },
];
