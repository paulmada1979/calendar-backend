import type { Request, Response, NextFunction } from "express";
import { pgPool } from "../lib/pg";

export interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

/**
 * Simple authentication middleware that expects user ID in request body or headers
 * Verifies the user exists in the database
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

  // Get user ID from request body, headers, or query
  const userId =
    req.body.userId || req.headers["x-user-id"] || req.query.userId;

  if (!userId) {
    const responseTime = Date.now() - startTime;
    console.log(
      `[AUTH-MIDDLEWARE] ${new Date().toISOString()} - Authentication failed - Missing user ID in ${responseTime}ms`
    );
    return res.status(401).json({ error: "Missing user ID" });
  }

  // Verify user exists in the database
  pgPool
    .query("SELECT id FROM auth.users WHERE id = $1 LIMIT 1", [userId])
    .then(({ rows }) => {
      if (rows.length === 0) {
        const responseTime = Date.now() - startTime;
        console.log(
          `[AUTH-MIDDLEWARE] ${new Date().toISOString()} - Authentication failed - User not found in ${responseTime}ms - User ID: ${userId}`
        );
        return res.status(401).json({ error: "User not found" });
      }

      req.user = { id: String(userId) };
      const responseTime = Date.now() - startTime;

      console.log(
        `[AUTH-MIDDLEWARE] ${new Date().toISOString()} - Authentication successful for user: ${userId} in ${responseTime}ms`
      );
      next();
    })
    .catch((error) => {
      const responseTime = Date.now() - startTime;
      console.error(
        `[AUTH-MIDDLEWARE] ${new Date().toISOString()} - Database error in ${responseTime}ms - Error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      return res.status(500).json({ error: "Database error" });
    });
}
