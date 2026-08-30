import type { EvalDataset } from "../types.ts";

export const DependencySupplyChainEvalDataset: EvalDataset = {
  checkpointId: "SEC-SUPPLY-001",
  version: "1.0",
  scenarios: [
    // ═══════════════════════════════════════════════════════════════════
    // SUPPLY-C1: Vulnerable Dependencies
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "SUPPLY-FAIL-01",
      description: "Explicit downgrade to a vulnerable version with a comment",
      tags: ["dependency", "vulnerable", "downgrade", "evidence"],
      criteriaTargeted: ["SUPPLY-C1"],
      changedFiles: [
        {
          path: "package.json",
          content: `
{
  "dependencies": {
    "lodash": "4.17.15" // Downgraded due to build break, known CVE-2020-8203 but we accept the risk
  }
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SUPPLY-C1",
          expectedEvidence: [{ file: "package.json", snippetSubstr: "known CVE-2020-8203" }]
        }
      ],
      rationale: "The context provides explicit evidence (a developer comment) that the dependency is known to be vulnerable. The AI must flag this based on the evidence."
    },
    {
      id: "SUPPLY-FAIL-02",
      description: "Vulnerability reported in included audit output",
      tags: ["dependency", "vulnerable", "audit-report"],
      criteriaTargeted: ["SUPPLY-C1"],
      changedFiles: [
        {
          path: "package.json",
          content: `
{
  "dependencies": {
    "express": "4.17.1"
  }
}
`.trim()
        },
        {
          path: "npm-audit-report.json",
          content: `
{
  "advisories": {
    "123": {
      "title": "Prototype Pollution in express",
      "module_name": "express",
      "vulnerable_versions": "<=4.17.1",
      "severity": "high"
    }
  }
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SUPPLY-C1",
          expectedEvidence: [{ file: "npm-audit-report.json", snippetSubstr: "Prototype Pollution in express" }]
        }
      ],
      rationale: "The explicit inclusion of an audit report showing a vulnerability provides the necessary evidence to flag the dependency."
    },
    {
      id: "SUPPLY-PASS-01",
      description: "Secure dependency upgrade resolving known issues",
      tags: ["secure", "dependency", "upgrade"],
      criteriaTargeted: ["SUPPLY-C1"],
      changedFiles: [
        {
          path: "package.json",
          content: `
{
  "dependencies": {
    "lodash": "^4.17.21" // Upgraded to fix prototype pollution
  }
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "The developer explicitly upgraded the package to fix a known issue."
    },
    {
      id: "SUPPLY-NV-01",
      description: "Known CVE package without explicit evidence in context",
      tags: ["missing-context", "dependency", "no-evidence"],
      criteriaTargeted: ["SUPPLY-C1"],
      changedFiles: [
        {
          path: "package.json",
          content: `
{
  "dependencies": {
    "log4j": "2.14.0"
  }
}
`.trim()
        }
      ],
      expectedVerdict: "NOT_VERIFIED",
      rationale: "Although Log4j 2.14.0 is globally known to be vulnerable to Log4Shell, the STRICT RULE dictates that the AI must not rely on memory or hallucinate CVEs. Because there is no explicit evidence of vulnerability in the provided files, it must return NOT_VERIFIED."
    },

    // ═══════════════════════════════════════════════════════════════════
    // SUPPLY-C2: Dependency Integrity
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "SUPPLY-FAIL-03",
      description: "Explicitly ignoring package-lock.json",
      tags: ["integrity", "lockfile", "ignored"],
      criteriaTargeted: ["SUPPLY-C2"],
      changedFiles: [
        {
          path: ".gitignore",
          content: `
node_modules/
# Ignoring lock files leads to non-deterministic, insecure builds
package-lock.json
yarn.lock
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SUPPLY-C2",
          expectedEvidence: [{ file: ".gitignore", snippetSubstr: "package-lock.json" }]
        }
      ],
      rationale: "Lock files enforce dependency integrity via cryptographic checksums and ensure deterministic builds. Ignoring them allows transitive dependency hijacking."
    },
    {
      id: "SUPPLY-FAIL-04",
      description: "Disabling strict SSL during dependency fetch",
      tags: ["integrity", "ssl", "disabled"],
      criteriaTargeted: ["SUPPLY-C2", "SUPPLY-C6"],
      changedFiles: [
        {
          path: ".npmrc",
          content: `
# Insecure configuration allowing MITM attacks during package download
strict-ssl=false
registry=http://registry.npmjs.org/
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SUPPLY-C2",
          expectedEvidence: [{ file: ".npmrc", snippetSubstr: "strict-ssl=false" }]
        }
      ],
      rationale: "Disabling SSL verification allows attackers to intercept and replace downloaded packages (MITM)."
    },
    {
      id: "SUPPLY-PASS-02",
      description: "Enforcing immutable dependencies in CI",
      tags: ["secure", "integrity", "ci", "immutable"],
      criteriaTargeted: ["SUPPLY-C2", "SUPPLY-C4"],
      changedFiles: [
        {
          path: ".github/workflows/build.yml",
          content: `
steps:
  - uses: actions/checkout@v3
  - name: Install dependencies
    # npm ci enforces the lockfile and verifies integrity hashes
    run: npm ci
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Using `npm ci` ensures that the CI pipeline respects the lock file and its cryptographic hashes, providing immutable resolution."
    },

    // ═══════════════════════════════════════════════════════════════════
    // SUPPLY-C3: Dependency Trust
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "SUPPLY-FAIL-05",
      description: "Pulling a dependency from an untrusted Git URL",
      tags: ["trust", "git-url", "untrusted"],
      criteriaTargeted: ["SUPPLY-C3"],
      changedFiles: [
        {
          path: "package.json",
          content: `
{
  "dependencies": {
    "express": "4.18.2",
    "helper-lib": "git+https://unknown-random-source.com/repo.git#master"
  }
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SUPPLY-C3",
          expectedEvidence: [{ file: "package.json", snippetSubstr: "git+https://unknown-random-source.com/repo.git" }]
        }
      ],
      rationale: "Pulling dependencies from arbitrary, untrusted Git URLs bypasses package registry protections and allows the host to serve malicious code."
    },
    {
      id: "SUPPLY-FAIL-06",
      description: "Using an HTTP-only unofficial mirror",
      tags: ["trust", "mirror", "http"],
      criteriaTargeted: ["SUPPLY-C3", "SUPPLY-C2"],
      changedFiles: [
        {
          path: "build.gradle",
          content: `
repositories {
    // VULNERABLE: Using unencrypted HTTP and an unofficial mirror
    maven { url 'http://maven.unofficial-mirror.org/repo' }
}
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-web:2.7.5'
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SUPPLY-C3",
          expectedEvidence: [{ file: "build.gradle", snippetSubstr: "http://maven.unofficial-mirror.org/repo" }]
        }
      ],
      rationale: "Unofficial mirrors can serve tampered packages. HTTP allows MITM attackers to modify the binaries in transit."
    },
    {
      id: "SUPPLY-PASS-03",
      description: "Using official trusted registries",
      tags: ["secure", "trust", "registry"],
      criteriaTargeted: ["SUPPLY-C3"],
      changedFiles: [
        {
          path: "pom.xml",
          content: `
<repositories>
    <repository>
        <id>central</id>
        <url>https://repo.maven.apache.org/maven2</url>
    </repository>
</repositories>
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Fetching from official, HTTPS-secured central registries ensures a baseline level of trust."
    },

    // ═══════════════════════════════════════════════════════════════════
    // SUPPLY-C4: Build & CI/CD Security
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "SUPPLY-FAIL-07",
      description: "Executing remote script without verification (curl | bash)",
      tags: ["ci-cd", "curl-bash", "remote-execution"],
      criteriaTargeted: ["SUPPLY-C4"],
      changedFiles: [
        {
          path: "Dockerfile",
          content: `
FROM ubuntu:22.04
# CRITICAL VULNERABILITY: Blindly executing a remote script
RUN curl -sL https://install.meteor.com/ | sh
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SUPPLY-C4",
          expectedEvidence: [{ file: "Dockerfile", snippetSubstr: "curl -sL https://install.meteor.com/ | sh" }]
        }
      ],
      rationale: "Piping a remote script directly to a shell allows complete system compromise if the remote server is breached or the connection is intercepted."
    },
    {
      id: "SUPPLY-FAIL-08",
      description: "Unpinned GitHub Action using @main",
      tags: ["ci-cd", "github-actions", "unpinned"],
      criteriaTargeted: ["SUPPLY-C4"],
      changedFiles: [
        {
          path: ".github/workflows/deploy.yml",
          content: `
steps:
  - uses: actions/checkout@v3
  # VULNERABLE: Branch references are mutable. If the author pushes malicious code to main, it runs immediately here.
  - uses: third-party/deploy-action@main
    with:
      token: \${{ secrets.DEPLOY_TOKEN }}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SUPPLY-C4",
          expectedEvidence: [{ file: ".github/workflows/deploy.yml", snippetSubstr: "@main" }]
        }
      ],
      rationale: "Mutable tags like @main or @v1 can be changed at any time by the action owner. Pinning to a specific commit SHA guarantees immutability."
    },
    {
      id: "SUPPLY-PASS-04",
      description: "Pinned GitHub Actions to commit SHA",
      tags: ["secure", "ci-cd", "github-actions", "pinned"],
      criteriaTargeted: ["SUPPLY-C4"],
      changedFiles: [
        {
          path: ".github/workflows/deploy.yml",
          content: `
steps:
  - uses: actions/checkout@v3
  # SAFE: Pinned to a specific, immutable commit SHA
  - uses: third-party/deploy-action@a5ac7e51b41094c92402da3b24376905380afc29
    with:
      token: \${{ secrets.DEPLOY_TOKEN }}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Pinning to a full commit SHA ensures the CI pipeline always runs the exact, reviewed version of the action, even if the tag is moved."
    },
    {
      id: "SUPPLY-PASS-05",
      description: "Verified artifact download with checksums",
      tags: ["secure", "ci-cd", "artifact-verification"],
      criteriaTargeted: ["SUPPLY-C4"],
      changedFiles: [
        {
          path: "install.sh",
          content: `
#!/bin/bash
wget https://example.com/binary.tar.gz
# SAFE: Verifying cryptographic hash before extraction
echo "d3b07384d113edec49eaa6238ad5ff00  binary.tar.gz" | md5sum -c -
if [ $? -eq 0 ]; then
  tar -xzf binary.tar.gz
else
  echo "Checksum verification failed!"
  exit 1
fi
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Verifying the downloaded artifact against a known good hash prevents the execution of tampered binaries."
    },

    // ═══════════════════════════════════════════════════════════════════
    // SUPPLY-C5: Dependency Exposure
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "SUPPLY-FAIL-09",
      description: "Development tools included in production dependencies",
      tags: ["exposure", "dependencies", "dev-tools"],
      criteriaTargeted: ["SUPPLY-C5"],
      changedFiles: [
        {
          path: "package.json",
          content: `
{
  "dependencies": {
    "express": "4.18.2",
    "nodemon": "^2.0.22",
    "jest": "^29.5.0"
  },
  "devDependencies": {
    "typescript": "^5.0.4"
  }
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SUPPLY-C5",
          expectedEvidence: [{ file: "package.json", snippetSubstr: "\"nodemon\":" }]
        }
      ],
      rationale: "Including dev tools like nodemon or jest in the production `dependencies` block unnecessarily increases the attack surface and image size of the production environment."
    },
    {
      id: "SUPPLY-FAIL-10",
      description: "Bundling source maps and dev tools in Docker production image",
      tags: ["exposure", "docker", "production"],
      criteriaTargeted: ["SUPPLY-C5"],
      changedFiles: [
        {
          path: "Dockerfile",
          content: `
FROM node:18-alpine
WORKDIR /app
COPY package.json .
# VULNERABLE: Omits --production or --omit=dev, installing all devDependencies in the final image
RUN npm install
COPY . .
CMD ["node", "dist/app.js"]
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SUPPLY-C5",
          expectedEvidence: [{ file: "Dockerfile", snippetSubstr: "RUN npm install" }]
        }
      ],
      rationale: "Production Docker images should only contain necessary runtime dependencies. Failing to use `npm ci --production` exposes dev dependencies in the runtime container."
    },
    {
      id: "SUPPLY-PASS-06",
      description: "Clean separation of dev dependencies",
      tags: ["secure", "exposure", "dependencies"],
      criteriaTargeted: ["SUPPLY-C5"],
      changedFiles: [
        {
          path: "package.json",
          content: `
{
  "dependencies": {
    "express": "4.18.2"
  },
  "devDependencies": {
    "nodemon": "^2.0.22",
    "jest": "^29.5.0",
    "typescript": "^5.0.4"
  }
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Development dependencies are correctly isolated in the `devDependencies` block, preventing them from being installed in a strictly production build."
    },

    // ═══════════════════════════════════════════════════════════════════
    // SUPPLY-C6: SBOM & Dependency Management
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "SUPPLY-FAIL-11",
      description: "Disabling automated dependency updates",
      tags: ["management", "dependabot", "disabled"],
      criteriaTargeted: ["SUPPLY-C6"],
      changedFiles: [
        {
          path: ".github/dependabot.yml",
          content: `
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "daily"
    # VULNERABLE: Explicitly ignoring security updates
    open-pull-requests-limit: 0
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SUPPLY-C6",
          expectedEvidence: [{ file: ".github/dependabot.yml", snippetSubstr: "open-pull-requests-limit: 0" }]
        }
      ],
      rationale: "Setting the pull request limit to 0 effectively disables automated security updates, preventing the repository from receiving automated patches."
    },
    {
      id: "SUPPLY-PASS-07",
      description: "Dependabot configuration present",
      tags: ["secure", "management", "dependabot"],
      criteriaTargeted: ["SUPPLY-C6"],
      changedFiles: [
        {
          path: ".github/dependabot.yml",
          content: `
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Actively configuring automated dependency updates demonstrates strong supply chain hygiene."
    },
    {
      id: "SUPPLY-PASS-08",
      description: "SBOM generation configured in CI",
      tags: ["secure", "management", "sbom"],
      criteriaTargeted: ["SUPPLY-C6"],
      changedFiles: [
        {
          path: ".github/workflows/sbom.yml",
          content: `
steps:
  - uses: actions/checkout@v3
  - name: Generate SBOM
    # Uses syft to generate a Software Bill of Materials
    run: curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b /usr/local/bin
    # Note: Syft installation script is highly trusted, but in a strictly secure environment, downloading it directly is a C4 risk. 
    # However, this scenario tests C6 (SBOM existence).
  - run: syft packages dir:. -o cyclonedx-json > sbom.json
`.trim()
        }
      ],
      expectedVerdict: "PASS", // For C6
      rationale: "The repository actively generates a Software Bill of Materials (SBOM), satisfying C6."
    },

    // ═══════════════════════════════════════════════════════════════════
    // Cross-Cutting Scenarios
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "SUPPLY-NV-02",
      description: "PR modifies application logic, no supply chain files present",
      tags: ["missing-context", "app-logic"],
      criteriaTargeted: [],
      changedFiles: [
        {
          path: "src/utils/math.ts",
          content: `
export function add(a: number, b: number) {
  return a + b;
}
`.trim()
        }
      ],
      expectedVerdict: "NOT_VERIFIED",
      rationale: "There are no package manifests, CI/CD pipelines, or lock files in the provided context, making it impossible to evaluate supply chain security."
    },
    {
      id: "SUPPLY-PASS-09",
      description: "Perfectly secured pipeline and manifest",
      tags: ["comprehensive", "secure"],
      criteriaTargeted: ["SUPPLY-C2", "SUPPLY-C3", "SUPPLY-C4", "SUPPLY-C5"],
      changedFiles: [
        {
          path: "package.json",
          content: `{"dependencies": {"express": "4.18.2"}, "devDependencies": {"jest": "29.5.0"}}`
        },
        {
          path: ".github/workflows/build.yml",
          content: `
steps:
  - uses: actions/checkout@a5ac7e51b41094c92402da3b24376905380afc29
  - run: npm ci
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Strict separation of dev dependencies, immutable actions, and enforcement of the lockfile (`npm ci`)."
    }
  ]
};
