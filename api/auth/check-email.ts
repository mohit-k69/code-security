import { checkAuthEmailExists } from "../../src/lib/authCheck.js";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  try {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    const email = body?.email || req.query?.email;
    if (!email || typeof email !== "string") {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      const errPayload = { error: "Email is required", exists: false };
      return res.json ? res.json(errPayload) : res.end(JSON.stringify(errPayload));
    }

    const normalizedEmail = email.trim().toLowerCase();
    const exists = await checkAuthEmailExists(normalizedEmail);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    const payload = { exists, email: normalizedEmail };
    return res.json ? res.json(payload) : res.end(JSON.stringify(payload));
  } catch (err: any) {
    console.error("Error in api/auth/check-email handler:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    const errPayload = { error: "Failed to verify email existence", exists: false };
    return res.json ? res.json(errPayload) : res.end(JSON.stringify(errPayload));
  }
}
