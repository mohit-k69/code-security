import type { EvalDataset } from "../types.ts";

export const AuthorizationEvalDataset: EvalDataset = {
  checkpointId: "SEC-AUTHZ-001",
  version: "1.0",
  scenarios: [
    // ═══════════════════════════════════════════════════════════════════
    // AUTHZ-C1: Resource Ownership
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "AUTHZ-FAIL-01",
      description: "IDOR: Order fetched by ID without ownership verification",
      tags: ["idor", "resource-ownership", "missing-filter"],
      criteriaTargeted: ["AUTHZ-C1"],
      changedFiles: [
        {
          path: "src/routes/orders.ts",
          content: `
import express from 'express';
import { requireAuth } from '../middleware';

const router = express.Router();

router.get('/orders/:id', requireAuth, async (req, res) => {
  // No ownership check — any authenticated user can access any order
  const order = await db.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!order) return res.status(404).send();
  res.json(order);
});

export default router;
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTHZ-C1",
          expectedEvidence: [{ file: "src/routes/orders.ts", snippetSubstr: "WHERE id = ?" }]
        }
      ],
      rationale: "Query uses only the client-supplied ID without filtering by user_id. Any authenticated user can read any order."
    },
    {
      id: "AUTHZ-FAIL-02",
      description: "IDOR: User profile update without ownership check",
      tags: ["idor", "resource-ownership", "update"],
      criteriaTargeted: ["AUTHZ-C1"],
      changedFiles: [
        {
          path: "src/controllers/users.ts",
          content: `
export async function updateProfile(req, res) {
  const { name, bio } = req.body;
  // Updates any user profile by ID from URL — no check that req.user.id === req.params.id
  await db.query('UPDATE users SET name = ?, bio = ? WHERE id = ?', [name, bio, req.params.id]);
  res.json({ success: true });
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTHZ-C1",
          expectedEvidence: [{ file: "src/controllers/users.ts", snippetSubstr: "WHERE id = ?', [name, bio, req.params.id]" }]
        }
      ],
      rationale: "Profile update uses req.params.id without verifying the authenticated user owns the profile."
    },
    {
      id: "AUTHZ-FAIL-03",
      description: "IDOR: Document deletion without ownership verification",
      tags: ["idor", "resource-ownership", "delete"],
      criteriaTargeted: ["AUTHZ-C1"],
      changedFiles: [
        {
          path: "src/routes/documents.ts",
          content: `
import { requireAuth } from '../middleware';

router.delete('/documents/:docId', requireAuth, async (req, res) => {
  await db.query('DELETE FROM documents WHERE id = ?', [req.params.docId]);
  res.json({ deleted: true });
});
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTHZ-C1",
          expectedEvidence: [{ file: "src/routes/documents.ts", snippetSubstr: "DELETE FROM documents WHERE id = ?" }]
        }
      ],
      rationale: "Any authenticated user can delete any document — no ownership filter."
    },
    {
      id: "AUTHZ-PASS-01",
      description: "Order fetched with ownership filter in query",
      tags: ["resource-ownership", "secure", "ownership-filter"],
      criteriaTargeted: ["AUTHZ-C1"],
      changedFiles: [
        {
          path: "src/routes/orders.ts",
          content: `
import express from 'express';
import { requireAuth } from '../middleware';

const router = express.Router();

router.get('/orders/:id', requireAuth, async (req, res) => {
  const order = await db.query(
    'SELECT * FROM orders WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id]
  );
  if (!order) return res.status(404).send();
  res.json(order);
});

export default router;
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Query includes user_id filter ensuring ownership verification."
    },
    {
      id: "AUTHZ-NV-01",
      description: "Ownership check delegated to ORM policy layer",
      tags: ["resource-ownership", "missing-context", "orm"],
      criteriaTargeted: ["AUTHZ-C1"],
      changedFiles: [
        {
          path: "src/routes/orders.ts",
          content: `
import { requireAuth } from '../middleware';
import { OrderRepository } from '../repositories/OrderRepository';

router.get('/orders/:id', requireAuth, async (req, res) => {
  // OrderRepository.findForUser may enforce ownership — implementation not shown
  const order = await OrderRepository.findForUser(req.params.id, req.user.id);
  if (!order) return res.status(404).send();
  res.json(order);
});
`.trim()
        }
      ],
      expectedVerdict: "NOT_VERIFIED",
      rationale: "Ownership enforcement is delegated to OrderRepository.findForUser which is not included in the context."
    },

    // ═══════════════════════════════════════════════════════════════════
    // AUTHZ-C2: Server-side Authorization Enforcement
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "AUTHZ-FAIL-04",
      description: "Authorization enforced only in React frontend, not on API",
      tags: ["client-only", "server-side", "frontend-guard"],
      criteriaTargeted: ["AUTHZ-C2"],
      changedFiles: [
        {
          path: "src/pages/AdminDashboard.tsx",
          content: `
import { useAuth } from '../hooks/useAuth';

export function AdminDashboard() {
  const { user } = useAuth();
  
  // Client-side guard only
  if (user.role !== 'admin') {
    return <div>Access Denied</div>;
  }
  
  return <DashboardContent />;
}
`.trim()
        },
        {
          path: "src/api/admin.ts",
          content: `
import { requireAuth } from '../middleware';

// API endpoint has no role check — any authenticated user can call it
router.get('/api/admin/stats', requireAuth, async (req, res) => {
  const stats = await db.query('SELECT COUNT(*) as total FROM users');
  res.json(stats);
});
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTHZ-C2",
          expectedEvidence: [{ file: "src/api/admin.ts", snippetSubstr: "requireAuth, async (req, res)" }]
        }
      ],
      rationale: "The API endpoint only checks authentication (requireAuth), not authorization (role/permission). The admin guard exists only in the React frontend."
    },
    {
      id: "AUTHZ-FAIL-05",
      description: "API returns data based on client-supplied role header",
      tags: ["client-only", "server-side", "header-trust"],
      criteriaTargeted: ["AUTHZ-C2"],
      changedFiles: [
        {
          path: "src/routes/data.ts",
          content: `
router.get('/api/reports', requireAuth, async (req, res) => {
  // Trusting client-supplied header for authorization
  const role = req.headers['x-user-role'];
  if (role === 'manager') {
    const reports = await db.query('SELECT * FROM reports');
    return res.json(reports);
  }
  res.status(403).send();
});
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTHZ-C2",
          expectedEvidence: [{ file: "src/routes/data.ts", snippetSubstr: "req.headers['x-user-role']" }]
        }
      ],
      rationale: "Authorization decision is based on a client-supplied header that can be trivially forged."
    },
    {
      id: "AUTHZ-PASS-02",
      description: "Server-side role check with session-derived permissions",
      tags: ["server-side", "secure", "role-check"],
      criteriaTargeted: ["AUTHZ-C2"],
      changedFiles: [
        {
          path: "src/routes/reports.ts",
          content: `
import { requireAuth, requireRole } from '../middleware';

router.get('/api/reports', requireAuth, requireRole('manager'), async (req, res) => {
  const reports = await db.query(
    'SELECT * FROM reports WHERE department_id = ?',
    [req.user.departmentId]
  );
  res.json(reports);
});
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Server-side role enforcement via requireRole middleware with data scoped to user's department."
    },

    // ═══════════════════════════════════════════════════════════════════
    // AUTHZ-C3: Administrative Access Protection
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "AUTHZ-FAIL-06",
      description: "Admin user listing endpoint without role guard",
      tags: ["admin", "missing-guard", "user-listing"],
      criteriaTargeted: ["AUTHZ-C3"],
      changedFiles: [
        {
          path: "src/routes/admin.ts",
          content: `
import express from 'express';
import { requireAuth } from '../middleware';

const router = express.Router();

// No admin role check — any authenticated user can list all users
router.get('/admin/users', requireAuth, async (req, res) => {
  const users = await db.query('SELECT id, email, role FROM users');
  res.json(users);
});

export default router;
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTHZ-C3",
          expectedEvidence: [{ file: "src/routes/admin.ts", snippetSubstr: "router.get('/admin/users', requireAuth," }]
        }
      ],
      rationale: "Admin endpoint only requires authentication, not admin role — any authenticated user can list all users."
    },
    {
      id: "AUTHZ-FAIL-07",
      description: "Admin configuration endpoint with inline check that can be bypassed",
      tags: ["admin", "bypassable-check", "configuration"],
      criteriaTargeted: ["AUTHZ-C3"],
      changedFiles: [
        {
          path: "src/routes/admin.ts",
          content: `
router.post('/admin/config', requireAuth, async (req, res) => {
  // Bypassable: checks query parameter instead of session
  if (req.query.admin !== 'true') {
    return res.status(403).send();
  }
  await db.query('UPDATE config SET value = ? WHERE key = ?', [req.body.value, req.body.key]);
  res.json({ success: true });
});
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTHZ-C3",
          expectedEvidence: [{ file: "src/routes/admin.ts", snippetSubstr: "req.query.admin !== 'true'" }]
        }
      ],
      rationale: "Admin check is based on a query parameter that any user can supply."
    },
    {
      id: "AUTHZ-FAIL-08",
      description: "Admin panel accessible to any user who knows the URL",
      tags: ["admin", "obscurity", "no-guard"],
      criteriaTargeted: ["AUTHZ-C3"],
      changedFiles: [
        {
          path: "src/routes/admin.ts",
          content: `
// No auth middleware at all — security through obscurity
router.get('/internal/admin/dashboard', async (req, res) => {
  const stats = await db.query('SELECT * FROM system_stats');
  const users = await db.query('SELECT * FROM users');
  res.json({ stats, users });
});
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTHZ-C3",
          expectedEvidence: [{ file: "src/routes/admin.ts", snippetSubstr: "router.get('/internal/admin/dashboard', async" }]
        }
      ],
      rationale: "Admin dashboard has no authentication or authorization — accessible to anyone."
    },
    {
      id: "AUTHZ-PASS-03",
      description: "Admin routes properly protected with role middleware",
      tags: ["admin", "secure", "role-guard"],
      criteriaTargeted: ["AUTHZ-C3"],
      changedFiles: [
        {
          path: "src/routes/admin.ts",
          content: `
import express from 'express';
import { requireAuth, requireRole } from '../middleware';

const router = express.Router();

// All admin routes require admin role
router.use(requireAuth, requireRole('admin'));

router.get('/admin/users', async (req, res) => {
  const users = await db.query('SELECT id, email, role FROM users');
  res.json(users);
});

router.post('/admin/config', async (req, res) => {
  await db.query('UPDATE config SET value = ? WHERE key = ?', [req.body.value, req.body.key]);
  res.json({ success: true });
});

export default router;
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Router-level middleware enforces admin role on all admin routes."
    },

    // ═══════════════════════════════════════════════════════════════════
    // AUTHZ-C4: Privilege Escalation Prevention
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "AUTHZ-FAIL-09",
      description: "User can set their own role via profile update (mass assignment)",
      tags: ["privilege-escalation", "mass-assignment", "role"],
      criteriaTargeted: ["AUTHZ-C4"],
      changedFiles: [
        {
          path: "src/controllers/users.ts",
          content: `
export async function updateProfile(req, res) {
  // Spreads entire request body into update — allows setting role
  const updates = req.body;
  await db.query(
    'UPDATE users SET ? WHERE id = ?',
    [updates, req.user.id]
  );
  res.json({ success: true });
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTHZ-C4",
          expectedEvidence: [{ file: "src/controllers/users.ts", snippetSubstr: "const updates = req.body" }]
        }
      ],
      rationale: "Mass assignment allows users to include role=admin in the request body to elevate privileges."
    },
    {
      id: "AUTHZ-FAIL-10",
      description: "Registration endpoint accepts role parameter",
      tags: ["privilege-escalation", "registration", "role-injection"],
      criteriaTargeted: ["AUTHZ-C4"],
      changedFiles: [
        {
          path: "src/controllers/auth.ts",
          content: `
import bcrypt from 'bcrypt';

export async function register(req, res) {
  const { email, password, role } = req.body;
  const hash = await bcrypt.hash(password, 12);
  // Role comes directly from user input — attacker can register as admin
  await db.query('INSERT INTO users (email, password, role) VALUES (?, ?, ?)', [email, hash, role || 'user']);
  res.json({ success: true });
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTHZ-C4",
          expectedEvidence: [{ file: "src/controllers/auth.ts", snippetSubstr: "role || 'user'" }]
        }
      ],
      rationale: "Registration accepts a role parameter from request body, allowing privilege escalation during signup."
    },
    {
      id: "AUTHZ-FAIL-11",
      description: "Invitation endpoint allows inviter to assign any role",
      tags: ["privilege-escalation", "invitation", "role-assignment"],
      criteriaTargeted: ["AUTHZ-C4"],
      changedFiles: [
        {
          path: "src/routes/invitations.ts",
          content: `
import { requireAuth } from '../middleware';

router.post('/invitations', requireAuth, async (req, res) => {
  const { email, role } = req.body;
  // Any authenticated user can invite with any role, including admin
  await db.query('INSERT INTO invitations (email, role, invited_by) VALUES (?, ?, ?)',
    [email, role, req.user.id]);
  await sendInvitationEmail(email, role);
  res.json({ success: true });
});
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTHZ-C4",
          expectedEvidence: [{ file: "src/routes/invitations.ts", snippetSubstr: "const { email, role } = req.body" }]
        }
      ],
      rationale: "Any user can invite others with admin role — no check that the inviter has permission to assign the specified role."
    },
    {
      id: "AUTHZ-PASS-04",
      description: "Profile update whitelists allowed fields",
      tags: ["privilege-escalation", "secure", "field-whitelist"],
      criteriaTargeted: ["AUTHZ-C4"],
      changedFiles: [
        {
          path: "src/controllers/users.ts",
          content: `
export async function updateProfile(req, res) {
  // Only allow whitelisted fields — role, permissions, etc. are excluded
  const { name, bio, avatar } = req.body;
  await db.query(
    'UPDATE users SET name = ?, bio = ?, avatar = ? WHERE id = ?',
    [name, bio, avatar, req.user.id]
  );
  res.json({ success: true });
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Destructuring explicitly whitelists allowed fields; role/permissions cannot be set."
    },

    // ═══════════════════════════════════════════════════════════════════
    // AUTHZ-C5: Multi-tenant Isolation
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "AUTHZ-FAIL-12",
      description: "Query returns all tenants' projects without tenant filter",
      tags: ["multi-tenant", "missing-filter", "data-leak"],
      criteriaTargeted: ["AUTHZ-C5"],
      changedFiles: [
        {
          path: "src/routes/projects.ts",
          content: `
import { requireAuth } from '../middleware';

router.get('/projects', requireAuth, async (req, res) => {
  // No tenant filter — returns projects from all organizations
  const projects = await db.query('SELECT * FROM projects');
  res.json(projects);
});
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTHZ-C5",
          expectedEvidence: [{ file: "src/routes/projects.ts", snippetSubstr: "SELECT * FROM projects" }]
        }
      ],
      rationale: "Query returns all projects across all tenants without filtering by the authenticated user's organization."
    },
    {
      id: "AUTHZ-FAIL-13",
      description: "Tenant ID taken from request parameter instead of session",
      tags: ["multi-tenant", "parameter-injection", "tenant-id"],
      criteriaTargeted: ["AUTHZ-C5"],
      changedFiles: [
        {
          path: "src/routes/projects.ts",
          content: `
import { requireAuth } from '../middleware';

router.get('/projects', requireAuth, async (req, res) => {
  // Tenant ID from query parameter — can be manipulated
  const tenantId = req.query.tenantId;
  const projects = await db.query('SELECT * FROM projects WHERE tenant_id = ?', [tenantId]);
  res.json(projects);
});
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTHZ-C5",
          expectedEvidence: [{ file: "src/routes/projects.ts", snippetSubstr: "req.query.tenantId" }]
        }
      ],
      rationale: "Tenant ID comes from user-controlled query parameter, allowing cross-tenant data access."
    },
    {
      id: "AUTHZ-FAIL-14",
      description: "Cross-tenant member access via unscoped invitation lookup",
      tags: ["multi-tenant", "cross-tenant", "invitation"],
      criteriaTargeted: ["AUTHZ-C5"],
      changedFiles: [
        {
          path: "src/routes/members.ts",
          content: `
import { requireAuth } from '../middleware';

router.get('/organizations/:orgId/members', requireAuth, async (req, res) => {
  // Uses orgId from URL without verifying the user belongs to this organization
  const members = await db.query(
    'SELECT * FROM org_members WHERE org_id = ?',
    [req.params.orgId]
  );
  res.json(members);
});
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTHZ-C5",
          expectedEvidence: [{ file: "src/routes/members.ts", snippetSubstr: "WHERE org_id = ?', [req.params.orgId]" }]
        }
      ],
      rationale: "Any authenticated user can view members of any organization by changing the orgId in the URL."
    },
    {
      id: "AUTHZ-PASS-05",
      description: "Tenant scoping derived from authenticated session",
      tags: ["multi-tenant", "secure", "session-derived"],
      criteriaTargeted: ["AUTHZ-C5"],
      changedFiles: [
        {
          path: "src/routes/projects.ts",
          content: `
import { requireAuth } from '../middleware';

router.get('/projects', requireAuth, async (req, res) => {
  // Tenant ID derived from authenticated session — not user input
  const projects = await db.query(
    'SELECT * FROM projects WHERE tenant_id = ?',
    [req.user.tenantId]
  );
  res.json(projects);
});
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Tenant ID is derived from the authenticated session (req.user.tenantId), preventing cross-tenant access."
    },
    {
      id: "AUTHZ-NV-02",
      description: "Tenant isolation enforced by database row-level security",
      tags: ["multi-tenant", "missing-context", "rls"],
      criteriaTargeted: ["AUTHZ-C5"],
      changedFiles: [
        {
          path: "src/routes/projects.ts",
          content: `
import { requireAuth } from '../middleware';
import { getSupabaseClient } from '../lib/supabase';

router.get('/projects', requireAuth, async (req, res) => {
  // Supabase client uses RLS policies — enforcement not visible in code
  const supabase = getSupabaseClient(req.user.accessToken);
  const { data, error } = await supabase.from('projects').select('*');
  if (error) return res.status(500).send();
  res.json(data);
});
`.trim()
        }
      ],
      expectedVerdict: "NOT_VERIFIED",
      rationale: "Tenant isolation is likely enforced by Supabase RLS policies, but the policy definitions are not visible."
    },

    // ═══════════════════════════════════════════════════════════════════
    // AUTHZ-C6: Sensitive Operation Authorization
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "AUTHZ-FAIL-15",
      description: "Account deletion without authorization check",
      tags: ["sensitive-operation", "delete", "missing-check"],
      criteriaTargeted: ["AUTHZ-C6"],
      changedFiles: [
        {
          path: "src/routes/users.ts",
          content: `
import { requireAuth } from '../middleware';

router.delete('/users/:id', requireAuth, async (req, res) => {
  // Any authenticated user can delete any user account
  await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);
  res.json({ deleted: true });
});
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTHZ-C6",
          expectedEvidence: [{ file: "src/routes/users.ts", snippetSubstr: "DELETE FROM users WHERE id = ?" }]
        }
      ],
      rationale: "User deletion is a sensitive operation that only checks authentication, not authorization. Any user can delete any other user."
    },
    {
      id: "AUTHZ-FAIL-16",
      description: "Billing update accessible to non-billing users",
      tags: ["sensitive-operation", "billing", "missing-permission"],
      criteriaTargeted: ["AUTHZ-C6"],
      changedFiles: [
        {
          path: "src/routes/billing.ts",
          content: `
import { requireAuth } from '../middleware';

router.put('/billing/plan', requireAuth, async (req, res) => {
  const { plan, paymentMethodId } = req.body;
  // No permission check — any authenticated user can change the billing plan
  await db.query('UPDATE organizations SET plan = ?, payment_method = ? WHERE id = ?',
    [plan, paymentMethodId, req.user.orgId]);
  res.json({ success: true });
});
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTHZ-C6",
          expectedEvidence: [{ file: "src/routes/billing.ts", snippetSubstr: "requireAuth, async (req, res)" }]
        }
      ],
      rationale: "Billing plan changes are a sensitive operation requiring specific permissions (e.g., canManageBilling), not just authentication."
    },
    {
      id: "AUTHZ-FAIL-17",
      description: "API key generation without permission verification",
      tags: ["sensitive-operation", "api-key", "missing-permission"],
      criteriaTargeted: ["AUTHZ-C6"],
      changedFiles: [
        {
          path: "src/routes/apikeys.ts",
          content: `
import crypto from 'crypto';
import { requireAuth } from '../middleware';

router.post('/api-keys', requireAuth, async (req, res) => {
  // Any authenticated user can generate API keys for the organization
  const key = crypto.randomBytes(32).toString('hex');
  await db.query('INSERT INTO api_keys (key, org_id, created_by) VALUES (?, ?, ?)',
    [key, req.user.orgId, req.user.id]);
  res.json({ apiKey: key });
});
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTHZ-C6",
          expectedEvidence: [{ file: "src/routes/apikeys.ts", snippetSubstr: "requireAuth, async (req, res)" }]
        }
      ],
      rationale: "API key generation is a sensitive operation — any team member can create keys for the organization without permission checks."
    },
    {
      id: "AUTHZ-PASS-06",
      description: "Sensitive delete operation with permission check",
      tags: ["sensitive-operation", "secure", "permission-check"],
      criteriaTargeted: ["AUTHZ-C6"],
      changedFiles: [
        {
          path: "src/routes/projects.ts",
          content: `
import { requireAuth, requirePermission } from '../middleware';

router.delete('/projects/:id', requireAuth, requirePermission('project:delete'), async (req, res) => {
  const project = await db.query(
    'SELECT * FROM projects WHERE id = ? AND tenant_id = ?',
    [req.params.id, req.user.tenantId]
  );
  if (!project) return res.status(404).send();
  
  await db.query('DELETE FROM projects WHERE id = ?', [req.params.id]);
  res.json({ deleted: true });
});
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Delete operation is protected by permission middleware (project:delete), ownership is verified via tenant scoping."
    },

    // ═══════════════════════════════════════════════════════════════════
    // Cross-Cutting Scenarios
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "AUTHZ-PASS-07",
      description: "Next.js API route with proper authorization middleware",
      tags: ["nextjs", "middleware", "secure"],
      criteriaTargeted: ["AUTHZ-C1", "AUTHZ-C2", "AUTHZ-C3"],
      changedFiles: [
        {
          path: "src/app/api/admin/users/route.ts",
          content: `
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const users = await db.query('SELECT id, email, role FROM users');
  return NextResponse.json(users);
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Server-side authentication and admin role check before data access."
    },
    {
      id: "AUTHZ-NV-03",
      description: "PR changes only test files",
      tags: ["unrelated", "tests-only"],
      criteriaTargeted: [],
      changedFiles: [
        {
          path: "src/__tests__/utils.test.ts",
          content: `
import { formatDate } from '../utils';

describe('formatDate', () => {
  it('formats dates correctly', () => {
    expect(formatDate('2024-01-01')).toBe('Jan 1, 2024');
  });
});
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "No authorization logic is present to evaluate."
    },
  ]
};
