import express from "express";
import jwt from "jsonwebtoken";
import { isAuth, AuthenticatedRequest } from "../middleware/isAuth";
import { getAuthUrl, exchangeCodeForTokens } from "../services/google";
import { pgPool } from "../lib/pg";

export const authRouter = express.Router();

// Begin OAuth: returns Google consent screen URL
authRouter.get(
  "/google/url",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    const startTime = Date.now();
    console.log(
      `[AUTH] ${new Date().toISOString()} - Starting Google OAuth flow for user: ${
        req.user!.id
      }`
    );

    try {
      const stateSecret = process.env.STATE_JWT_SECRET;
      if (!stateSecret) {
        console.error(
          `[AUTH] ${new Date().toISOString()} - Missing STATE_JWT_SECRET environment variable`
        );
        return res.status(500).json({ error: "Missing STATE_JWT_SECRET" });
      }

      const state = jwt.sign(
        { user_id: req.user!.id, redirect: process.env.APP_URL },
        stateSecret,
        { expiresIn: "10m" }
      );

      const url = getAuthUrl(state);
      const responseTime = Date.now() - startTime;

      console.log(
        `[AUTH] ${new Date().toISOString()} - Google OAuth URL generated successfully for user: ${
          req.user!.id
        } in ${responseTime}ms`
      );
      res.json({ url });
    } catch (err: any) {
      const responseTime = Date.now() - startTime;
      console.error(
        `[AUTH] ${new Date().toISOString()} - Error generating Google OAuth URL for user: ${
          req.user!.id
        } in ${responseTime}ms - ${err.message}`
      );
      res.status(500).json({ error: err.message });
    }
  }
);

// Also support POST for the new authentication method
authRouter.post(
  "/google/url",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    const startTime = Date.now();
    console.log(
      `[AUTH] ${new Date().toISOString()} - Starting Google OAuth flow for user: ${
        req.user!.id
      }`
    );

    try {
      const stateSecret = process.env.STATE_JWT_SECRET;
      if (!stateSecret) {
        console.error(
          `[AUTH] ${new Date().toISOString()} - Missing STATE_JWT_SECRET environment variable`
        );
        return res.status(500).json({ error: "Missing STATE_JWT_SECRET" });
      }

      const state = jwt.sign(
        { user_id: req.user!.id, redirect: process.env.APP_URL },
        stateSecret,
        { expiresIn: "10m" }
      );

      const url = getAuthUrl(state);
      const responseTime = Date.now() - startTime;

      console.log(
        `[AUTH] ${new Date().toISOString()} - Google OAuth URL generated successfully for user: ${
          req.user!.id
        } in ${responseTime}ms`
      );
      res.json({ url });
    } catch (err: any) {
      const responseTime = Date.now() - startTime;
      console.error(
        `[AUTH] ${new Date().toISOString()} - Error generating Google OAuth URL for user: ${
          req.user!.id
        } in ${responseTime}ms - ${err.message}`
      );
      res.status(500).json({ error: err.message });
    }
  }
);

// OAuth callback
authRouter.get("/google/callback", async (req, res) => {
  const startTime = Date.now();
  const { code, state } = req.query as { code?: string; state?: string };

  console.log(
    `[AUTH] ${new Date().toISOString()} - Google OAuth callback received - Code: ${
      code ? "Present" : "Missing"
    }, State: ${state ? "Present" : "Missing"}`
  );

  if (!code || !state) {
    console.error(
      `[AUTH] ${new Date().toISOString()} - Missing code or state in callback`
    );
    return res.status(400).send("Missing code or state");
  }

  try {
    const stateSecret = process.env.STATE_JWT_SECRET;
    if (!stateSecret) {
      console.error(
        `[AUTH] ${new Date().toISOString()} - Missing STATE_JWT_SECRET environment variable`
      );
      return res.status(500).send("Missing STATE_JWT_SECRET");
    }

    let userId: string;
    try {
      const decoded = jwt.verify(state, stateSecret) as any;
      userId = decoded.user_id;
      console.log(
        `[AUTH] ${new Date().toISOString()} - State verified successfully for user: ${userId}`
      );
    } catch {
      console.error(`[AUTH] ${new Date().toISOString()} - Invalid state token`);
      return res.status(400).send("Invalid state");
    }

    console.log(
      `[AUTH] ${new Date().toISOString()} - Exchanging code for tokens for user: ${userId}`
    );
    const tokens = await exchangeCodeForTokens(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      console.warn(
        `[AUTH] ${new Date().toISOString()} - Missing tokens for user: ${userId} - Access token: ${!!tokens.access_token}, Refresh token: ${!!tokens.refresh_token}`
      );
    }

    console.log(
      `[AUTH] ${new Date().toISOString()} - Storing tokens in database for user: ${userId}`
    );
    await pgPool.query(
      `insert into public.google_calendar_connections (
        user_id, access_token, refresh_token, scope, token_type, expiry_date
      ) values ($1, $2, $3, $4, $5, to_timestamp($6/1000.0))
      on conflict (user_id) do update set
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        scope = excluded.scope,
        token_type = excluded.token_type,
        expiry_date = excluded.expiry_date,
        updated_at = now()`,
      [
        userId,
        tokens.access_token || "",
        tokens.refresh_token || "",
        tokens.scope || null,
        tokens.token_type || null,
        tokens.expiry_date || null,
      ]
    );

    const redirect = process.env.APP_URL || "http://localhost:3000";
    const responseTime = Date.now() - startTime;

    console.log(
      `[AUTH] ${new Date().toISOString()} - Google OAuth completed successfully for user: ${userId} in ${responseTime}ms - Redirecting to: ${redirect}/calendar?connected=google`
    );
    return res.redirect(`${redirect}/calendar?connected=google`);
  } catch (err: any) {
    const responseTime = Date.now() - startTime;
    console.error(
      `[AUTH] ${new Date().toISOString()} - Google OAuth callback failed in ${responseTime}ms - ${
        err.message
      }`
    );
    console.error(err.stack);
    return res.status(500).send("Failed to handle callback");
  }
});

// Disconnect integration
authRouter.post(
  "/google/disconnect",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    const startTime = Date.now();
    const userId = req.user!.id;

    console.log(
      `[AUTH] ${new Date().toISOString()} - Disconnecting Google Calendar for user: ${userId}`
    );

    try {
      const result = await pgPool.query(
        "delete from public.google_calendar_connections where user_id = $1",
        [userId]
      );

      const responseTime = Date.now() - startTime;
      console.log(
        `[AUTH] ${new Date().toISOString()} - Google Calendar disconnected successfully for user: ${userId} in ${responseTime}ms - Rows affected: ${
          result.rowCount
        }`
      );

      res.json({ success: true });
    } catch (err: any) {
      const responseTime = Date.now() - startTime;
      console.error(
        `[AUTH] ${new Date().toISOString()} - Error disconnecting Google Calendar for user: ${userId} in ${responseTime}ms - ${
          err.message
        }`
      );
      res.status(500).json({ error: err.message });
    }
  }
);
