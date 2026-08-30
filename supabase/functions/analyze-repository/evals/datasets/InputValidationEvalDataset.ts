import type { EvalDataset } from "../types.ts";

export const InputValidationEvalDataset: EvalDataset = {
  checkpointId: "SEC-INPUT-001",
  version: "1.0",
  scenarios: [
    // ═══════════════════════════════════════════════════════════════════
    // INPUT-C1: Input Validation
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "INPUT-FAIL-01",
      description: "Missing length limits on string input",
      tags: ["input-validation", "length-limits", "dos"],
      criteriaTargeted: ["INPUT-C1"],
      changedFiles: [
        {
          path: "src/controllers/comments.ts",
          content: `
export async function createComment(req, res) {
  const { text } = req.body;
  if (!text) {
    return res.status(400).send("Text is required");
  }
  // Missing length limit check on 'text'
  await db.query('INSERT INTO comments (text) VALUES (?)', [text]);
  res.json({ success: true });
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "INPUT-C1",
          expectedEvidence: [{ file: "src/controllers/comments.ts", snippetSubstr: "if (!text)" }]
        }
      ],
      rationale: "The 'text' field is checked for existence but lacks a maximum length limit, potentially allowing DoS via resource exhaustion."
    },
    {
      id: "INPUT-FAIL-02",
      description: "Weak regex validation for email",
      tags: ["input-validation", "regex", "weak-validation"],
      criteriaTargeted: ["INPUT-C1"],
      changedFiles: [
        {
          path: "src/utils/validators.ts",
          content: `
export function isValidEmail(email: string) {
  // Flawed regex: allows invalid emails and might be vulnerable to ReDoS
  const regex = /^[a-z]+@[a-z]+\.[a-z]+$/;
  return regex.test(email);
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "INPUT-C1",
          expectedEvidence: [{ file: "src/utils/validators.ts", snippetSubstr: "/^[a-z]+@[a-z]+\\.[a-z]+$/" }]
        }
      ],
      rationale: "The custom regex is overly simplistic and potentially flawed. Developers should use robust, tested libraries (like validator.js) or native methods for email validation."
    },
    {
      id: "INPUT-FAIL-03",
      description: "Numeric input not checked for bounds",
      tags: ["input-validation", "numeric", "bounds"],
      criteriaTargeted: ["INPUT-C1"],
      changedFiles: [
        {
          path: "src/controllers/cart.ts",
          content: `
export async function updateQuantity(req, res) {
  const { quantity } = req.body;
  // Parses as int but doesn't check if it's negative or excessively large
  const qty = parseInt(quantity, 10);
  if (isNaN(qty)) return res.status(400).send();
  
  await db.query('UPDATE cart SET quantity = ? WHERE id = ?', [qty, req.user.cartId]);
  res.json({ success: true });
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "INPUT-C1",
          expectedEvidence: [{ file: "src/controllers/cart.ts", snippetSubstr: "if (isNaN(qty))" }]
        }
      ],
      rationale: "The quantity is parsed to an integer but lacks boundary checks (e.g., negative numbers, unrealistic maximums)."
    },
    {
      id: "INPUT-FAIL-04",
      description: "Unvalidated enum/allowed values",
      tags: ["input-validation", "enum", "allowed-values"],
      criteriaTargeted: ["INPUT-C1"],
      changedFiles: [
        {
          path: "src/controllers/settings.ts",
          content: `
export async function updateTheme(req, res) {
  const { theme } = req.body;
  // Accepts any string as theme without verifying it's one of the allowed values
  if (typeof theme !== 'string') return res.status(400).send();
  
  await db.query('UPDATE user_settings SET theme = ? WHERE user_id = ?', [theme, req.user.id]);
  res.json({ success: true });
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "INPUT-C1",
          expectedEvidence: [{ file: "src/controllers/settings.ts", snippetSubstr: "if (typeof theme !== 'string')" }]
        }
      ],
      rationale: "The input type is checked, but it fails to restrict the value to an allowed list (e.g., 'light', 'dark')."
    },
    {
      id: "INPUT-PASS-01",
      description: "Robust input validation using validator library",
      tags: ["input-validation", "secure", "validator"],
      criteriaTargeted: ["INPUT-C1"],
      changedFiles: [
        {
          path: "src/controllers/profile.ts",
          content: `
import validator from 'validator';

export async function updateProfile(req, res) {
  const { age, bio } = req.body;
  
  if (!validator.isInt(String(age), { min: 18, max: 120 })) {
    return res.status(400).send("Invalid age");
  }
  
  if (!validator.isLength(bio, { min: 0, max: 500 })) {
    return res.status(400).send("Bio too long");
  }
  
  await db.updateProfile(req.user.id, age, bio);
  res.json({ success: true });
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Uses a robust library to enforce type, range, and length limits strictly."
    },
    {
      id: "INPUT-NV-01",
      description: "Validation handled by external middleware",
      tags: ["input-validation", "middleware", "missing-context"],
      criteriaTargeted: ["INPUT-C1"],
      changedFiles: [
        {
          path: "src/routes/api.ts",
          content: `
import { validateProfileUpdate } from '../middleware/validators';
import { updateProfile } from '../controllers/profile';

// The validation logic inside validateProfileUpdate is not visible here
router.post('/profile', validateProfileUpdate, updateProfile);
`.trim()
        }
      ],
      expectedVerdict: "NOT_VERIFIED",
      rationale: "Validation is delegated to middleware whose implementation is not in the provided context."
    },

    // ═══════════════════════════════════════════════════════════════════
    // INPUT-C2: Input Sanitization
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "INPUT-FAIL-05",
      description: "Unsanitized input rendered in HTML template",
      tags: ["input-sanitization", "xss", "template"],
      criteriaTargeted: ["INPUT-C2"],
      changedFiles: [
        {
          path: "src/views/search.ts",
          content: `
export function renderSearchResults(query: string, results: any[]) {
  // Directly embedding raw query string into HTML output
  return \`
    <div>
      <h1>Search results for: \${query}</h1>
      <ul>
        \${results.map(r => \`<li>\${r.name}</li>\`).join('')}
      </ul>
    </div>
  \`;
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "INPUT-C2",
          expectedEvidence: [{ file: "src/views/search.ts", snippetSubstr: "Search results for: ${query}" }]
        }
      ],
      rationale: "Raw, unsanitized user input is embedded directly into an HTML string, leading to XSS."
    },
    {
      id: "INPUT-FAIL-06",
      description: "Storing raw rich text without sanitization",
      tags: ["input-sanitization", "rich-text"],
      criteriaTargeted: ["INPUT-C2"],
      changedFiles: [
        {
          path: "src/controllers/posts.ts",
          content: `
export async function createPost(req, res) {
  const { htmlContent } = req.body;
  // Accepts raw HTML from the client (e.g., WYSIWYG editor) and stores it directly
  await db.query('INSERT INTO posts (content) VALUES (?)', [htmlContent]);
  res.json({ success: true });
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "INPUT-C2",
          expectedEvidence: [{ file: "src/controllers/posts.ts", snippetSubstr: "INSERT INTO posts (content)" }]
        }
      ],
      rationale: "Rich text (HTML) from clients must be sanitized (e.g., with DOMPurify) before storage or rendering."
    },
    {
      id: "INPUT-FAIL-07",
      description: "Command injection due to unsanitized input",
      tags: ["input-sanitization", "command-injection"],
      criteriaTargeted: ["INPUT-C2"],
      changedFiles: [
        {
          path: "src/utils/network.ts",
          content: `
import { exec } from 'child_process';

export function pingHost(host: string, cb: (out: string) => void) {
  // Raw input passed into a shell command
  exec(\`ping -c 4 \${host}\`, (err, stdout) => {
    cb(stdout);
  });
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "INPUT-C2",
          expectedEvidence: [{ file: "src/utils/network.ts", snippetSubstr: "exec(`ping -c 4 ${host}`" }]
        }
      ],
      rationale: "User input is directly interpolated into a shell command without sanitization or escaping, leading to command injection."
    },
    {
      id: "INPUT-FAIL-08",
      description: "Path traversal via unsanitized filename",
      tags: ["input-sanitization", "path-traversal"],
      criteriaTargeted: ["INPUT-C2"],
      changedFiles: [
        {
          path: "src/controllers/files.ts",
          content: `
import fs from 'fs';
import path from 'path';

export function downloadFile(req, res) {
  const filename = req.query.file;
  // Unsanitized filename used in path resolution
  const filePath = path.join('/var/www/uploads', filename);
  res.download(filePath);
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "INPUT-C2",
          expectedEvidence: [{ file: "src/controllers/files.ts", snippetSubstr: "path.join('/var/www/uploads', filename)" }]
        }
      ],
      rationale: "The filename is not sanitized (e.g., stripping '../'), allowing path traversal attacks."
    },
    {
      id: "INPUT-PASS-02",
      description: "Sanitizing HTML input with DOMPurify",
      tags: ["input-sanitization", "secure", "dompurify"],
      criteriaTargeted: ["INPUT-C2"],
      changedFiles: [
        {
          path: "src/controllers/posts.ts",
          content: `
import DOMPurify from 'isomorphic-dompurify';

export async function createPost(req, res) {
  const { htmlContent } = req.body;
  // Safely sanitizing HTML before storage
  const cleanHtml = DOMPurify.sanitize(htmlContent);
  await db.query('INSERT INTO posts (content) VALUES (?)', [cleanHtml]);
  res.json({ success: true });
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Uses a recognized library to sanitize rich text input safely."
    },
    {
      id: "INPUT-PASS-03",
      description: "Path traversal prevention using basename",
      tags: ["input-sanitization", "secure", "path-traversal"],
      criteriaTargeted: ["INPUT-C2"],
      changedFiles: [
        {
          path: "src/controllers/files.ts",
          content: `
import path from 'path';

export function downloadFile(req, res) {
  const filename = req.query.file;
  // Sanitizing filename by extracting only the base name
  const safeFilename = path.basename(filename);
  const filePath = path.join('/var/www/uploads', safeFilename);
  res.download(filePath);
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "path.basename safely sanitizes the input to prevent directory traversal."
    },

    // ═══════════════════════════════════════════════════════════════════
    // INPUT-C3: Server-side Validation
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "INPUT-FAIL-09",
      description: "Client-side validation only (React form)",
      tags: ["server-side-validation", "client-only"],
      criteriaTargeted: ["INPUT-C3"],
      changedFiles: [
        {
          path: "src/components/SignupForm.tsx",
          content: `
import { useState } from 'react';

export function SignupForm() {
  const [email, setEmail] = useState('');
  
  const submit = async () => {
    // Client-side check
    if (!email.includes('@')) return alert('Invalid email');
    await fetch('/api/signup', { method: 'POST', body: JSON.stringify({ email }) });
  };
  
  return <input value={email} onChange={e => setEmail(e.target.value)} required />;
}
`.trim()
        },
        {
          path: "src/api/signup.ts",
          content: `
export async function signupHandler(req, res) {
  // Missing server-side validation!
  const { email } = req.body;
  await db.createUser(email);
  res.json({ success: true });
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "INPUT-C3",
          expectedEvidence: [{ file: "src/api/signup.ts", snippetSubstr: "const { email } = req.body;" }]
        }
      ],
      rationale: "Validation is performed in the React component, but the backend endpoint blindly trusts the input."
    },
    {
      id: "INPUT-FAIL-10",
      description: "HTML5 validation without backend enforcement",
      tags: ["server-side-validation", "html5-only"],
      criteriaTargeted: ["INPUT-C3"],
      changedFiles: [
        {
          path: "src/views/form.html",
          content: `
<form action="/api/submit" method="POST">
  <input type="text" name="username" required minlength="3" maxlength="20" />
  <button type="submit">Submit</button>
</form>
`.trim()
        },
        {
          path: "src/api/submit.ts",
          content: `
export function submitHandler(req, res) {
  // Relies entirely on HTML5 attributes, which are easily bypassed
  const username = req.body.username;
  db.saveUser(username);
  res.send('Saved');
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "INPUT-C3",
          expectedEvidence: [{ file: "src/api/submit.ts", snippetSubstr: "const username = req.body.username;" }]
        }
      ],
      rationale: "HTML5 validation is easily bypassed. The backend must enforce the same rules independently."
    },
    {
      id: "INPUT-FAIL-11",
      description: "Validation bypassed via API direct access",
      tags: ["server-side-validation", "api-bypass"],
      criteriaTargeted: ["INPUT-C3"],
      changedFiles: [
        {
          path: "src/api/update.ts",
          content: `
export function updateItem(req, res) {
  const { status } = req.body;
  // The frontend dropdown only allows 'open' or 'closed', but API accepts anything
  db.updateStatus(req.params.id, status);
  res.send('Updated');
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "INPUT-C3",
          expectedEvidence: [{ file: "src/api/update.ts", snippetSubstr: "db.updateStatus(req.params.id, status);" }]
        }
      ],
      rationale: "API endpoints must independently validate allowed values, regardless of UI constraints."
    },
    {
      id: "INPUT-PASS-04",
      description: "Server-side validation matching client rules",
      tags: ["server-side-validation", "secure"],
      criteriaTargeted: ["INPUT-C3"],
      changedFiles: [
        {
          path: "src/api/signup.ts",
          content: `
export async function signupHandler(req, res) {
  const { email } = req.body;
  
  // Server-side enforcement
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: "Invalid email" });
  }
  
  await db.createUser(email);
  res.json({ success: true });
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "The backend independently validates the input before processing."
    },

    // ═══════════════════════════════════════════════════════════════════
    // INPUT-C4: Dangerous Input Handling
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "INPUT-FAIL-12",
      description: "Type confusion crash (array passed instead of string)",
      tags: ["dangerous-input", "type-confusion", "crash"],
      criteriaTargeted: ["INPUT-C4"],
      changedFiles: [
        {
          path: "src/api/search.ts",
          content: `
export function searchHandler(req, res) {
  const term = req.query.q;
  // If ?q=1&q=2, 'term' is an array. Calling .toLowerCase() will crash the app.
  const query = term.toLowerCase();
  res.json(db.search(query));
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "INPUT-C4",
          expectedEvidence: [{ file: "src/api/search.ts", snippetSubstr: "const query = term.toLowerCase();" }]
        }
      ],
      rationale: "Express query parameters can be arrays. Assuming a string and calling string methods leads to unhandled exceptions."
    },
    {
      id: "INPUT-FAIL-13",
      description: "Null pointer dereference risk",
      tags: ["dangerous-input", "null-pointer"],
      criteriaTargeted: ["INPUT-C4"],
      changedFiles: [
        {
          path: "src/api/profile.ts",
          content: `
export function updateProfile(req, res) {
  const { preferences } = req.body;
  // If preferences is null, preferences.theme will throw a TypeError
  if (preferences.theme === 'dark') {
    db.setDarkTheme();
  }
  res.send('OK');
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "INPUT-C4",
          expectedEvidence: [{ file: "src/api/profile.ts", snippetSubstr: "if (preferences.theme === 'dark')" }]
        }
      ],
      rationale: "Failing to check for null or undefined before accessing properties causes crashes."
    },
    {
      id: "INPUT-FAIL-14",
      description: "Missing payload size limits (JSON parsing)",
      tags: ["dangerous-input", "payload-size", "dos"],
      criteriaTargeted: ["INPUT-C4"],
      changedFiles: [
        {
          path: "src/app.ts",
          content: `
import express from 'express';
const app = express();

// Missing explicit limit, defaults to 100kb but for some parsers can be unlimited
// A large payload can exhaust memory and cause DoS
app.use(express.json({ limit: '50mb' })); 
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "INPUT-C4",
          expectedEvidence: [{ file: "src/app.ts", snippetSubstr: "limit: '50mb'" }]
        }
      ],
      rationale: "Setting excessively large global payload limits (or omitting them) makes the app vulnerable to DoS via memory exhaustion."
    },
    {
      id: "INPUT-PASS-05",
      description: "Safely handling unexpected types",
      tags: ["dangerous-input", "secure", "type-checking"],
      criteriaTargeted: ["INPUT-C4"],
      changedFiles: [
        {
          path: "src/api/search.ts",
          content: `
export function searchHandler(req, res) {
  let term = req.query.q;
  // Safe handling: if it's an array, take the first element or reject
  if (Array.isArray(term)) {
    term = term[0];
  }
  
  if (typeof term !== 'string') {
    return res.status(400).send("Invalid query");
  }
  
  const query = term.toLowerCase();
  res.json(db.search(query));
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Explicit type checking and safe degradation prevent crashes from malformed input."
    },

    // ═══════════════════════════════════════════════════════════════════
    // INPUT-C5: File Upload Validation
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "INPUT-FAIL-15",
      description: "Unrestricted file upload (no limits or filters)",
      tags: ["file-upload", "unrestricted", "rce"],
      criteriaTargeted: ["INPUT-C5"],
      changedFiles: [
        {
          path: "src/routes/upload.ts",
          content: `
import multer from 'multer';
// No limits, no fileFilter
const upload = multer({ dest: 'public/uploads/' });

router.post('/upload', upload.single('file'), (req, res) => {
  res.json({ filename: req.file.filename });
});
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "INPUT-C5",
          expectedEvidence: [{ file: "src/routes/upload.ts", snippetSubstr: "multer({ dest: 'public/uploads/' })" }]
        }
      ],
      rationale: "Unrestricted uploads to a public directory can lead to Remote Code Execution (RCE) if executable files are uploaded."
    },
    {
      id: "INPUT-FAIL-16",
      description: "Trusting client-provided MIME type",
      tags: ["file-upload", "mime-spoofing"],
      criteriaTargeted: ["INPUT-C5"],
      changedFiles: [
        {
          path: "src/routes/upload.ts",
          content: `
import multer from 'multer';

const upload = multer({ 
  dest: 'uploads/',
  fileFilter: (req, file, cb) => {
    // Easily spoofed by the client!
    if (file.mimetype === 'image/jpeg') {
      cb(null, true);
    } else {
      cb(new Error('Only JPEGs allowed'));
    }
  }
});
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "INPUT-C5",
          expectedEvidence: [{ file: "src/routes/upload.ts", snippetSubstr: "file.mimetype === 'image/jpeg'" }]
        }
      ],
      rationale: "Client-provided MIME types (from the Content-Type header) can be trivially spoofed. Files should be validated by their contents (magic bytes)."
    },
    {
      id: "INPUT-FAIL-17",
      description: "Missing file size limits",
      tags: ["file-upload", "size-limit", "dos"],
      criteriaTargeted: ["INPUT-C5"],
      changedFiles: [
        {
          path: "src/routes/upload.ts",
          content: `
import multer from 'multer';

// Missing limits configuration
const upload = multer({ 
  dest: 'uploads/',
  fileFilter: mySafeFilter 
});
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "INPUT-C5",
          expectedEvidence: [{ file: "src/routes/upload.ts", snippetSubstr: "const upload = multer({" }]
        }
      ],
      rationale: "Without file size limits, attackers can upload massive files causing disk exhaustion (DoS)."
    },
    {
      id: "INPUT-FAIL-18",
      description: "Using original filename directly",
      tags: ["file-upload", "path-traversal"],
      criteriaTargeted: ["INPUT-C5"],
      changedFiles: [
        {
          path: "src/routes/upload.ts",
          content: `
import fs from 'fs';

export function handleUpload(req, res) {
  const file = req.files.doc;
  // Trusting client-provided filename without sanitization
  const path = '/var/www/uploads/' + file.name;
  file.mv(path, err => {
    res.send('Uploaded');
  });
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "INPUT-C5",
          expectedEvidence: [{ file: "src/routes/upload.ts", snippetSubstr: "const path = '/var/www/uploads/' + file.name;" }]
        }
      ],
      rationale: "Trusting the client-provided filename can lead to path traversal if the name contains '../'."
    },
    {
      id: "INPUT-PASS-06",
      description: "Robust file upload configuration",
      tags: ["file-upload", "secure", "multer"],
      criteriaTargeted: ["INPUT-C5"],
      changedFiles: [
        {
          path: "src/routes/upload.ts",
          content: `
import multer from 'multer';

const upload = multer({ 
  dest: 'uploads/', // Not publicly accessible
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    // Basic check here, robust magic byte check happens post-upload
    const ext = file.originalname.split('.').pop().toLowerCase();
    if (['jpg', 'png'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid extension'));
    }
  }
});
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Upload implements size limits and basic filtering, storing files in a non-public directory."
    },
    {
      id: "INPUT-PASS-07",
      description: "Validating file content via magic bytes",
      tags: ["file-upload", "secure", "magic-bytes"],
      criteriaTargeted: ["INPUT-C5"],
      changedFiles: [
        {
          path: "src/utils/file.ts",
          content: `
import { fileTypeFromFile } from 'file-type';
import fs from 'fs';

export async function processUpload(filePath) {
  const type = await fileTypeFromFile(filePath);
  if (!type || !['image/jpeg', 'image/png'].includes(type.mime)) {
    fs.unlinkSync(filePath);
    throw new Error('Invalid file content');
  }
  // Proceed with safe file
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Validating actual file contents (magic bytes) prevents MIME/extension spoofing."
    },
    {
      id: "INPUT-NV-02",
      description: "No file upload logic in context",
      tags: ["file-upload", "not-applicable"],
      criteriaTargeted: ["INPUT-C5"],
      changedFiles: [
        {
          path: "src/api/ping.ts",
          content: `
export function ping(req, res) {
  res.json({ pong: true });
}
`.trim()
        }
      ],
      expectedVerdict: "NOT_VERIFIED",
      rationale: "The changed code does not include any file upload functionality."
    },

    // ═══════════════════════════════════════════════════════════════════
    // INPUT-C6: Schema Validation
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "INPUT-FAIL-19",
      description: "Manual extraction instead of schema validation",
      tags: ["schema-validation", "manual-extraction"],
      criteriaTargeted: ["INPUT-C6"],
      changedFiles: [
        {
          path: "src/controllers/api.ts",
          content: `
export async function createItem(req, res) {
  // No formal schema validation
  const name = req.body.name;
  const description = req.body.description || '';
  const price = parseFloat(req.body.price);
  
  if (!name || isNaN(price)) {
    return res.status(400).send();
  }
  
  await db.insertItem(name, description, price);
  res.json({ success: true });
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "INPUT-C6",
          expectedEvidence: [{ file: "src/controllers/api.ts", snippetSubstr: "const name = req.body.name;" }]
        }
      ],
      rationale: "Manual field extraction is error-prone and doesn't enforce strict structural validation. A schema library should be used."
    },
    {
      id: "INPUT-FAIL-20",
      description: "Schema validation that allows unknown fields",
      tags: ["schema-validation", "unknown-fields"],
      criteriaTargeted: ["INPUT-C6"],
      changedFiles: [
        {
          path: "src/controllers/api.ts",
          content: `
import Joi from 'joi';

const schema = Joi.object({
  username: Joi.string().required()
}).unknown(true); // Explicitly allows and retains unknown fields

export async function updateUser(req, res) {
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).send();
  
  // 'value' might contain unexpected fields (like 'role: admin')
  await db.updateUser(req.user.id, value);
  res.json({ success: true });
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "INPUT-C6",
          expectedEvidence: [{ file: "src/controllers/api.ts", snippetSubstr: ".unknown(true)" }]
        }
      ],
      rationale: "Allowing unknown fields in the schema defeats structural enforcement and can lead to mass assignment vulnerabilities."
    },
    {
      id: "INPUT-FAIL-21",
      description: "Schema validation errors not handled properly",
      tags: ["schema-validation", "error-handling"],
      criteriaTargeted: ["INPUT-C6"],
      changedFiles: [
        {
          path: "src/controllers/api.ts",
          content: `
import { z } from 'zod';

const schema = z.object({ name: z.string() });

export async function createItem(req, res) {
  // Uses parse instead of safeParse, throws unhandled error on invalid input
  const data = schema.parse(req.body);
  
  await db.insertItem(data.name);
  res.json({ success: true });
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "INPUT-C6",
          expectedEvidence: [{ file: "src/controllers/api.ts", snippetSubstr: "schema.parse(req.body)" }]
        }
      ],
      rationale: "Uncaught schema validation exceptions cause 500 errors or app crashes, rather than returning proper 400 Bad Request responses."
    },
    {
      id: "INPUT-PASS-08",
      description: "Robust schema validation with Zod",
      tags: ["schema-validation", "secure", "zod"],
      criteriaTargeted: ["INPUT-C6"],
      changedFiles: [
        {
          path: "src/controllers/api.ts",
          content: `
import { z } from 'zod';

const userSchema = z.object({
  email: z.string().email(),
  age: z.number().int().min(18).max(120),
}).strict(); // Strips/rejects unknown fields

export async function createUser(req, res) {
  const parsed = userSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error);
  }
  
  await db.createUser(parsed.data);
  res.json({ success: true });
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Zod is used to strictly validate the schema, rejecting unknown fields and handling errors safely."
    },
    {
      id: "INPUT-PASS-09",
      description: "Validation pipe in NestJS",
      tags: ["schema-validation", "secure", "nestjs"],
      criteriaTargeted: ["INPUT-C6"],
      changedFiles: [
        {
          path: "src/controllers/users.ts",
          content: `
import { Controller, Post, Body, ValidationPipe } from '@nestjs/common';
import { CreateUserDto } from './dto';

@Controller('users')
export class UsersController {
  @Post()
  create(@Body(new ValidationPipe({ whitelist: true })) createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Uses framework-provided schema validation (ValidationPipe) with strict whitelisting to strip unknown fields."
    },
    {
      id: "INPUT-NV-03",
      description: "Schema validation enforced by API Gateway",
      tags: ["schema-validation", "missing-context", "api-gateway"],
      criteriaTargeted: ["INPUT-C6"],
      changedFiles: [
        {
          path: "src/handlers/lambda.ts",
          content: `
export async function handler(event) {
  // Assuming API Gateway handles OpenAPI schema validation before invoking Lambda
  const data = JSON.parse(event.body);
  await db.save(data);
  return { statusCode: 200 };
}
`.trim()
        }
      ],
      expectedVerdict: "NOT_VERIFIED",
      rationale: "Schema validation is likely handled by an external API Gateway, which is not visible in the provided code."
    },

    // ═══════════════════════════════════════════════════════════════════
    // Cross-Cutting Scenarios
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "INPUT-PASS-10",
      description: "Perfectly validated endpoint (all criteria met)",
      tags: ["comprehensive", "secure"],
      criteriaTargeted: ["INPUT-C1", "INPUT-C2", "INPUT-C3", "INPUT-C4", "INPUT-C6"],
      changedFiles: [
        {
          path: "src/api/profile.ts",
          content: `
import { z } from 'zod';
import DOMPurify from 'isomorphic-dompurify';

const schema = z.object({
  bio: z.string().max(500),
}).strict();

export async function updateProfile(req, res) {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input' });
  }
  
  const cleanBio = DOMPurify.sanitize(parsed.data.bio);
  await db.update(req.user.id, cleanBio);
  res.json({ success: true });
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Implements strict schema validation, safe error handling, length limits, and HTML sanitization."
    },
    {
      id: "INPUT-NV-04",
      description: "PR only modifies documentation files",
      tags: ["unrelated", "docs-only"],
      criteriaTargeted: [],
      changedFiles: [
        {
          path: "README.md",
          content: `
# Input Validation Module
This module handles validation.
`.trim()
        }
      ],
      expectedVerdict: "NOT_VERIFIED", // or PASS depending on strictness, but NV fits better for no logic
      rationale: "No code related to input validation is present in the PR."
    },
    {
      id: "INPUT-NV-04",
      description: "tc_025 style opaque paymentGateway.charge wrapper",
      tags: ["delegated", "hidden-implementation"],
      criteriaTargeted: ["INPUT-C1"],
      changedFiles: [
        {
          path: "src/services/payment.ts",
          content: `
export const processPayment = async (amount: number, card: string) => {
  return await paymentGateway.charge(amount, card);
};
`.trim()
        }
      ],
      expectedVerdict: "NOT_VERIFIED",
      rationale: "The handling of sensitive card data is entirely delegated to an opaque paymentGateway implementation. There is no concrete security behavior to evaluate here."
    }
  ]
};
