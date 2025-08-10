import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

/**
 * Verify Supabase JWT from Authorization: Bearer <token>
 * Uses SUPABASE_JWT_SECRET to validate. On success, attaches user.id to req.user.id
 */
export function isAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  try {
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret)
      return res.status(500).json({ error: "Missing SUPABASE_JWT_SECRET" });
    const payload = jwt.verify(token, secret) as any;
    const userId = payload?.sub || payload?.user?.id;
    if (!userId)
      return res.status(401).json({ error: "Invalid token payload" });
    req.user = { id: String(userId) };
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}
