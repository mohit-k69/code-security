import type { EvalDataset } from "../types.ts";

export const FilePathSecurityEvalDataset: EvalDataset = {
  checkpointId: "SEC-FILE-001",
  version: "1.0",
  scenarios: [
    // ═══════════════════════════════════════════════════════════════════
    // FILE-C1: Path Traversal
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "FILE-FAIL-01",
      description: "Direct path concatenation allowing directory traversal",
      tags: ["path-traversal", "concatenation", "fs"],
      criteriaTargeted: ["FILE-C1"],
      changedFiles: [
        {
          path: "src/api/download.ts",
          content: `
import fs from 'fs';
import path from 'path';

export function downloadFile(req, res) {
  const filename = req.query.file;
  // VULNERABLE: Direct concatenation allows ../../etc/passwd
  const filePath = path.join(__dirname, 'public/uploads/', filename);
  
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send();
  }
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "FILE-C1",
          expectedEvidence: [{ file: "src/api/download.ts", snippetSubstr: "path.join(__dirname, 'public/uploads/', filename)" }]
        }
      ],
      rationale: "Using path.join with raw user input resolves traversal characters (`../`), allowing an attacker to escape the uploads directory and read arbitrary server files."
    },
    {
      id: "FILE-FAIL-02",
      description: "Unsafe absolute path injection",
      tags: ["path-traversal", "absolute-path", "fs"],
      criteriaTargeted: ["FILE-C1"],
      changedFiles: [
        {
          path: "src/api/logs.ts",
          content: `
import fs from 'fs';
import path from 'path';

export function getLogs(req, res) {
  const logDir = req.query.dir || 'default';
  // VULNERABLE: path.resolve treats absolute paths (e.g., /etc) as the new root
  const targetDir = path.resolve(__dirname, 'logs', logDir);
  
  const files = fs.readdirSync(targetDir);
  res.json(files);
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "FILE-C1",
          expectedEvidence: [{ file: "src/api/logs.ts", snippetSubstr: "path.resolve(__dirname, 'logs', logDir)" }]
        }
      ],
      rationale: "If `logDir` is an absolute path like `/etc`, `path.resolve` ignores the previous arguments and returns `/etc`. This allows attackers to browse the entire filesystem."
    },
    {
      id: "FILE-PASS-01",
      description: "Secure path construction using path.basename",
      tags: ["secure", "path-traversal", "basename"],
      criteriaTargeted: ["FILE-C1"],
      changedFiles: [
        {
          path: "src/api/download.ts",
          content: `
import fs from 'fs';
import path from 'path';

export function downloadFile(req, res) {
  // SAFE: path.basename strips all directory traversal sequences
  const safeFilename = path.basename(req.query.file);
  const filePath = path.join(__dirname, 'public/uploads/', safeFilename);
  
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send();
  }
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "`path.basename()` extracts only the final portion of a path, neutralizing any `../` sequences."
    },
    {
      id: "FILE-PASS-02",
      description: "Secure path validation resolving canonical paths",
      tags: ["secure", "path-traversal", "realpath"],
      criteriaTargeted: ["FILE-C1"],
      changedFiles: [
        {
          path: "src/api/download.ts",
          content: `
import fs from 'fs';
import path from 'path';

export function downloadFile(req, res) {
  const baseDir = path.resolve(__dirname, 'public/uploads');
  const targetPath = path.resolve(baseDir, req.query.file);
  
  // SAFE: Verifies that the resolved absolute path strictly starts with the intended base directory
  if (!targetPath.startsWith(baseDir + path.sep)) {
    return res.status(403).send('Forbidden');
  }
  
  res.sendFile(targetPath);
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Resolving the absolute path and verifying it starts with the intended base directory is a robust defense against path traversal."
    },

    // ═══════════════════════════════════════════════════════════════════
    // FILE-C2: File Upload Security
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "FILE-FAIL-03",
      description: "Trusting client-provided MIME type without validation",
      tags: ["upload", "mime-type", "bypass"],
      criteriaTargeted: ["FILE-C2"],
      changedFiles: [
        {
          path: "src/api/upload.ts",
          content: `
export async function handleUpload(req, res) {
  const file = req.file;
  
  // VULNERABLE: The Content-Type header is completely controlled by the client
  if (file.mimetype !== 'image/png' && file.mimetype !== 'image/jpeg') {
    return res.status(400).send('Only images allowed');
  }
  
  // Attacker can upload a .php file but set the Content-Type to image/png
  await storage.save(file);
  res.send('Success');
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "FILE-C2",
          expectedEvidence: [{ file: "src/api/upload.ts", snippetSubstr: "if (file.mimetype !==" }]
        }
      ],
      rationale: "Client-provided MIME types (from the HTTP header) are trivial to spoof. File extensions and actual content (magic bytes) must be verified."
    },
    {
      id: "FILE-FAIL-04",
      description: "Failing to validate file extensions (Executable Upload)",
      tags: ["upload", "extension", "executable"],
      criteriaTargeted: ["FILE-C2"],
      changedFiles: [
        {
          path: "src/api/upload.ts",
          content: `
export async function handleUpload(req, res) {
  const file = req.file;
  const originalName = file.originalname;
  
  // VULNERABLE: No extension validation. Allows uploading malicious scripts (.php, .jsp, .exe, .sh)
  await fs.promises.writeFile('/var/www/html/uploads/' + originalName, file.buffer);
  
  res.send('Uploaded');
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "FILE-C2",
          expectedEvidence: [{ file: "src/api/upload.ts", snippetSubstr: "await fs.promises.writeFile" }]
        }
      ],
      rationale: "Accepting any file extension allows attackers to upload executable scripts (like PHP or Node) to the server, leading to Remote Code Execution."
    },
    {
      id: "FILE-PASS-03",
      description: "Secure upload validation with strict extension allowlist",
      tags: ["secure", "upload", "extension", "allowlist"],
      criteriaTargeted: ["FILE-C2"],
      changedFiles: [
        {
          path: "src/api/upload.ts",
          content: `
import path from 'path';

const ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif']);

export async function handleUpload(req, res) {
  const file = req.file;
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (!ALLOWED_EXTS.has(ext)) {
    return res.status(400).send('Invalid file type');
  }
  
  // Generate safe internal name
  const safeName = crypto.randomUUID() + ext;
  await storage.save(safeName, file.buffer);
  
  res.send('Uploaded');
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Uses a strict allowlist for file extensions and generates a safe, random filename to prevent malicious uploads."
    },

    // ═══════════════════════════════════════════════════════════════════
    // FILE-C3: File Download Authorization
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "FILE-FAIL-05",
      description: "IDOR on file download",
      tags: ["download", "idor", "authorization"],
      criteriaTargeted: ["FILE-C3"],
      changedFiles: [
        {
          path: "src/api/invoices.ts",
          content: `
export async function downloadInvoice(req, res) {
  const invoiceId = req.params.id;
  
  // VULNERABLE: Blindly fetches the file without checking if the current user owns it
  const invoice = await db.invoices.findById(invoiceId);
  if (!invoice) return res.status(404).send();
  
  res.download(invoice.filePath);
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "FILE-C3",
          expectedEvidence: [{ file: "src/api/invoices.ts", snippetSubstr: "const invoice = await db.invoices.findById(invoiceId);" }]
        }
      ],
      rationale: "Failing to verify ownership allows an attacker to iterate through invoice IDs and download other users' sensitive documents."
    },
    {
      id: "FILE-PASS-04",
      description: "Secure file download with ownership verification",
      tags: ["secure", "download", "authorization"],
      criteriaTargeted: ["FILE-C3"],
      changedFiles: [
        {
          path: "src/api/invoices.ts",
          content: `
export async function downloadInvoice(req, res) {
  const invoiceId = req.params.id;
  const userId = req.user.id;
  
  // SAFE: explicitly verifies ownership in the query
  const invoice = await db.invoices.findOne({ id: invoiceId, user_id: userId });
  if (!invoice) return res.status(404).send();
  
  res.download(invoice.filePath);
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "The database query explicitly restricts the result to files owned by the currently authenticated user."
    },

    // ═══════════════════════════════════════════════════════════════════
    // FILE-C4: File Storage & Permissions
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "FILE-FAIL-06",
      description: "Unintended File Overwrite (Trusting User Filename)",
      tags: ["storage", "overwrite", "filename"],
      criteriaTargeted: ["FILE-C4"],
      changedFiles: [
        {
          path: "src/api/avatar.ts",
          content: `
import fs from 'fs';
import path from 'path';

export async function uploadAvatar(req, res) {
  const file = req.file;
  // VULNERABLE: Trusting the user-provided filename directly
  const safeName = path.basename(file.originalname); 
  const targetPath = path.join(__dirname, 'public/avatars', safeName);
  
  // Attacker can upload a file named "admin-avatar.png" and overwrite the admin's avatar,
  // or "app.js" if the upload directory is misconfigured.
  await fs.promises.writeFile(targetPath, file.buffer);
  
  res.send('Avatar updated');
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "FILE-C4",
          expectedEvidence: [{ file: "src/api/avatar.ts", snippetSubstr: "path.join(__dirname, 'public/avatars', safeName)" }]
        }
      ],
      rationale: "Even if path traversal is prevented via path.basename, trusting the filename allows attackers to intentionally overwrite existing files (e.g., config files, other users' data) residing in that directory."
    },
    {
      id: "FILE-FAIL-07",
      description: "Insecure file permissions on sensitive generated files",
      tags: ["storage", "permissions", "chmod"],
      criteriaTargeted: ["FILE-C4"],
      changedFiles: [
        {
          path: "src/services/export.ts",
          content: `
import fs from 'fs';

export async function generateTaxReport(data) {
  const filePath = '/tmp/report-' + Date.now() + '.pdf';
  await generatePDF(data, filePath);
  
  // VULNERABLE: 0777 makes the file readable and writable by any user on the system
  fs.chmodSync(filePath, 0o777); 
  
  return filePath;
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "FILE-C4",
          expectedEvidence: [{ file: "src/services/export.ts", snippetSubstr: "fs.chmodSync(filePath, 0o777);" }]
        }
      ],
      rationale: "Sensitive files must not be world-readable or world-writable (0777). They should be restricted to the owner (e.g., 0600)."
    },
    {
      id: "FILE-PASS-05",
      description: "Secure filename randomization to prevent overwrites",
      tags: ["secure", "storage", "randomization", "overwrite-prevention"],
      criteriaTargeted: ["FILE-C4"],
      changedFiles: [
        {
          path: "src/api/avatar.ts",
          content: `
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export async function uploadAvatar(req, res) {
  const file = req.file;
  const ext = path.extname(file.originalname);
  
  // SAFE: Generating a completely random, collision-resistant filename
  const randomName = crypto.randomUUID() + ext;
  const targetPath = path.join(__dirname, 'public/avatars', randomName);
  
  await fs.promises.writeFile(targetPath, file.buffer);
  
  res.send('Avatar updated');
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Randomizing the filename using a UUID completely mitigates the risk of an attacker intentionally overwriting existing files."
    },

    // ═══════════════════════════════════════════════════════════════════
    // FILE-C5: Archive & File Extraction Security (Zip Slip)
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "FILE-FAIL-08",
      description: "Zip Slip vulnerability during extraction",
      tags: ["archive", "zip-slip", "traversal"],
      criteriaTargeted: ["FILE-C5"],
      changedFiles: [
        {
          path: "src/services/unzip.ts",
          content: `
import fs from 'fs';
import path from 'path';
import unzipper from 'unzipper';

export async function extractArchive(zipPath, targetDir) {
  const zip = fs.createReadStream(zipPath).pipe(unzipper.Parse());
  
  for await (const entry of zip) {
    const fileName = entry.path;
    // VULNERABLE: Direct concatenation. If fileName is "../../../etc/passwd", it writes outside targetDir
    const extractPath = path.join(targetDir, fileName);
    
    if (entry.type === 'File') {
      entry.pipe(fs.createWriteStream(extractPath));
    } else {
      entry.autodrain();
    }
  }
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "FILE-C5",
          expectedEvidence: [{ file: "src/services/unzip.ts", snippetSubstr: "const extractPath = path.join(targetDir, fileName);" }]
        }
      ],
      rationale: "Malicious archives can contain file entries with traversal paths (`../`). Extracting them without validating the resolved path leads to arbitrary file write (Zip Slip)."
    },
    {
      id: "FILE-PASS-06",
      description: "Secure archive extraction preventing Zip Slip",
      tags: ["secure", "archive", "zip-slip"],
      criteriaTargeted: ["FILE-C5"],
      changedFiles: [
        {
          path: "src/services/unzip.ts",
          content: `
import fs from 'fs';
import path from 'path';
import unzipper from 'unzipper';

export async function extractArchive(zipPath, targetDir) {
  const zip = fs.createReadStream(zipPath).pipe(unzipper.Parse());
  const resolvedTargetDir = path.resolve(targetDir);
  
  for await (const entry of zip) {
    const extractPath = path.resolve(resolvedTargetDir, entry.path);
    
    // SAFE: Strictly verifying the resolved path stays within the intended target directory
    if (!extractPath.startsWith(resolvedTargetDir + path.sep)) {
      console.warn("Zip Slip attempt detected, skipping entry:", entry.path);
      entry.autodrain();
      continue;
    }
    
    if (entry.type === 'File') {
      entry.pipe(fs.createWriteStream(extractPath));
    } else {
      entry.autodrain();
    }
  }
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Resolving the absolute path of the extracted file and verifying it begins with the target directory safely prevents Zip Slip attacks."
    },

    // ═══════════════════════════════════════════════════════════════════
    // FILE-C6: Symbolic Link & Filesystem Abuse
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "FILE-FAIL-09",
      description: "Blindly reading via symlink to arbitrary files",
      tags: ["symlink", "fs", "abuse"],
      criteriaTargeted: ["FILE-C6"],
      changedFiles: [
        {
          path: "src/services/backup.ts",
          content: `
import fs from 'fs';

export function readBackupItem(itemPath) {
  // VULNERABLE: readFile automatically follows symlinks. 
  // If a user can upload a symlink pointing to /etc/passwd, they can read it.
  return fs.readFileSync(itemPath, 'utf8');
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "FILE-C6",
          expectedEvidence: [{ file: "src/services/backup.ts", snippetSubstr: "fs.readFileSync(itemPath, 'utf8')" }]
        }
      ],
      rationale: "When handling untrusted files or archives, following symlinks blindly allows attackers to point to sensitive server files and read their contents."
    },
    {
      id: "FILE-PASS-07",
      description: "Safely resolving real paths before operations",
      tags: ["secure", "symlink", "realpath"],
      criteriaTargeted: ["FILE-C6"],
      changedFiles: [
        {
          path: "src/services/backup.ts",
          content: `
import fs from 'fs';
import path from 'path';

export function readBackupItem(itemPath, allowedDir) {
  // Resolve symlinks to their actual target
  const realPath = fs.realpathSync(itemPath);
  
  // Verify the final target is within the allowed directory
  if (!realPath.startsWith(path.resolve(allowedDir) + path.sep)) {
    throw new Error("Symlink escapes allowed directory");
  }
  
  return fs.readFileSync(realPath, 'utf8');
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Using `fs.realpathSync` resolves all symlinks to their final destination, allowing the application to securely verify the bounds."
    },

    // ═══════════════════════════════════════════════════════════════════
    // Cross-Cutting Scenarios
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "FILE-PASS-08",
      description: "Static server-controlled paths (False Positive test)",
      tags: ["secure", "static-path", "false-positive-check"],
      criteriaTargeted: ["FILE-C1"],
      changedFiles: [
        {
          path: "src/config/loader.ts",
          content: `
import fs from 'fs';
import path from 'path';

export function loadConfig() {
  const env = process.env.NODE_ENV || 'development';
  // SAFE: 'env' is controlled by the server environment, not user input.
  const configPath = path.join(__dirname, '..', 'config', \`\${env}.json\`);
  
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Concatenating server-controlled environment variables into paths is safe. The AI should not flag this as path traversal."
    },
    {
      id: "FILE-NV-01",
      description: "Upload handled purely via AWS S3 abstraction",
      tags: ["missing-context", "cloud-storage", "s3"],
      criteriaTargeted: ["FILE-C1", "FILE-C2", "FILE-C4"],
      changedFiles: [
        {
          path: "src/api/upload.ts",
          content: `
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const client = new S3Client({});

export async function generatePresignedUrl(req, res) {
  const command = new PutObjectCommand({
    Bucket: process.env.BUCKET,
    Key: req.user.id + '/' + crypto.randomUUID(),
  });
  
  const url = await getSignedUrl(client, command, { expiresIn: 3600 });
  res.json({ url });
}
`.trim()
        }
      ],
      expectedVerdict: "NOT_VERIFIED",
      rationale: "The file is uploaded directly from the client to S3 via a pre-signed URL. There is no local filesystem interaction or backend validation logic present."
    }
  ]
};
