import { getSupabaseAdmin } from "../../../src/lib/authCheck";
import { getRecoveryCodesStatus } from "../../../src/lib/recoveryCodes";
import { isOAuthOnlyUser } from "../../../src/lib/recoveryReauth";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed. GET is required." });
  }

  const authHeader = req.headers?.authorization || req.headers?.Authorization;

  if (!authHeader || typeof authHeader !== "string") {
    return res.status(401).json({ error: "Missing authorization header" });
  }

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return res.status(401).json({ error: "Missing authorization header" });
  }

  const admin = getSupabaseAdmin();

  if (!admin) {
    return res.status(503).json({ error: "ADMIN_SERVICE_UNAVAILABLE" });
  }

  try {
    const {
      data: { user },
      error: userError,
    } = await admin.auth.getUser(token);

    if (userError || !user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const status = await getRecoveryCodesStatus(admin, user.id);
    const isOAuthOnly = isOAuthOnlyUser(user);

    return res.status(200).json({
      success: true,
      ...status,
      isOAuthOnly,
      canRegenerate: !isOAuthOnly,
    });
  } catch (err: any) {
    console.error(
      "[recovery-codes] status endpoint error:",
      err?.message || err
    );

    return res.status(500).json({
      error: "RECOVERY_CODES_STATUS_FAILED",
    });
  }
}
