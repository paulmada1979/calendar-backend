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
    try {
      const stateSecret = process.env.STATE_JWT_SECRET;
      if (!stateSecret)
        return res.status(500).json({ error: "Missing STATE_JWT_SECRET" });
      const state = jwt.sign(
        { user_id: req.user!.id, redirect: process.env.APP_URL },
        stateSecret,
        { expiresIn: "10m" }
      );
      const url = getAuthUrl(state);
      res.json({ url });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// OAuth callback
authRouter.get("/google/callback", async (req, res) => {
  try {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code || !state) return res.status(400).send("Missing code or state");

    const stateSecret = process.env.STATE_JWT_SECRET;
    if (!stateSecret) return res.status(500).send("Missing STATE_JWT_SECRET");
    let userId: string;
    try {
      const decoded = jwt.verify(state, stateSecret) as any;
      userId = decoded.user_id;
    } catch {
      return res.status(400).send("Invalid state");
    }

    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.access_token || !tokens.refresh_token) {
      // refresh_token may be missing if consent not prompted; we ask for prompt=consent
      // but still ensure we have tokens
    }

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
    return res.redirect(`${redirect}/calendar?connected=google`);
  } catch (err: any) {
    console.error(err);
    return res.status(500).send("Failed to handle callback");
  }
});

// Disconnect integration
authRouter.post(
  "/google/disconnect",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      await pgPool.query(
        "delete from public.google_calendar_connections where user_id = $1",
        [req.user!.id]
      );
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);
