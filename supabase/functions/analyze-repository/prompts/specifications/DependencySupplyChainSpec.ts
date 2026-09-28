import type { ReviewSpecification } from "./ReviewSpecification.ts";

export const DependencySupplyChainSpec: ReviewSpecification = {
  id: "SEC-SUPPLY-001",
  name: "Dependency & Supply Chain Security Review",
  version: "1.0",
  category: "supply-chain",

  description:
    "Determines whether third-party dependencies, packages, libraries, build artifacts, " +
    "and the software supply chain introduce security risks. Evaluates vulnerability management, " +
    "dependency integrity, trusted sources, CI/CD pipelines, and SBOM practices.",

  criteria: [
    // ────────────────────────────────────────────────────────────────
    // C1 — Vulnerable Dependencies
    // ────────────────────────────────────────────────────────────────
    {
      id: "SUPPLY-C1",
      name: "Vulnerable Dependencies",
      description:
        "Dependencies must not contain known security vulnerabilities. Detect references to " +
        "vulnerable package versions where explicit evidence is provided in the context.\n\n" +
        "PASS: Packages are updated, and no explicit vulnerability warnings exist in the context.\n" +
        "FAIL: The context explicitly shows a package is vulnerable (e.g., via an audit report snippet, " +
        "a comment indicating a known CVE, or an explicit downgrade to a known vulnerable version).\n" +
        "NOT_VERIFIED: Package manifests exist, but there is no explicit evidence or audit tool output " +
        "provided in the context to determine if they are vulnerable.",
    },

    // ────────────────────────────────────────────────────────────────
    // C2 — Dependency Integrity
    // ────────────────────────────────────────────────────────────────
    {
      id: "SUPPLY-C2",
      name: "Dependency Integrity",
      description:
        "Dependencies must be installed and verified securely to prevent tampering. This includes " +
        "using lock files, checksum verification, and immutable dependency resolution.\n\n" +
        "PASS: Lock files (e.g., `package-lock.json`, `yarn.lock`) are checked into version control, " +
        "and checksum/hash verifications are enforced.\n" +
        "FAIL: Lock files are explicitly ignored (e.g., added to `.gitignore`), checksum validations " +
        "are disabled (e.g., `strict-ssl=false`), or packages are fetched immutably without hashes.\n" +
        "NOT_VERIFIED: No package manifests or lock files are present in the provided context.",
    },

    // ────────────────────────────────────────────────────────────────
    // C3 — Dependency Trust
    // ────────────────────────────────────────────────────────────────
    {
      id: "SUPPLY-C3",
      name: "Dependency Trust",
      description:
        "Dependencies must originate from trusted and appropriate sources. Detect use of untrusted " +
        "repositories, unknown package sources, arbitrary Git URLs, or unofficial mirrors.\n\n" +
        "PASS: Dependencies are pulled from official, trusted registries (e.g., npmjs.com, Maven Central).\n" +
        "FAIL: Dependencies are pulled from arbitrary, unverified Git repositories (e.g., " +
        "`\"my-pkg\": \"git+https://unknown-source.com/repo.git\"`), HTTP mirrors, or untrusted registries.\n" +
        "NOT_VERIFIED: Package sources are not specified or configured in the available context.",
    },

    // ────────────────────────────────────────────────────────────────
    // C4 — Build & CI/CD Security
    // ────────────────────────────────────────────────────────────────
    {
      id: "SUPPLY-C4",
      name: "Build & CI/CD Security",
      description:
        "Build pipelines and CI/CD workflows must securely manage dependencies and artifacts. " +
        "Detect insecure configurations such as unpinned GitHub Actions, downloading unsigned artifacts, " +
        "or executing remote scripts without verification.\n\n" +
        "PASS: CI/CD actions are pinned to specific commit SHAs (e.g., `actions/checkout@a5ac...`), " +
        "and downloaded artifacts are verified via cryptographic hashes before execution.\n" +
        "FAIL: Workflows use unpinned mutable tags (`@main`, `@master`, `@v1`), or execute remote " +
        "scripts blindly (`curl -sL https://example.com/install.sh | bash`).\n" +
        "NOT_VERIFIED: No CI/CD workflows, build scripts, or Dockerfiles are present in the context.",
    },

    // ────────────────────────────────────────────────────────────────
    // C5 — Dependency Exposure
    // ────────────────────────────────────────────────────────────────
    {
      id: "SUPPLY-C5",
      name: "Dependency Exposure",
      description:
        "Development, test, and debugging dependencies must not be unintentionally shipped " +
        "into production builds, reducing the production attack surface.\n\n" +
        "PASS: Development tools (e.g., `nodemon`, `jest`, `webpack`) are strictly kept in `devDependencies`.\n" +
        "FAIL: Heavy development tools or testing frameworks are added to the production `dependencies` list " +
        "or explicitly bundled into the final production container.\n" +
        "NOT_VERIFIED: The provided context does not distinguish between development and production builds.",
    },

    // ────────────────────────────────────────────────────────────────
    // C6 — SBOM & Dependency Management
    // ────────────────────────────────────────────────────────────────
    {
      id: "SUPPLY-C6",
      name: "Software Bill of Materials (SBOM) & Management",
      description:
        "Dependency inventory and update practices must be maintained. Detect configurations for SBOM " +
        "generation, dependency monitoring, and automated security updates.\n\n" +
        "PASS: Tools like Dependabot, Renovate, or SBOM generators (e.g., Syft, CycloneDX) are configured.\n" +
        "FAIL: Automated update mechanisms (like Dependabot) are explicitly removed or disabled without a replacement.\n" +
        "NOT_VERIFIED: No evidence of dependency management tooling configuration exists in the context.",
    },
  ],

  promptInstruction:
    "Focus your analysis on the changed files. For each criterion, determine " +
    "whether the code introduces, modifies, or fails to address the supply chain concern.\n\n" +

    "### Finding Requirements\n\n" +
    "Every finding MUST include:\n" +
    "1. **criterionId** — The exact criterion ID (SUPPLY-C1 through SUPPLY-C6) this finding relates to.\n" +
    "2. **evidence** — At least one evidence entry with the exact file path, line number, " +
    "and code snippet from the provided context. Never fabricate evidence.\n" +
    "3. **risk** — A clear description of the security risk (e.g., 'Executing a remote script directly " +
    "via curl | bash allows arbitrary code execution if the remote server is compromised').\n" +
    "4. **remediation** — A concrete, implementable fix.\n\n" +

    "### Verdict Assignment Rules\n\n" +
    "- Report each distinct issue as a separate finding.\n" +
    "- **STRICT RULE ON VULNERABILITIES (SUPPLY-C1):** Only report vulnerable dependencies when **explicit evidence exists within the provided review context** (e.g., an audit log snippet, a code comment explicitly stating a CVE, or an explicit downgrade context). Do **NOT** rely on your model knowledge or memory of public CVEs (e.g., do not flag Log4j 2.14 as vulnerable unless the context explicitly indicates it is vulnerable). If no explicit evidence is present, return NOT_VERIFIED for SUPPLY-C1.\n" +
    "- Executing remote scripts without verification (`curl | bash` or `wget -O- | sh`) (SUPPLY-C4) is a **FAIL** and a critical vulnerability.\n" +
    "- Using unpinned mutable tags (`@main`, `@master`) for GitHub Actions (SUPPLY-C4) is a **FAIL**.\n" +
    "- Explicitly ignoring or disabling lockfiles (SUPPLY-C2) is a **FAIL**.\n" +
    "- If the PR only modifies non-build code (e.g., `README.md`, `src/utils.js`) and no package manifests or CI/CD files are provided, return **NOT_VERIFIED** for all criteria.",
};
