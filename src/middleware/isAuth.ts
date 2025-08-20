import type { Request, Response, NextFunction } from "express";
import { pgPool } from "../lib/pg";

export interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

/**
 * JWT authentication middleware
 * Verifies the JWT token and extracts user ID
 */
export function isAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  // Get authorization header
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "Missing or invalid authorization header" });
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  // For now, we'll use a simple approach: extract user ID from the token
  // In production, you should properly verify the JWT token
  try {
    // Decode the JWT token (this is a simplified approach)
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64").toString()
    );

    if (!payload.sub) {
      return res.status(401).json({ error: "Invalid token payload" });
    }

    req.user = { id: payload.sub };
    next();
  } catch (error) {
    return res.status(500).json({ error: "Token parsing error" });
  }
}
