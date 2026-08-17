import type { EvalDataset } from "../types.ts";

export const SecurityConfigurationEvalDataset: EvalDataset = {
  checkpointId: "SEC-CONFIG-001",
  version: "1.0",
  scenarios: [
    // ═══════════════════════════════════════════════════════════════════
    // CONFIG-C1: Security Headers
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "CONFIG-FAIL-01",
      description: "Disabling essential security headers in Helmet",
      tags: ["headers", "helmet", "insecure-config"],
      criteriaTargeted: ["CONFIG-C1"],
      changedFiles: [
        {
          path: "src/app.ts",
          content: `
import express from 'express';
import helmet from 'helmet';

const app = express();

// Explicitly disabling important security headers
app.use(helmet({
  contentSecurityPolicy: false,
  xFrameOptions: false,
  hsts: false
}));
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "CONFIG-C1",
          expectedEvidence: [{ file: "src/app.ts", snippetSubstr: "contentSecurityPolicy: false" }]
        }
      ],
      rationale: "Explicitly disabling CSP, X-Frame-Options (Clickjacking protection), and HSTS significantly weakens the application's security posture."
    },
    {
      id: "CONFIG-FAIL-02",
      description: "Insecure Content Security Policy (unsafe-inline / unsafe-eval)",
      tags: ["headers", "csp", "xss"],
      criteriaTargeted: ["CONFIG-C1"],
      changedFiles: [
        {
          path: "src/app.ts",
          content: `
import express from 'express';
const app = express();

app.use((req, res, next) => {
  // Extremely permissive CSP defeats the purpose of the header
  res.setHeader("Content-Security-Policy", "default-src * 'unsafe-inline' 'unsafe-eval'");
  next();
});
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "CONFIG-C1",
          expectedEvidence: [{ file: "src/app.ts", snippetSubstr: "'unsafe-inline' 'unsafe-eval'" }]
        }
      ],
      rationale: "Using 'unsafe-inline' and 'unsafe-eval' allows XSS attacks to execute freely, rendering the CSP mostly useless."
    },
    {
      id: "CONFIG-PASS-01",
      description: "Securely configuring Helmet middleware",
      tags: ["secure", "headers", "helmet"],
      criteriaTargeted: ["CONFIG-C1"],
      changedFiles: [
        {
          path: "src/app.ts",
          content: `
import express from 'express';
import helmet from 'helmet';

const app = express();

// Uses robust default secure headers
app.use(helmet());
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Helmet securely sets HSTS, X-Frame-Options, X-Content-Type-Options, and other essential headers out of the box."
    },
    {
      id: "CONFIG-NV-01",
      description: "Headers managed by reverse proxy",
      tags: ["headers", "missing-context", "reverse-proxy"],
      criteriaTargeted: ["CONFIG-C1"],
      changedFiles: [
        {
          path: "src/app.ts",
          content: `
import express from 'express';
const app = express();

// Application doesn't set security headers because they are applied globally via Nginx
app.get('/api/data', (req, res) => res.json({ ok: true }));
`.trim()
        }
      ],
      expectedVerdict: "NOT_VERIFIED",
      rationale: "In modern cloud deployments, security headers are often injected by edge routers, CDNs, or API Gateways rather than the application code itself."
    },

    // ═══════════════════════════════════════════════════════════════════
    // CONFIG-C2: CORS Configuration
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "CONFIG-FAIL-03",
      description: "Wildcard CORS on API routes",
      tags: ["cors", "wildcard"],
      criteriaTargeted: ["CONFIG-C2"],
      changedFiles: [
        {
          path: "src/app.ts",
          content: `
import cors from 'cors';
import express from 'express';

const app = express();
// Allows any origin to read responses
app.use(cors({ origin: '*' })); 
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "CONFIG-C2",
          expectedEvidence: [{ file: "src/app.ts", snippetSubstr: "origin: '*'" }]
        }
      ],
      rationale: "Wildcard CORS exposes API endpoints to cross-origin reads from any malicious website."
    },
    {
      id: "CONFIG-FAIL-04",
      description: "Wildcard CORS with Credentials enabled",
      tags: ["cors", "wildcard", "credentials", "critical"],
      criteriaTargeted: ["CONFIG-C2"],
      changedFiles: [
        {
          path: "src/middleware/cors.ts",
          content: `
export function corsMiddleware(req, res, next) {
  // Dangerously reflects the Origin header dynamically, effectively allowing '*' with credentials
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  next();
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "CONFIG-C2",
          expectedEvidence: [{ file: "src/middleware/cors.ts", snippetSubstr: "req.headers.origin || '*'" }]
        }
      ],
      rationale: "Reflecting the Origin header combined with Access-Control-Allow-Credentials allows any site to perform authenticated requests (CSRF) and read the responses."
    },
    {
      id: "CONFIG-FAIL-05",
      description: "Insecure Regex for CORS origin matching",
      tags: ["cors", "regex", "bypass"],
      criteriaTargeted: ["CONFIG-C2"],
      changedFiles: [
        {
          path: "src/app.ts",
          content: `
import cors from 'cors';

const app = express();

// Flawed regex: misses the escape on the dot, and lacks ^ or $ anchors
// Allows origins like "https://myappXcom.malicious.com"
const corsOptions = {
  origin: /https:\/\/myapp.com/
};
app.use(cors(corsOptions));
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "CONFIG-C2",
          expectedEvidence: [{ file: "src/app.ts", snippetSubstr: "/https:\\/\\/myapp.com/" }]
        }
      ],
      rationale: "Improperly anchored regular expressions in CORS configurations can be bypassed by attackers crafting specific subdomains or domains."
    },
    {
      id: "CONFIG-PASS-02",
      description: "Strict CORS allowlist configuration",
      tags: ["secure", "cors", "allowlist"],
      criteriaTargeted: ["CONFIG-C2"],
      changedFiles: [
        {
          path: "src/app.ts",
          content: `
import cors from 'cors';

const allowedOrigins = ['https://www.myapp.com', 'https://admin.myapp.com'];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};
app.use(cors(corsOptions));
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Strictly compares the origin against a hardcoded array of trusted domains."
    },

    // ═══════════════════════════════════════════════════════════════════
    // CONFIG-C3: HTTPS Enforcement
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "CONFIG-FAIL-06",
      description: "Forcing insecure redirects",
      tags: ["https", "redirect", "insecure-config"],
      criteriaTargeted: ["CONFIG-C3"],
      changedFiles: [
        {
          path: "src/controllers/auth.ts",
          content: `
export function loginRedirect(req, res) {
  // Forcing redirect to unencrypted HTTP
  res.redirect('http://app.internal.corp/dashboard');
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "CONFIG-C3",
          expectedEvidence: [{ file: "src/controllers/auth.ts", snippetSubstr: "http://app.internal.corp" }]
        }
      ],
      rationale: "Sensitive traffic and authenticated sessions must always be redirected over HTTPS."
    },
    {
      id: "CONFIG-PASS-03",
      description: "Enforcing HTTPS via middleware",
      tags: ["secure", "https", "middleware"],
      criteriaTargeted: ["CONFIG-C3"],
      changedFiles: [
        {
          path: "src/middleware/tls.ts",
          content: `
export function requireHttps(req, res, next) {
  if (req.headers['x-forwarded-proto'] !== 'https' && process.env.NODE_ENV === 'production') {
    return res.redirect(301, \`https://\${req.hostname}\${req.url}\`);
  }
  next();
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Middleware securely detects HTTP traffic from the load balancer and forces a redirect to HTTPS."
    },
    {
      id: "CONFIG-NV-02",
      description: "HTTPS enforcement handled by AWS ALB (missing context)",
      tags: ["https", "missing-context", "alb"],
      criteriaTargeted: ["CONFIG-C3"],
      changedFiles: [
        {
          path: "src/app.ts",
          content: `
import express from 'express';
const app = express();
// No HTTPS redirect logic exists here
app.listen(8080);
`.trim()
        }
      ],
      expectedVerdict: "NOT_VERIFIED",
      rationale: "Application code often runs on HTTP behind an API Gateway or Load Balancer that terminates TLS and enforces HTTPS."
    },

    // ═══════════════════════════════════════════════════════════════════
    // CONFIG-C4: Debug & Development Configuration
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "CONFIG-FAIL-07",
      description: "Returning stack traces to clients in production",
      tags: ["debug", "stack-trace", "exposure"],
      criteriaTargeted: ["CONFIG-C4"],
      changedFiles: [
        {
          path: "src/app.ts",
          content: `
// Global error handler
app.use((err, req, res, next) => {
  // Exposes internal file paths and library versions to attackers
  res.status(500).json({ error: err.message, stack: err.stack });
});
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "CONFIG-C4",
          expectedEvidence: [{ file: "src/app.ts", snippetSubstr: "stack: err.stack" }]
        }
      ],
      rationale: "Stack traces should never be returned to the client in production as they leak internal architecture details."
    },
    {
      id: "CONFIG-FAIL-08",
      description: "Exposing debug/diagnostic endpoints",
      tags: ["debug", "endpoints", "exposure"],
      criteriaTargeted: ["CONFIG-C4"],
      changedFiles: [
        {
          path: "src/routes/api.ts",
          content: `
// Diagnostic endpoint exposed without authentication or environment checks
router.get('/api/debug/env', (req, res) => {
  res.json(process.env);
});
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "CONFIG-C4",
          expectedEvidence: [{ file: "src/routes/api.ts", snippetSubstr: "/api/debug/env" }]
        }
      ],
      rationale: "Debug endpoints must be strictly disabled in production or heavily authenticated/restricted to internal networks."
    },
    {
      id: "CONFIG-PASS-04",
      description: "Safe production error handling",
      tags: ["secure", "error-handling", "production"],
      criteriaTargeted: ["CONFIG-C4"],
      changedFiles: [
        {
          path: "src/app.ts",
          content: `
app.use((err, req, res, next) => {
  console.error(err); // Log securely to internal systems
  
  // Mask details from the client
  res.status(500).json({ 
    error: "Internal Server Error",
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined 
  });
});
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Strictly masks stack traces in production while retaining them for local development."
    },

    // ═══════════════════════════════════════════════════════════════════
    // CONFIG-C5: Secure Framework Configuration
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "CONFIG-FAIL-09",
      description: "Explicitly disabling CSRF protection",
      tags: ["framework", "csrf", "disabled"],
      criteriaTargeted: ["CONFIG-C5"],
      changedFiles: [
        {
          path: "src/config/security.ts",
          content: `
import { csrfSync } from 'csrf-sync';

// Disabling CSRF protection on a stateful, cookie-based application
export const { csrfSynchronisedProtection } = csrfSync({
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'DELETE'], // Ignores everything
});
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "CONFIG-C5",
          expectedEvidence: [{ file: "src/config/security.ts", snippetSubstr: "ignoredMethods: ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'DELETE']" }]
        }
      ],
      rationale: "Disabling CSRF protections globally on stateful applications exposes endpoints to Cross-Site Request Forgery attacks."
    },
    {
      id: "CONFIG-FAIL-10",
      description: "Extremely large request body limits",
      tags: ["framework", "body-parser", "dos"],
      criteriaTargeted: ["CONFIG-C5"],
      changedFiles: [
        {
          path: "src/app.ts",
          content: `
import express from 'express';
const app = express();

// 5 Gigabytes limit for JSON payloads!
app.use(express.json({ limit: '5000mb' }));
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "CONFIG-C5",
          expectedEvidence: [{ file: "src/app.ts", snippetSubstr: "limit: '5000mb'" }]
        }
      ],
      rationale: "Configuring framework body parsers with excessively large limits exposes the application to memory exhaustion DoS attacks."
    },
    {
      id: "CONFIG-PASS-05",
      description: "Appropriate request size limits configured",
      tags: ["secure", "framework", "body-parser"],
      criteriaTargeted: ["CONFIG-C5"],
      changedFiles: [
        {
          path: "src/app.ts",
          content: `
import express from 'express';
const app = express();

// Strict payload limits
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Framework parsers are configured with tight size limits to mitigate DoS risks."
    },

    // ═══════════════════════════════════════════════════════════════════
    // CONFIG-C6: Default Secure Configuration
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "CONFIG-FAIL-11",
      description: "Binding server to all interfaces (0.0.0.0) unnecessarily",
      tags: ["defaults", "network", "binding"],
      criteriaTargeted: ["CONFIG-C6"],
      changedFiles: [
        {
          path: "src/admin.ts",
          content: `
import express from 'express';
const adminApp = express();

// Binding internal admin panel to 0.0.0.0 exposes it to the public internet
adminApp.listen(9090, '0.0.0.0', () => console.log('Admin running'));
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "CONFIG-C6",
          expectedEvidence: [{ file: "src/admin.ts", snippetSubstr: "'0.0.0.0'" }]
        }
      ],
      rationale: "Internal administration services should bind to localhost (127.0.0.1) or strict internal network interfaces, not 0.0.0.0."
    },
    {
      id: "CONFIG-FAIL-12",
      description: "Insecure feature flag default (Enhancement)",
      tags: ["defaults", "feature-flags", "insecure-config"],
      criteriaTargeted: ["CONFIG-C6"],
      changedFiles: [
        {
          path: "src/config/features.ts",
          content: `
export const features = {
  // Bypasses 2FA by default for all users unless explicitly turned off
  bypassTwoFactor: process.env.BYPASS_2FA === 'false' ? false : true,
  
  // Enables experimental unvetted API by default
  enableExperimentalApi: process.env.ENABLE_EXP !== 'false'
};
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "CONFIG-C6",
          expectedEvidence: [{ file: "src/config/features.ts", snippetSubstr: "process.env.BYPASS_2FA === 'false' ? false : true" }]
        }
      ],
      rationale: "Security-sensitive feature flags (like 2FA bypasses or experimental APIs) must default to a secure, restrictive state (false) if the environment variable is missing."
    },
    {
      id: "CONFIG-PASS-06",
      description: "Secure feature flag defaults (Enhancement)",
      tags: ["secure", "defaults", "feature-flags"],
      criteriaTargeted: ["CONFIG-C6"],
      changedFiles: [
        {
          path: "src/config/features.ts",
          content: `
export const features = {
  // Fails closed: defaults to false unless explicitly enabled
  bypassTwoFactor: process.env.BYPASS_2FA === 'true',
  enableExperimentalApi: process.env.ENABLE_EXP === 'true'
};
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Feature flags are configured to 'fail closed', meaning security protections are active by default."
    },

    // ═══════════════════════════════════════════════════════════════════
    // Cross-Cutting Scenarios
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "CONFIG-PASS-07",
      description: "Perfectly configured Express app",
      tags: ["comprehensive", "secure"],
      criteriaTargeted: ["CONFIG-C1", "CONFIG-C2", "CONFIG-C4", "CONFIG-C5"],
      changedFiles: [
        {
          path: "src/app.ts",
          content: `
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

const app = express();

app.use(helmet());
app.use(cors({ origin: ['https://myapp.com'] }));
app.use(express.json({ limit: '100kb' }));

app.use((err, req, res, next) => {
  res.status(500).json({ error: "Internal Server Error" });
});
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Configures secure headers, strict CORS, request limits, and masks errors."
    },
    {
      id: "CONFIG-NV-03",
      description: "Documentation updates only",
      tags: ["unrelated", "docs"],
      criteriaTargeted: [],
      changedFiles: [
        {
          path: "docs/deployment.md",
          content: `
# Deployment
Run \`npm start\` behind Nginx.
`.trim()
        }
      ],
      expectedVerdict: "NOT_VERIFIED",
      rationale: "No configuration code is present."
    }
  ]
};
