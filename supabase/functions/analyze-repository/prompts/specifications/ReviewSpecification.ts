// ─── Review Specification Format ─────────────────────────────────
// Canonical type definition for security review checkpoint specs.
// Every checkpoint (Authentication, Authorization, XSS, etc.)
// exports a const satisfying this interface.
//
// This is a type definition file — no business logic.

/**
 * A single evaluation criterion within a checkpoint.
 * Severity is intentionally omitted — the AI determines severity
 * based on the specific finding and evidence at review time.
 */
export interface EvaluationCriterion {
  id: string;              // e.g. "AUTH-C1"
  name: string;            // e.g. "Password Hashing"
  description: string;     // e.g. "Passwords must be hashed using bcrypt, scrypt, or Argon2"
}

/**
 * Complete specification for a single security review checkpoint.
 *
 * The CheckpointRunner renders this into the LLM prompt.
 * The Orchestrator iterates over a list of these to execute all
 * mandatory security controls.
 */
export interface ReviewSpecification {
  // ─── Identity ─────────────────────────────────────────
  id: string;                        // "SEC-AUTH-001"
  name: string;                      // "Authentication Review"
  version: string;                   // "1.0" — for AI Eval tracking
  category: string;                  // "authentication"

  // ─── Description ──────────────────────────────────────
  description: string;               // What this checkpoint evaluates

  // ─── Evaluation Criteria ──────────────────────────────
  criteria: EvaluationCriterion[];   // Structured list of what to check

  // ─── Prompt Instruction ───────────────────────────────
  promptInstruction: string;         // Additional guidance, edge cases, nuance
}
