import type { Request, Response, NextFunction } from "express";
import { pgPool } from "../lib/pg";

export interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

/**
 * Flexible authentication middleware
 * Supports both JWT Bearer tokens and session-based authentication
 */
export function isAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  // Try to get user from JWT token first
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    try {
      // Decode the JWT token (this is a simplified approach)
      const payload = JSON.parse(
        Buffer.from(token.split(".")[1], "base64").toString()
      );

      if (payload.sub) {
        req.user = { id: payload.sub };
        return next();
      }
    } catch (error) {
      console.error("[AUTH-MIDDLEWARE] JWT token parsing error:", error);
      // Continue to try other authentication methods
    }
  }

  // Try to get user from session/cookies
  if (req.cookies && req.cookies.userId) {
    req.user = { id: req.cookies.userId };
    return next();
  }

  // Try to get user from custom header (for development/testing)
  if (req.headers["x-user-id"]) {
    req.user = { id: req.headers["x-user-id"] as string };
    return next();
  }

  // For development/testing, you can also check for a query parameter
  if (process.env.NODE_ENV === "development" && req.query.userId) {
    req.user = { id: req.query.userId as string };
    return next();
  }

  // If no authentication method worked, return 401
  return res.status(401).json({
    error: "Missing or invalid authorization header",
    message:
      "Please provide a valid JWT token in Authorization header, or ensure you're properly authenticated",
  });
}
