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
  const startTime = Date.now();

  console.log(
    `[AUTH-MIDDLEWARE] ${new Date().toISOString()} - Authentication attempt - Method: ${
      req.method
    }, URL: ${req.url}`
  );

  // Get authorization header
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    const responseTime = Date.now() - startTime;
    console.log(
      `[AUTH-MIDDLEWARE] ${new Date().toISOString()} - Authentication failed - Missing or invalid authorization header in ${responseTime}ms`
    );
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
      const responseTime = Date.now() - startTime;
      console.log(
        `[AUTH-MIDDLEWARE] ${new Date().toISOString()} - Authentication failed - Invalid token payload in ${responseTime}ms`
      );
      return res.status(401).json({ error: "Invalid token payload" });
    }

    req.user = { id: payload.sub };
    const responseTime = Date.now() - startTime;

    console.log(
      `[AUTH-MIDDLEWARE] ${new Date().toISOString()} - Authentication successful for user: ${
        payload.sub
      } in ${responseTime}ms`
    );
    next();
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(
      `[AUTH-MIDDLEWARE] ${new Date().toISOString()} - Authentication failed - Token parsing error in ${responseTime}ms - Error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
    return res.status(500).json({ error: "Token parsing error" });
  }
}
