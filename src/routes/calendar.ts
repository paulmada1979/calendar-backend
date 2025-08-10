import express from "express";
import { isAuth, AuthenticatedRequest } from "../middleware/isAuth";
import { pgPool } from "../lib/pg";
import { listEvents } from "../services/google";
import { mapGoogleEventsToFullCalendar } from "../utils/fullcalendar";

export const calendarRouter = express.Router();

// Fetch events with FullCalendar-friendly query params
calendarRouter.get(
  "/events",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { start, end, q, maxResults, singleEvents, orderBy, pageToken } =
        req.query as Record<string, string>;

      const { rows } = await pgPool.query(
        "select access_token, refresh_token, scope, token_type, extract(epoch from expiry_date) * 1000 as expiry_date from public.google_calendar_connections where user_id = $1 limit 1",
        [userId]
      );
      if (rows.length === 0)
        return res.status(404).json({ error: "Not connected" });

      const tokens = {
        access_token: rows[0].access_token as string,
        refresh_token: rows[0].refresh_token as string,
        scope: rows[0].scope as string | undefined,
        token_type: rows[0].token_type as string | undefined,
        expiry_date: rows[0].expiry_date
          ? Number(rows[0].expiry_date)
          : undefined,
      };

      const data = await listEvents(tokens, {
        timeMin: start,
        timeMax: end,
        q,
        maxResults: maxResults ? Number(maxResults) : undefined,
        singleEvents: singleEvents ? singleEvents === "true" : true,
        orderBy: orderBy === "updated" ? "updated" : "startTime",
        pageToken,
      });

      const items = mapGoogleEventsToFullCalendar(data.items || []);
      res.json({
        events: items,
        raw: process.env.NODE_ENV === "development" ? data : undefined,
      });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  }
);
