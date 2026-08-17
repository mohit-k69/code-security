// ─── Authorization Security Checkpoint ───────────────────────────
// SEC-AUTHZ-001 — Authorization Review v1.0
//
// Determines whether authenticated users can only access data and
// perform actions they are explicitly authorized to access or perform.
//
// Covers resource ownership, server-side enforcement, admin access,
// privilege escalation, multi-tenant isolation, and sensitive
// operation authorization.

import type { ReviewSpecification } from "./ReviewSpecification.ts";

export const AuthorizationSpec: ReviewSpecification = {
  id: "SEC-AUTHZ-001",
  name: "Authorization Review",
  version: "1.0",
  category: "authorization",

  description:
    "Determines whether authenticated users can only access data and perform " +
    "actions they are explicitly authorized to access or perform. Evaluates " +
    "resource ownership verification, server-side authorization enforcement, " +
    "administrative access protection, privilege escalation prevention, " +
    "multi-tenant data isolation, and sensitive operation authorization.",

  criteria: [
    // ────────────────────────────────────────────────────────────────
    // C1 — Resource Ownership
    // ────────────────────────────────────────────────────────────────
    {
      id: "AUTHZ-C1",
      name: "Resource Ownership",
      description:
        "Users must only be able to access resources they own or are explicitly " +
        "permitted to access. Every data retrieval, update, and deletion that " +
        "accepts a user-controlled resource identifier (ID, slug, UUID) must " +
        "verify that the requesting user is the owner or has an explicit grant. " +
        "Direct Object Reference (IDOR) vulnerabilities occur when resource " +
        "lookups use a client-supplied ID without filtering by the authenticated " +
        "user's identity.\n\n" +
        "PASS: All resource access paths include ownership verification " +
        "(e.g., WHERE id = ? AND user_id = ?, or an explicit permission check " +
        "before returning data). No user-controlled IDs are used for lookups " +
        "without ownership filtering.\n" +
        "FAIL: A resource is fetched, updated, or deleted using only a " +
        "client-supplied ID without verifying the requesting user owns or has " +
        "permission to access it (IDOR). Or ownership checks can be bypassed " +
        "via parameter manipulation.\n" +
        "NOT_VERIFIED: Resource ownership logic is delegated to a data access " +
        "layer, ORM policy, or middleware not included in the provided context.",
    },

    // ────────────────────────────────────────────────────────────────
    // C2 — Server-side Authorization Enforcement
    // ────────────────────────────────────────────────────────────────
    {
      id: "AUTHZ-C2",
      name: "Server-side Authorization Enforcement",
      description:
        "Authorization decisions must be enforced on the server (backend API, " +
        "edge function, or server component). Client-side checks (hiding UI " +
        "elements, disabling buttons, conditional rendering based on role) are " +
        "for UX only and must never be the sole authorization mechanism. " +
        "Every API endpoint that serves protected data or performs protected " +
        "actions must independently validate the caller's permissions.\n\n" +
        "PASS: Authorization is enforced server-side via middleware, guards, " +
        "or inline checks before data access or mutation. Client-side checks " +
        "exist only as complementary UX.\n" +
        "FAIL: Authorization is performed only on the client (e.g., checking " +
        "role in React state, hiding admin routes in the frontend router, " +
        "conditional rendering without a corresponding server check). Or the " +
        "API endpoint returns data without verifying permissions.\n" +
        "NOT_VERIFIED: The server-side handler delegates authorization to " +
        "middleware or a framework feature not visible in the provided files.",
    },

    // ────────────────────────────────────────────────────────────────
    // C3 — Administrative Access Protection
    // ────────────────────────────────────────────────────────────────
    {
      id: "AUTHZ-C3",
      name: "Administrative Access Protection",
      description:
        "Administrative functionality (user management, system configuration, " +
        "audit logs, billing management, feature flags) must be accessible " +
        "only to users with an explicit administrator role or permission. " +
        "Admin routes and endpoints must be protected by role-checking " +
        "middleware or guards. Admin panels must not be accessible by " +
        "simply knowing the URL path.\n\n" +
        "PASS: All admin routes and endpoints are protected by role/permission " +
        "checks (e.g., requireRole('admin'), isAdmin middleware). Admin " +
        "functionality cannot be accessed by regular users.\n" +
        "FAIL: Admin routes lack role guards, admin endpoints are accessible " +
        "to any authenticated user, or admin checks rely on client-side " +
        "routing only. Security-through-obscurity (hiding the URL) is not " +
        "acceptable.\n" +
        "NOT_VERIFIED: Admin route protection is configured in a routing " +
        "file, gateway, or middleware layer not included in the context.",
    },

    // ────────────────────────────────────────────────────────────────
    // C4 — Privilege Escalation Prevention
    // ────────────────────────────────────────────────────────────────
    {
      id: "AUTHZ-C4",
      name: "Privilege Escalation Prevention",
      description:
        "Users must not be able to gain higher privileges than those explicitly " +
        "assigned to them. Check for: users setting their own role via request " +
        "body (mass assignment), modifying role/permission fields in profile " +
        "update endpoints, parameter injection in invitation or registration " +
        "flows (e.g., role=admin in signup body), JWT claims that can be " +
        "manipulated without server validation, and inconsistent permission " +
        "checks across related endpoints.\n\n" +
        "PASS: Role and permission fields are protected from user modification. " +
        "Update endpoints explicitly whitelist allowed fields. Role assignment " +
        "is restricted to authorized administrators only.\n" +
        "FAIL: Users can set or modify their own role/permissions via API " +
        "parameters. Mass assignment allows role escalation. Registration " +
        "or invitation flows accept a role parameter without validation. " +
        "Or permission checks are inconsistent (e.g., read is checked but " +
        "write is not).\n" +
        "NOT_VERIFIED: Role management logic is handled by an IAM system, " +
        "ORM guard, or middleware not visible in the provided files.",
    },

    // ────────────────────────────────────────────────────────────────
    // C5 — Multi-tenant Isolation
    // ────────────────────────────────────────────────────────────────
    {
      id: "AUTHZ-C5",
      name: "Multi-tenant Isolation",
      description:
        "In multi-tenant systems, users must not be able to access, modify, " +
        "or delete data belonging to another organization, workspace, or " +
        "tenant. Every database query in a multi-tenant context must include " +
        "a tenant filter (e.g., WHERE tenant_id = ?). Tenant identifiers " +
        "must be derived from the authenticated session, not from request " +
        "parameters that can be manipulated. Cross-tenant references via " +
        "foreign keys or shared resources must be validated.\n\n" +
        "PASS: All data queries are scoped to the authenticated user's tenant. " +
        "Tenant ID is derived from the session/token, not from user input. " +
        "Cross-tenant access is explicitly prevented.\n" +
        "FAIL: Queries lack tenant filtering, tenant ID comes from request " +
        "parameters instead of the authenticated session, or cross-tenant " +
        "data access is possible via ID manipulation.\n" +
        "NOT_VERIFIED: Multi-tenancy is not applicable (single-tenant app), " +
        "or tenant scoping is enforced at the database/ORM layer not visible " +
        "in the provided files.",
    },

    // ────────────────────────────────────────────────────────────────
    // C6 — Sensitive Operation Authorization
    // ────────────────────────────────────────────────────────────────
    {
      id: "AUTHZ-C6",
      name: "Sensitive Operation Authorization",
      description:
        "High-risk operations must perform explicit authorization checks " +
        "before execution. Sensitive operations include: resource deletion, " +
        "bulk updates, billing and payment changes, system configuration " +
        "changes, user account management (invite, suspend, delete), " +
        "API key generation or revocation, and data export. These operations " +
        "must verify the caller has the specific permission required, not " +
        "just that they are authenticated.\n\n" +
        "PASS: Sensitive operations include authorization checks that verify " +
        "the caller's specific permission (e.g., canDelete, canManageBilling). " +
        "Authorization is checked before the operation executes.\n" +
        "FAIL: Sensitive operations are accessible to any authenticated user " +
        "without permission checks. Or authorization is checked after the " +
        "operation has already executed (check-then-act race condition). " +
        "Or bulk operations bypass per-resource authorization.\n" +
        "NOT_VERIFIED: Authorization for sensitive operations is handled by " +
        "a policy engine or middleware not visible in the provided files.",
    },
  ],

  promptInstruction:
    "Focus your analysis on the changed files. For each criterion, determine " +
    "whether the code introduces, modifies, or fails to address the authorization concern.\n\n" +

    "### Finding Requirements\n\n" +
    "Every finding MUST include:\n" +
    "1. **criterionId** — The exact criterion ID (AUTHZ-C1 through AUTHZ-C6) this finding relates to.\n" +
    "2. **evidence** — At least one evidence entry with the exact file path, line number, " +
    "and code snippet from the provided context. Never fabricate evidence.\n" +
    "3. **risk** — A clear description of the security risk (e.g., 'An attacker could access " +
    "any user\\'s order by changing the order ID in the URL').\n" +
    "4. **remediation** — A concrete, implementable fix (not generic advice).\n\n" +

    "### Verdict Assignment Rules\n\n" +
    "- Report each distinct issue as a separate finding.\n" +
    "- A single criterion can have multiple findings if multiple issues exist.\n" +
    "- If a criterion is not applicable to the changed code (e.g., no admin routes exist " +
    "in the PR), do not report it as a finding — note its absence in the summary.\n" +
    "- If a criterion cannot be fully evaluated because required context (middleware, " +
    "ORM policies, IAM configuration) is missing, use NOT_VERIFIED rather than assumptions.\n" +
    "- Never infer vulnerabilities without sufficient code evidence. If you suspect an issue " +
    "but lack evidence, flag it as NOT_VERIFIED with an explanation, not as FAIL.\n\n" +

    "### Analysis Priorities\n\n" +
    "- IDOR / missing ownership checks (AUTHZ-C1) are almost always **critical** severity.\n" +
    "- Privilege escalation (AUTHZ-C4) and multi-tenant isolation failures (AUTHZ-C5) " +
    "are almost always **critical** severity.\n" +
    "- Missing admin guards (AUTHZ-C3) are typically **critical** if admin data is exposed.\n" +
    "- Client-only enforcement (AUTHZ-C2) is **warning** if no server check is visible, " +
    "**critical** if the API endpoint is confirmed to lack authorization.\n" +
    "- Missing authorization on non-destructive read operations is typically **warning**; " +
    "missing authorization on write/delete operations is typically **critical**.\n\n" +

    "### Authorization vs Authentication\n\n" +
    "This checkpoint evaluates AUTHORIZATION (what an authenticated user can do), " +
    "not AUTHENTICATION (whether the user is who they claim to be). If an endpoint " +
    "lacks authentication entirely, that is an authentication finding (SEC-AUTH-001), " +
    "not an authorization finding. However, if an endpoint authenticates the user but " +
    "does not check whether that user is authorized for the specific action, that IS " +
    "an authorization finding for this checkpoint.",
};
