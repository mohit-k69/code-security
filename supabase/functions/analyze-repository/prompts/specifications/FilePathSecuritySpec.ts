import type { ReviewSpecification } from "./ReviewSpecification.ts";

export const FilePathSecuritySpec: ReviewSpecification = {
  id: "SEC-FILE-001",
  name: "File & Path Security Review",
  version: "1.0",
  category: "file-system",

  description:
    "Determines whether the application securely handles file uploads, downloads, " +
    "filesystem access, archive extraction, and path construction. Evaluates protections " +
    "against path traversal, insecure uploads, unauthorized downloads, and Zip Slip.",

  criteria: [
    // ────────────────────────────────────────────────────────────────
    // C1 — Path Traversal
    // ────────────────────────────────────────────────────────────────
    {
      id: "FILE-C1",
      name: "Path Traversal",
      description:
        "User-controlled input must not be able to manipulate filesystem paths " +
        "to access directories outside the intended scope. Detect path traversal " +
        "vulnerabilities (e.g., `../`, `..\\`, absolute path injection, or unsafe concatenation).\n\n" +
        "PASS: User input used in paths is strictly validated, sanitized using methods " +
        "like `path.basename()`, or resolved and checked to ensure it remains within a safe base directory.\n" +
        "FAIL: User input is directly concatenated into a file path (e.g., `fs.readFile(dir + '/' + userInput)`) " +
        "without validation, allowing an attacker to escape the directory.\n" +
        "NOT_VERIFIED: File paths are completely static and server-controlled, or abstracted by an external system.",
    },

    // ────────────────────────────────────────────────────────────────
    // C2 — File Upload Security
    // ────────────────────────────────────────────────────────────────
    {
      id: "FILE-C2",
      name: "File Upload Security",
      description:
        "Uploaded files must be securely validated before storage or processing to prevent " +
        "the execution of malicious payloads. This includes validating allowed file types, " +
        "extensions, and MIME types, and preventing executable uploads.\n\n" +
        "PASS: Uploaded files are strictly validated against an allowlist of safe extensions " +
        "and their content (magic bytes) is verified to match the extension.\n" +
        "FAIL: The application relies solely on the client-provided `Content-Type` header, " +
        "allows dangerous extensions (e.g., `.php`, `.exe`, `.sh`), or fails to rename files " +
        "securely, risking file overwrite or execution.\n" +
        "NOT_VERIFIED: Uploads are handled entirely by a direct-to-cloud-storage mechanism " +
        "(e.g., pre-signed S3 URLs) where backend validation code is not present.",
    },

    // ────────────────────────────────────────────────────────────────
    // C3 — File Download Authorization
    // ────────────────────────────────────────────────────────────────
    {
      id: "FILE-C3",
      name: "File Download Authorization",
      description:
        "Users must only be able to download files they are explicitly authorized to access. " +
        "Detect insecure direct object references (IDOR) involving file downloads.\n\n" +
        "PASS: The download endpoint verifies the requesting user's identity and checks their " +
        "authorization against the specific file record in the database before serving the file.\n" +
        "FAIL: The endpoint blindly serves the requested file ID without checking if the user " +
        "owns or has permission to view that file.\n" +
        "NOT_VERIFIED: Download logic is not present in the provided context.",
    },

    // ────────────────────────────────────────────────────────────────
    // C4 — File Storage & Permissions
    // ────────────────────────────────────────────────────────────────
    {
      id: "FILE-C4",
      name: "File Storage & Permissions",
      description:
        "Uploaded or generated files must be stored securely. Detect public storage of " +
        "sensitive files, insecure file permissions, executable upload directories, or " +
        "unintended file overwrites.\n\n" +
        "PASS: Uploads are stored in a non-executable, private directory (or private cloud bucket) " +
        "and filenames are randomized to prevent collisions and overwrites.\n" +
        "FAIL: Uploads are stored in the web root allowing direct execution, sensitive files " +
        "are saved with overly permissive permissions (e.g., `0777`), or user-provided filenames " +
        "are trusted, allowing attackers to overwrite existing critical files.\n" +
        "NOT_VERIFIED: File storage infrastructure configuration is missing.",
    },

    // ────────────────────────────────────────────────────────────────
    // C5 — Archive & File Extraction Security
    // ────────────────────────────────────────────────────────────────
    {
      id: "FILE-C5",
      name: "Archive & File Extraction Security",
      description:
        "ZIP, TAR, and similar archives must be extracted safely. Detect 'Zip Slip' vulnerabilities " +
        "where an archive contains files with traversal paths (e.g., `../../../etc/passwd`) that " +
        "extract outside the intended directory.\n\n" +
        "PASS: The extraction logic verifies that the fully resolved path of every extracted " +
        "file strictly begins with the intended target extraction directory.\n" +
        "FAIL: The application extracts archive entries by directly joining the target directory " +
        "with the entry name without verifying the resulting canonical path.\n" +
        "NOT_VERIFIED: The application does not perform archive extraction.",
    },

    // ────────────────────────────────────────────────────────────────
    // C6 — Symbolic Link & Filesystem Abuse
    // ────────────────────────────────────────────────────────────────
    {
      id: "FILE-C6",
      name: "Symbolic Link & Filesystem Abuse",
      description:
        "The application must safely handle symbolic links and complex filesystem references. " +
        "Detect access to unintended files through symlinks or unsafe filesystem operations.\n\n" +
        "PASS: The application resolves real paths (e.g., `fs.realpath`) and verifies them " +
        "before performing operations, or disables following symlinks when reading archives/directories.\n" +
        "FAIL: The application blindly follows user-provided symlinks or creates symlinks based " +
        "on untrusted input, allowing attackers to read or write arbitrary files.\n" +
        "NOT_VERIFIED: The application does not handle symlinks or complex filesystem operations.",
    },
  ],

  promptInstruction:
    "Focus your analysis on the changed files. For each criterion, determine " +
    "whether the code introduces, modifies, or fails to address the file/path security concern.\n\n" +

    "### Finding Requirements\n\n" +
    "Every finding MUST include:\n" +
    "1. **criterionId** — The exact criterion ID (FILE-C1 through FILE-C6) this finding relates to.\n" +
    "2. **evidence** — At least one evidence entry with the exact file path, line number, " +
    "and code snippet from the provided context. Never fabricate evidence.\n" +
    "3. **risk** — A clear description of the security risk (e.g., 'Concatenating user input into " +
    "fs.readFile allows attackers to read arbitrary files like /etc/passwd').\n" +
    "4. **remediation** — A concrete, implementable fix.\n\n" +

    "### Verdict Assignment Rules\n\n" +
    "- Report each distinct issue as a separate finding.\n" +
    "- Distinguish between trusted server-controlled paths (e.g., `require('./config/' + env)`) and " +
    "user-controlled paths (`req.query.file`). Only flag user-controlled paths.\n" +
    "- Unsafe path concatenation leading to Path Traversal (FILE-C1) is a **FAIL** and a critical vulnerability.\n" +
    "- Archive extraction lacking path boundary checks (Zip Slip, FILE-C5) is a **FAIL**.\n" +
    "- Trusting user-provided filenames during upload/save operations without sanitization or randomization " +
    "risks file overwrites (FILE-C4) and is a **FAIL**.\n" +
    "- Never infer filesystem vulnerabilities without explicit code evidence.",
};
