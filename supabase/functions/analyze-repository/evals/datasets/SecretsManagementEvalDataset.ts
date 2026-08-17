import type { EvalDataset } from "../types.ts";

export const SecretsManagementEvalDataset: EvalDataset = {
  checkpointId: "SEC-SECRET-001",
  version: "1.0",
  scenarios: [
    // ═══════════════════════════════════════════════════════════════════
    // SECRET-C1: Hardcoded Secrets
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "SECRET-FAIL-01",
      description: "Hardcoded JWT secret in source code",
      tags: ["hardcoded", "jwt", "secrets"],
      criteriaTargeted: ["SECRET-C1"],
      changedFiles: [
        {
          path: "src/auth.ts",
          content: `
import jwt from 'jsonwebtoken';

export function createToken(userId) {
  // Hardcoded secret
  return jwt.sign({ id: userId }, 'sUp3rS3cr3tK3y123!', { expiresIn: '1h' });
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SECRET-C1",
          // The expected evidence snippet MUST be redacted
          expectedEvidence: [{ file: "src/auth.ts", snippetSubstr: "'***REDACTED***'" }]
        }
      ],
      rationale: "JWT secrets must not be hardcoded in the codebase."
    },
    {
      id: "SECRET-FAIL-02",
      description: "Hardcoded AWS Access Key",
      tags: ["hardcoded", "aws", "secrets"],
      criteriaTargeted: ["SECRET-C1"],
      changedFiles: [
        {
          path: "src/s3.ts",
          content: `
import AWS from 'aws-sdk';

const s3 = new AWS.S3({
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
});

export const uploadFile = async (file) => { /* ... */ };
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SECRET-C1",
          expectedEvidence: [{ file: "src/s3.ts", snippetSubstr: "accessKeyId: '***REDACTED***'" }]
        }
      ],
      rationale: "AWS credentials should never be hardcoded. They should be loaded via IAM roles, environment variables, or credential profiles."
    },
    {
      id: "SECRET-FAIL-03",
      description: "Accidentally committed .env file",
      tags: ["hardcoded", "env", "secrets", "committed-file"],
      criteriaTargeted: ["SECRET-C1", "SECRET-C2"],
      changedFiles: [
        {
          path: ".env",
          content: `
PORT=3000
DB_HOST=localhost
DB_USER=admin
DB_PASS=P@ssw0rd123!
STRIPE_SECRET_KEY=sk_test_4eC39HqLyjWDarjtT1zdp7dc
`.trim()
        },
        {
          path: "src/server.ts",
          content: `
import 'dotenv/config';
import express from 'express';
// ...
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SECRET-C1",
          expectedEvidence: [{ file: ".env", snippetSubstr: "STRIPE_SECRET_KEY=***REDACTED***" }]
        }
      ],
      rationale: "Environment files containing secrets (.env) should be added to .gitignore and never committed to version control."
    },
    {
      id: "SECRET-FAIL-04",
      description: "Accidentally committed GCP service account JSON",
      tags: ["hardcoded", "gcp", "service-account", "committed-file"],
      criteriaTargeted: ["SECRET-C1"],
      changedFiles: [
        {
          path: "config/service-account.json",
          content: `
{
  "type": "service_account",
  "project_id": "my-project-123",
  "private_key_id": "a1b2c3d4e5f6g7h8i9j0",
  "private_key": "-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQ...\\n-----END PRIVATE KEY-----\\n",
  "client_email": "service-account@my-project-123.iam.gserviceaccount.com",
  "client_id": "1234567890"
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SECRET-C1",
          expectedEvidence: [{ file: "config/service-account.json", snippetSubstr: "\"private_key\": \"***REDACTED***\"" }]
        }
      ],
      rationale: "Service account JSON files contain highly privileged private keys and must not be committed to version control."
    },
    {
      id: "SECRET-PASS-01",
      description: "Using environment variables securely",
      tags: ["secure", "env", "secrets"],
      criteriaTargeted: ["SECRET-C1", "SECRET-C2"],
      changedFiles: [
        {
          path: "src/auth.ts",
          content: `
import jwt from 'jsonwebtoken';

export function createToken(userId) {
  // Secret loaded from environment variable
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "The secret is securely loaded from an environment variable rather than hardcoded."
    },
    {
      id: "SECRET-PASS-02",
      description: "Safe configuration file without secrets",
      tags: ["secure", "config", "no-secrets"],
      criteriaTargeted: ["SECRET-C1"],
      changedFiles: [
        {
          path: "config.json",
          content: `
{
  "port": 8080,
  "features": {
    "betaUI": true,
    "darkModeDefault": false
  }
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "The configuration file only contains safe, non-sensitive settings."
    },

    // ═══════════════════════════════════════════════════════════════════
    // SECRET-C2: Secure Secret Storage
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "SECRET-FAIL-05",
      description: "Plaintext database credentials in config struct",
      tags: ["storage", "plaintext", "database"],
      criteriaTargeted: ["SECRET-C2"],
      changedFiles: [
        {
          path: "src/config/database.ts",
          content: `
export const dbConfig = {
  host: 'db.internal.example.com',
  user: 'admin',
  password: 'ProductionPassword2024!', // Checked into code
  port: 5432
};
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SECRET-C2", // Can also be C1
          expectedEvidence: [{ file: "src/config/database.ts", snippetSubstr: "password: '***REDACTED***'" }]
        }
      ],
      rationale: "Production database credentials are stored in plaintext in a configuration file."
    },
    {
      id: "SECRET-FAIL-06",
      description: "Custom weak encryption for secrets with hardcoded key",
      tags: ["storage", "weak-encryption", "custom-crypto"],
      criteriaTargeted: ["SECRET-C2"],
      changedFiles: [
        {
          path: "src/utils/secrets.ts",
          content: `
import crypto from 'crypto';
import fs from 'fs';

const KEY = 's3cr3tK3yF0rC0nf1g'; // Hardcoded decryption key

export function getDbPassword() {
  const encrypted = fs.readFileSync('./db_pass.enc', 'utf8');
  const decipher = crypto.createDecipher('aes-256-cbc', KEY); // Deprecated and insecure
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SECRET-C2", // Or C1
          expectedEvidence: [{ file: "src/utils/secrets.ts", snippetSubstr: "const KEY = '***REDACTED***'" }]
        }
      ],
      rationale: "Rolling custom crypto with hardcoded keys to store secrets is insecure. Standard secret managers should be used."
    },
    {
      id: "SECRET-FAIL-07",
      description: "Storing API key in localStorage (Client-side code)",
      tags: ["storage", "client-side", "localstorage"],
      criteriaTargeted: ["SECRET-C2", "SECRET-C3"],
      changedFiles: [
        {
          path: "src/components/PaymentForm.tsx",
          content: `
export function setupPayment() {
  // Storing sensitive API key in local storage
  localStorage.setItem('STRIPE_SECRET_KEY', 'sk_live_123456789');
  
  return <div id="payment-form"></div>;
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SECRET-C3", // Exposure in client-side code
          expectedEvidence: [{ file: "src/components/PaymentForm.tsx", snippetSubstr: "sk_live_***REDACTED***" }]
        }
      ],
      rationale: "Secret keys must never be shipped to the client or stored in client-side storage (localStorage)."
    },
    {
      id: "SECRET-PASS-03",
      description: "Fetching secrets securely from AWS Secrets Manager",
      tags: ["secure", "secrets-manager", "aws"],
      criteriaTargeted: ["SECRET-C2"],
      changedFiles: [
        {
          path: "src/config/secrets.ts",
          content: `
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const client = new SecretsManagerClient({ region: "us-east-1" });

export async function getDatabaseCredentials() {
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: "prod/db/credentials" })
  );
  return JSON.parse(response.SecretString!);
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Application securely fetches credentials at runtime from a managed secret store."
    },
    {
      id: "SECRET-PASS-04",
      description: "Using dotenv securely (file not committed)",
      tags: ["secure", "dotenv", "env"],
      criteriaTargeted: ["SECRET-C2"],
      changedFiles: [
        {
          path: "src/server.ts",
          content: `
import * as dotenv from 'dotenv';
// Load .env if it exists, but the file itself is properly gitignored
dotenv.config();

import { startApp } from './app';
startApp(process.env.DB_PASSWORD);
`.trim()
        },
        {
          path: ".gitignore",
          content: `
node_modules/
.env
dist/
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: ".env file is used for local development but is explicitly ignored from version control."
    },

    // ═══════════════════════════════════════════════════════════════════
    // SECRET-C3: Secret Exposure
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "SECRET-FAIL-08",
      description: "Logging full request headers (including Authorization)",
      tags: ["exposure", "logs", "headers"],
      criteriaTargeted: ["SECRET-C3"],
      changedFiles: [
        {
          path: "src/middleware/logger.ts",
          content: `
export function requestLogger(req, res, next) {
  // Logs all headers, which includes the sensitive 'Authorization: Bearer <token>' header
  console.log(\`Incoming request: \${req.method} \${req.url}\`, req.headers);
  next();
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SECRET-C3",
          expectedEvidence: [{ file: "src/middleware/logger.ts", snippetSubstr: "console.log" }]
        }
      ],
      rationale: "Logging unredacted headers exposes Bearer tokens or API keys to log aggregation systems."
    },
    {
      id: "SECRET-FAIL-09",
      description: "Logging connection URI containing password",
      tags: ["exposure", "logs", "database"],
      criteriaTargeted: ["SECRET-C3"],
      changedFiles: [
        {
          path: "src/db.ts",
          content: `
export async function connectToDatabase(uri: string) {
  try {
    console.log(\`Connecting to database at \${uri}\`); // Exposes password if URI is postgres://user:pass@host
    await db.connect(uri);
  } catch (error) {
    console.error("DB connection failed", error);
  }
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SECRET-C3",
          expectedEvidence: [{ file: "src/db.ts", snippetSubstr: "Connecting to database at ${uri}" }]
        }
      ],
      rationale: "Database connection strings often contain passwords and should be masked before logging."
    },
    {
      id: "SECRET-FAIL-10",
      description: "Exposing stack traces and env vars in error responses",
      tags: ["exposure", "errors", "stack-trace"],
      criteriaTargeted: ["SECRET-C3"],
      changedFiles: [
        {
          path: "src/middleware/errorHandler.ts",
          content: `
export function errorHandler(err, req, res, next) {
  // Returning process.env to the client in case of an error!
  res.status(500).json({
    message: err.message,
    stack: err.stack,
    env: process.env // Massive secret leak
  });
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SECRET-C3",
          expectedEvidence: [{ file: "src/middleware/errorHandler.ts", snippetSubstr: "env: process.env" }]
        }
      ],
      rationale: "Returning the environment variables and full stack traces to the client exposes all application secrets."
    },
    {
      id: "SECRET-FAIL-11",
      description: "Returning full user object including password hash in API response",
      tags: ["exposure", "api-response", "password-hash"],
      criteriaTargeted: ["SECRET-C3"],
      changedFiles: [
        {
          path: "src/controllers/users.ts",
          content: `
export async function getUserProfile(req, res) {
  const user = await db.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
  // user object includes 'password_hash' and 'reset_token'
  // Returning it directly to the client exposes these sensitive fields
  res.json(user);
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SECRET-C3",
          expectedEvidence: [{ file: "src/controllers/users.ts", snippetSubstr: "res.json(user);" }]
        }
      ],
      rationale: "API responses must be filtered to exclude sensitive fields like password hashes or internal tokens."
    },
    {
      id: "SECRET-FAIL-12",
      description: "Client-side code containing backend secret",
      tags: ["exposure", "client-side", "react"],
      criteriaTargeted: ["SECRET-C3"],
      changedFiles: [
        {
          path: "src/components/Checkout.tsx",
          content: `
import React from 'react';

export function Checkout() {
  // Using the Stripe SECRET key in the frontend instead of the PUBLISHABLE key
  const stripeSecretKey = 'sk_live_abc123'; 
  
  return <button>Pay Now</button>;
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SECRET-C3",
          expectedEvidence: [{ file: "src/components/Checkout.tsx", snippetSubstr: "sk_live_***REDACTED***" }]
        }
      ],
      rationale: "Backend secret keys (like Stripe 'sk_live') must never be embedded in client-side bundles."
    },
    {
      id: "SECRET-PASS-05",
      description: "Secure logging with redaction",
      tags: ["secure", "logging", "redaction"],
      criteriaTargeted: ["SECRET-C3"],
      changedFiles: [
        {
          path: "src/middleware/logger.ts",
          content: `
export function requestLogger(req, res, next) {
  // Clone headers and mask sensitive fields
  const safeHeaders = { ...req.headers };
  if (safeHeaders.authorization) {
    safeHeaders.authorization = '***REDACTED***';
  }
  console.log(\`Incoming request: \${req.method} \${req.url}\`, safeHeaders);
  next();
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Sensitive headers are explicitly redacted before logging."
    },

    // ═══════════════════════════════════════════════════════════════════
    // SECRET-C4: Secret Lifecycle
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "SECRET-FAIL-13",
      description: "JWT tokens without expiration",
      tags: ["lifecycle", "jwt", "no-expiry"],
      criteriaTargeted: ["SECRET-C4"],
      changedFiles: [
        {
          path: "src/auth/tokens.ts",
          content: `
import jwt from 'jsonwebtoken';

export function generateAccessToken(user) {
  // Token never expires!
  return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET);
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SECRET-C4",
          expectedEvidence: [{ file: "src/auth/tokens.ts", snippetSubstr: "jwt.sign({ id: user.id" }]
        }
      ],
      rationale: "Access tokens should have a short expiration time (e.g., 15m - 1h) to limit the impact of token theft."
    },
    {
      id: "SECRET-FAIL-14",
      description: "Hardcoding long-lived AWS IAM User keys instead of assuming roles",
      tags: ["lifecycle", "aws", "long-lived"],
      criteriaTargeted: ["SECRET-C4", "SECRET-C1"],
      changedFiles: [
        {
          path: "src/services/aws.ts",
          content: `
import { S3Client } from "@aws-sdk/client-s3";

// Uses long-lived static credentials rather than temporary STS roles
const client = new S3Client({
  region: "us-west-2",
  credentials: {
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
  }
});
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SECRET-C1", // Hardcoded
          expectedEvidence: [{ file: "src/services/aws.ts", snippetSubstr: "accessKeyId: \"***REDACTED***\"" }]
        }
      ],
      rationale: "Long-lived static credentials are a security risk and in this case, hardcoded. Should use temporary IAM roles."
    },
    {
      id: "SECRET-FAIL-15",
      description: "Refresh token stored without revocation capability",
      tags: ["lifecycle", "refresh-token", "revocation"],
      criteriaTargeted: ["SECRET-C4"],
      changedFiles: [
        {
          path: "src/auth/refresh.ts",
          content: `
import jwt from 'jsonwebtoken';

export function handleRefresh(req, res) {
  const { refreshToken } = req.body;
  // Blindly verifies the refresh token without checking if it was revoked in the DB
  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const newAccessToken = jwt.sign({ id: decoded.id }, process.env.JWT_SECRET, { expiresIn: '15m' });
    res.json({ accessToken: newAccessToken });
  } catch (err) {
    res.status(401).send();
  }
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SECRET-C4",
          expectedEvidence: [{ file: "src/auth/refresh.ts", snippetSubstr: "jwt.verify(refreshToken" }]
        }
      ],
      rationale: "Refresh tokens must be stateful (stored in a DB or cache) so they can be revoked if a user logs out or is compromised."
    },
    {
      id: "SECRET-PASS-06",
      description: "Assuming temporary AWS STS role",
      tags: ["secure", "lifecycle", "sts", "temporary-credentials"],
      criteriaTargeted: ["SECRET-C4"],
      changedFiles: [
        {
          path: "src/services/aws.ts",
          content: `
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";

export async function getTemporaryCredentials() {
  const client = new STSClient({ region: "us-east-1" });
  const command = new AssumeRoleCommand({
    RoleArn: "arn:aws:iam::123456789012:role/S3AccessRole",
    RoleSessionName: "AppSession",
    DurationSeconds: 900 // 15 minutes
  });
  const response = await client.send(command);
  return response.Credentials;
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "The application uses temporary, short-lived credentials via AWS STS, minimizing the window of opportunity if leaked."
    },
    {
      id: "SECRET-PASS-07",
      description: "JWT access token with short expiry",
      tags: ["secure", "lifecycle", "jwt"],
      criteriaTargeted: ["SECRET-C4"],
      changedFiles: [
        {
          path: "src/auth/tokens.ts",
          content: `
import jwt from 'jsonwebtoken';

export function generateAccessToken(user) {
  // Short expiration time limits window of abuse
  return jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '15m' });
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Access token is configured with a short 15-minute expiration time."
    },
    {
      id: "SECRET-NV-01",
      description: "Token rotation handled by external IdP",
      tags: ["lifecycle", "missing-context", "idp"],
      criteriaTargeted: ["SECRET-C4"],
      changedFiles: [
        {
          path: "src/auth/login.ts",
          content: `
export async function login(req, res) {
  // Calls Auth0 to get tokens, lifecycle is managed by Auth0 policies
  const tokens = await auth0Client.oauth.passwordGrant({
    username: req.body.username,
    password: req.body.password,
    realm: 'Username-Password-Authentication'
  });
  res.json(tokens);
}
`.trim()
        }
      ],
      expectedVerdict: "NOT_VERIFIED",
      rationale: "Token lifecycles are governed by Auth0 tenant settings which are not visible in the code."
    },

    // ═══════════════════════════════════════════════════════════════════
    // SECRET-C5: Least Privilege Credentials
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "SECRET-FAIL-16",
      description: "Connecting to database as 'root' or 'postgres' superuser",
      tags: ["least-privilege", "database", "superuser"],
      criteriaTargeted: ["SECRET-C5"],
      changedFiles: [
        {
          path: "src/db.ts",
          content: `
import { Client } from 'pg';

export function connectDb() {
  // Using the root 'postgres' user for application queries
  const client = new Client({
    user: 'postgres',
    password: process.env.DB_PASSWORD,
    host: 'db.example.com',
    database: 'myapp'
  });
  client.connect();
  return client;
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SECRET-C5",
          expectedEvidence: [{ file: "src/db.ts", snippetSubstr: "user: 'postgres'" }]
        }
      ],
      rationale: "Applications should never connect to a database using the superuser ('postgres', 'root'). They should use a dedicated user with restricted permissions."
    },
    {
      id: "SECRET-FAIL-17",
      description: "Requesting overly broad OAuth scopes",
      tags: ["least-privilege", "oauth", "scopes"],
      criteriaTargeted: ["SECRET-C5"],
      changedFiles: [
        {
          path: "src/auth/github.ts",
          content: `
export function getGithubLoginUrl() {
  // Application only needs user's email, but requests full read/write access to all repos
  const scopes = 'repo user:email delete_repo';
  return \`https://github.com/login/oauth/authorize?client_id=\${process.env.GH_CLIENT_ID}&scope=\${scopes}\`;
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SECRET-C5",
          expectedEvidence: [{ file: "src/auth/github.ts", snippetSubstr: "scopes = 'repo user:email delete_repo'" }]
        }
      ],
      rationale: "OAuth applications should only request the minimum scopes necessary. Requesting full repository control violates least privilege."
    },
    {
      id: "SECRET-PASS-08",
      description: "Database connection uses restricted application user",
      tags: ["secure", "least-privilege", "database"],
      criteriaTargeted: ["SECRET-C5"],
      changedFiles: [
        {
          path: "src/db.ts",
          content: `
import { Client } from 'pg';

export function connectDb() {
  // Uses a dedicated app_user instead of root
  const client = new Client({
    user: 'app_user_rw',
    password: process.env.DB_PASSWORD,
    host: 'db.example.com',
    database: 'myapp'
  });
  client.connect();
  return client;
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "The application connects using a dedicated, presumably restricted user rather than a superuser."
    },
    {
      id: "SECRET-NV-02",
      description: "IAM Role permissions defined outside of codebase",
      tags: ["least-privilege", "missing-context", "iam"],
      criteriaTargeted: ["SECRET-C5"],
      changedFiles: [
        {
          path: "src/services/s3.ts",
          content: `
import { S3Client } from "@aws-sdk/client-s3";

// Uses default credential provider chain (e.g., EC2 instance profile)
const client = new S3Client({ region: "us-west-2" });
`.trim()
        }
      ],
      expectedVerdict: "NOT_VERIFIED",
      rationale: "The permissions of the IAM role being assumed by the default provider chain are defined in AWS, not in the provided code."
    },

    // ═══════════════════════════════════════════════════════════════════
    // SECRET-C6: Secure Secret Usage
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "SECRET-FAIL-18",
      description: "Writing API token to a temporary file on disk",
      tags: ["secure-usage", "disk-persistence", "tmp"],
      criteriaTargeted: ["SECRET-C6"],
      changedFiles: [
        {
          path: "src/services/external.ts",
          content: `
import fs from 'fs';
import { exec } from 'child_process';

export function runLegacyJob(token) {
  // Unnecessarily writing a sensitive token to disk in a shared temp folder
  const tmpPath = '/tmp/job_token.txt';
  fs.writeFileSync(tmpPath, token);
  
  exec(\`/opt/legacy/bin --token-file \${tmpPath}\`, () => {
    fs.unlinkSync(tmpPath);
  });
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SECRET-C6",
          expectedEvidence: [{ file: "src/services/external.ts", snippetSubstr: "fs.writeFileSync(tmpPath, token)" }]
        }
      ],
      rationale: "Writing secrets to disk (especially shared `/tmp` directories) exposes them to other processes. Secrets should be passed via environment variables or stdin."
    },
    {
      id: "SECRET-FAIL-19",
      description: "Caching raw database passwords in Redis",
      tags: ["secure-usage", "caching"],
      criteriaTargeted: ["SECRET-C6"],
      changedFiles: [
        {
          path: "src/config/loader.ts",
          content: `
import redis from './redisClient';

export async function getDbConfig() {
  let config = await redis.get('db_config');
  if (!config) {
    config = fetchConfigFromVault();
    // Persisting the entire config (including DB password) to Redis in plaintext
    await redis.set('db_config', JSON.stringify(config));
  }
  return JSON.parse(config);
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SECRET-C6",
          expectedEvidence: [{ file: "src/config/loader.ts", snippetSubstr: "await redis.set('db_config'" }]
        }
      ],
      rationale: "Secrets should not be serialized and cached in plaintext in external systems like Redis."
    },
    {
      id: "SECRET-PASS-09",
      description: "Passing secrets via environment to child process",
      tags: ["secure", "secure-usage", "child-process"],
      criteriaTargeted: ["SECRET-C6"],
      changedFiles: [
        {
          path: "src/services/external.ts",
          content: `
import { exec } from 'child_process';

export function runLegacyJob(token) {
  // Passing secret securely via environment variables to the child process
  exec('/opt/legacy/bin', { env: { ...process.env, JOB_TOKEN: token } }, (err, stdout) => {
    console.log("Job finished");
  });
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Secrets are kept in memory and passed securely via the child process environment, avoiding disk writes."
    },
    {
      id: "SECRET-NV-03",
      description: "In-memory caching implementation not visible",
      tags: ["secure-usage", "missing-context", "cache"],
      criteriaTargeted: ["SECRET-C6"],
      changedFiles: [
        {
          path: "src/services/vault.ts",
          content: `
import { cacheConfig } from '../cache';

export async function fetchSecret() {
  const secret = await getFromVault();
  cacheConfig('api_key', secret);
  return secret;
}
`.trim()
        }
      ],
      expectedVerdict: "NOT_VERIFIED",
      rationale: "It is unknown whether 'cacheConfig' stores the secret securely in-memory or serializes it insecurely to an external store."
    },

    // ═══════════════════════════════════════════════════════════════════
    // Cross-Cutting Scenarios
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "SECRET-PASS-10",
      description: "Perfectly secured external API integration",
      tags: ["comprehensive", "secure"],
      criteriaTargeted: ["SECRET-C1", "SECRET-C2", "SECRET-C3", "SECRET-C6"],
      changedFiles: [
        {
          path: "src/services/stripe.ts",
          content: `
import Stripe from 'stripe';

// Loaded from env, not hardcoded
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

export async function createCustomer(email) {
  try {
    const customer = await stripe.customers.create({ email });
    return customer;
  } catch (error) {
    // Redacting any potential keys from error object before throwing
    const safeError = new Error("Stripe API failed");
    console.error(safeError);
    throw safeError;
  }
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "API key is loaded from the environment, not hardcoded, and error handling ensures no sensitive data leaks into logs."
    },
    {
      id: "SECRET-NV-04",
      description: "PR only modifies CSS",
      tags: ["unrelated", "css"],
      criteriaTargeted: [],
      changedFiles: [
        {
          path: "src/styles.css",
          content: `
.btn-primary { background: blue; }
`.trim()
        }
      ],
      expectedVerdict: "NOT_VERIFIED",
      rationale: "No secret management logic is present in the PR."
    }
  ]
};
