import express from "express";
import { isAuth, AuthenticatedRequest } from "../middleware/isAuth";
import { pgPool } from "../lib/pg";
import {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  listCalendars,
  getCalendar,
  updateCalendar,
  createCalendar,
  deleteCalendar,
  getPrimaryCalendarTimezone,
  getValidTokens,
} from "../services/google";
import { mapGoogleEventsToFullCalendar } from "../utils/fullcalendar";

export const calendarRouter = express.Router();

// Helper function to safely format dates
function safeDateToISOString(dateValue: any): string {
  if (!dateValue) return "none";

  try {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) {
      return "invalid";
    }
    return date.toISOString();
  } catch (error) {
    return "invalid";
  }
}

// Helper function to validate date parameters
function validateDateParam(
  dateStr: string | undefined,
  paramName: string
): string | null {
  if (!dateStr) return null;

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid ${paramName} date: ${dateStr}`);
    }
    return date.toISOString();
  } catch (error) {
    throw new Error(`Invalid ${paramName} date: ${dateStr}`);
  }
}

// Get calendar timezone information
calendarRouter.get(
  "/timezone",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    const startTime = Date.now();
    const userId = req.user!.id;

    console.log(
      `[CALENDAR] ${new Date().toISOString()} - Fetching timezone for user: ${userId}`
    );

    try {
      // Get tokens
      const { rows } = await pgPool.query(
        "select access_token, refresh_token, scope, token_type, extract(epoch from expiry_date) * 1000 as expiry_date from public.google_calendar_connections where user_id = $1 limit 1",
        [userId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: "Not connected" });
      }

      const tokens = {
        access_token: rows[0].access_token as string,
        refresh_token: rows[0].refresh_token as string,
        scope: rows[0].scope as string | undefined,
        token_type: rows[0].token_type as string | undefined,
        expiry_date: rows[0].expiry_date
          ? Number(rows[0].expiry_date)
          : undefined,
      };

      // Get primary calendar timezone
      const timezone = await getPrimaryCalendarTimezone(tokens);
      const responseTime = Date.now() - startTime;

      console.log(
        `[CALENDAR] ${new Date().toISOString()} - Timezone fetched successfully for user: ${userId} in ${responseTime}ms - Timezone: ${timezone}`
      );

      res.json({
        timezone: timezone || "UTC",
        userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        responseTime: `${responseTime}ms`,
      });
    } catch (err: any) {
      const responseTime = Date.now() - startTime;
      console.error(
        `[CALENDAR] ${new Date().toISOString()} - Error fetching timezone for user: ${userId} in ${responseTime}ms - ${
          err.message
        }`
      );
      res.status(500).json({ error: err.message });
    }
  }
);

// Test endpoint to check user's Google Calendar connection status
calendarRouter.get(
  "/test-user-connection",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    const startTime = Date.now();
    const userId = req.user!.id;

    console.log(
      `[CALENDAR-TEST] ${new Date().toISOString()} - Testing user connection status for user: ${userId}`
    );

    try {
      // Check if user has Google Calendar connection
      const { rows } = await pgPool.query(
        "select id, user_id, provider, scope, token_type, expiry_date, created_at, updated_at from public.google_calendar_connections where user_id = $1 limit 1",
        [userId]
      );

      const responseTime = Date.now() - startTime;

      if (rows.length === 0) {
        console.log(
          `[CALENDAR-TEST] ${new Date().toISOString()} - No Google Calendar connection found for user: ${userId} in ${responseTime}ms`
        );
        return res.json({
          connected: false,
          message: "No Google Calendar connection found",
          userId: userId,
          responseTime: `${responseTime}ms`,
        });
      }

      const connection = rows[0];
      console.log(
        `[CALENDAR-TEST] ${new Date().toISOString()} - Google Calendar connection found for user: ${userId} in ${responseTime}ms`
      );

      res.json({
        connected: true,
        connection: {
          id: connection.id,
          userId: connection.user_id,
          provider: connection.provider,
          scope: connection.scope,
          tokenType: connection.token_type,
          expiryDate: connection.expiry_date,
          createdAt: connection.created_at,
          updatedAt: connection.updated_at,
        },
        userId: userId,
        responseTime: `${responseTime}ms`,
      });
    } catch (err: any) {
      const responseTime = Date.now() - startTime;
      console.error(
        `[CALENDAR-TEST] ${new Date().toISOString()} - Test failed for user: ${userId} in ${responseTime}ms - ${
          err.message
        }`
      );
      res.status(500).json({
        error: err.message,
        userId: userId,
        responseTime: `${responseTime}ms`,
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
      });
    }
  }
);

// Test endpoint to check Google Calendar connection and list all events
calendarRouter.get(
  "/test-connection",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    const startTime = Date.now();
    const userId = req.user!.id;

    console.log(
      `[CALENDAR-TEST] ${new Date().toISOString()} - Testing Google Calendar connection for user: ${userId}`
    );

    try {
      // Get tokens
      const { rows } = await pgPool.query(
        "select access_token, refresh_token, scope, token_type, extract(epoch from expiry_date) * 1000 as expiry_date from public.google_calendar_connections where user_id = $1 limit 1",
        [userId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: "Not connected" });
      }

      const tokens = {
        access_token: rows[0].access_token as string,
        refresh_token: rows[0].refresh_token as string,
        scope: rows[0].scope as string | undefined,
        token_type: rows[0].token_type as string | undefined,
        expiry_date: rows[0].expiry_date
          ? Number(rows[0].expiry_date)
          : undefined,
      };

      // Test with a wider date range (last 30 days to next 30 days)
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const thirtyDaysFromNow = new Date(
        now.getTime() + 30 * 24 * 60 * 60 * 1000
      );

      console.log(
        `[CALENDAR-TEST] ${new Date().toISOString()} - Testing with date range: ${thirtyDaysAgo.toISOString()} to ${thirtyDaysFromNow.toISOString()}`
      );

      const data = await listEvents(tokens, {
        timeMin: thirtyDaysAgo.toISOString(),
        timeMax: thirtyDaysFromNow.toISOString(),
        maxResults: 100,
        singleEvents: true,
        orderBy: "startTime",
      });

      const responseTime = Date.now() - startTime;

      res.json({
        success: true,
        connection: {
          userId,
          scope: tokens.scope,
          tokenType: tokens.token_type,
          expiryDate: tokens.expiry_date
            ? new Date(tokens.expiry_date).toISOString()
            : null,
        },
        testParams: {
          timeMin: thirtyDaysAgo.toISOString(),
          timeMax: thirtyDaysFromNow.toISOString(),
          maxResults: 100,
        },
        results: {
          totalEvents: data.items?.length || 0,
          responseTime: `${responseTime}ms`,
          hasNextPage: !!data.nextPageToken,
        },
        sampleEvents: data.items?.slice(0, 5) || [],
        raw: process.env.NODE_ENV === "development" ? data : undefined,
      });
    } catch (err: any) {
      const responseTime = Date.now() - startTime;
      console.error(
        `[CALENDAR-TEST] ${new Date().toISOString()} - Test failed for user: ${userId} in ${responseTime}ms - ${
          err.message
        }`
      );
      res.status(500).json({
        error: err.message,
        responseTime: `${responseTime}ms`,
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
      });
    }
  }
);

// Fetch events with FullCalendar-friendly query params
calendarRouter.get(
  "/events",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    const startTime = Date.now();
    const userId = req.user!.id;
    const {
      start,
      end,
      q,
      maxResults,
      singleEvents,
      orderBy,
      pageToken,
      calendarIds,
      timezone,
    } = req.query as Record<string, string>;

    try {
      // Validate date parameters
      const validatedStart = validateDateParam(start, "start");
      const validatedEnd = validateDateParam(end, "end");

      // Parse calendar IDs for filtering
      const selectedCalendarIds = calendarIds
        ? calendarIds.split(",")
        : ["primary"];

      console.log(
        `[CALENDAR] ${new Date().toISOString()} - Fetching events for user: ${userId} - Start: ${
          validatedStart || "none"
        }, End: ${validatedEnd || "none"}, Query: ${q || "none"}, MaxResults: ${
          maxResults || "default"
        }, Calendars: ${selectedCalendarIds.join(", ")}`
      );

      console.log(
        `[CALENDAR] ${new Date().toISOString()} - Retrieving Google Calendar tokens for user: ${userId}`
      );

      let rows;
      try {
        const result = await pgPool.query(
          "select access_token, refresh_token, scope, token_type, extract(epoch from expiry_date) * 1000 as expiry_date from public.google_calendar_connections where user_id = $1 limit 1",
          [userId]
        );
        rows = result.rows;
      } catch (dbError: any) {
        console.error(
          `[CALENDAR] ${new Date().toISOString()} - Database error retrieving tokens for user: ${userId} - ${
            dbError.message
          }`
        );
        throw new Error(`Database error: ${dbError.message}`);
      }

      if (rows.length === 0) {
        console.log(
          `[CALENDAR] ${new Date().toISOString()} - No Google Calendar connection found for user: ${userId}`
        );
        return res.status(404).json({ error: "Not connected" });
      }

      // Validate token data
      if (!rows[0].access_token) {
        console.error(
          `[CALENDAR] ${new Date().toISOString()} - Missing access token for user: ${userId}`
        );
        return res.status(500).json({ error: "Invalid token configuration" });
      }

      console.log(
        `[CALENDAR] ${new Date().toISOString()} - Tokens retrieved successfully for user: ${userId} - Scope: ${
          rows[0].scope || "none"
        }, Expiry: ${safeDateToISOString(rows[0].expiry_date)}`
      );

      const tokens = {
        access_token: rows[0].access_token as string,
        refresh_token: rows[0].refresh_token as string,
        scope: rows[0].scope as string | undefined,
        token_type: rows[0].token_type as string | undefined,
        expiry_date: rows[0].expiry_date
          ? Number(rows[0].expiry_date)
          : undefined,
      };

      console.log(
        `[CALENDAR] ${new Date().toISOString()} - Fetching events from Google Calendar API for user: ${userId}`
      );

      // Validate and refresh tokens if needed
      let validTokens;
      try {
        validTokens = await getValidTokens(tokens);

        // If tokens were refreshed, update them in the database
        if (validTokens.access_token !== tokens.access_token) {
          console.log(
            `[CALENDAR] ${new Date().toISOString()} - Updating refreshed tokens in database for user: ${userId}`
          );

          await pgPool.query(
            `update public.google_calendar_connections 
             set access_token = $1, updated_at = now()
             where user_id = $2`,
            [validTokens.access_token, userId]
          );
        }
      } catch (tokenError: any) {
        console.error(
          `[CALENDAR] ${new Date().toISOString()} - Token validation failed for user: ${userId} - ${
            tokenError.message
          }`
        );

        // If token refresh fails, remove the invalid connection
        await pgPool.query(
          "delete from public.google_calendar_connections where user_id = $1",
          [userId]
        );

        return res.status(401).json({
          error:
            "Google Calendar connection expired. Please reconnect your account.",
          code: "TOKEN_EXPIRED",
        });
      }

      let allEvents: any[] = [];

      // Fetch events from each selected calendar
      for (const calendarId of selectedCalendarIds) {
        try {
          console.log(
            `[CALENDAR] ${new Date().toISOString()} - Fetching events from calendar: ${calendarId} for user: ${userId}`
          );

          const calendarData = await listEvents(validTokens, {
            timeMin: validatedStart || undefined,
            timeMax: validatedEnd || undefined,
            q,
            maxResults: maxResults ? Number(maxResults) : undefined,
            singleEvents: singleEvents ? singleEvents === "true" : true,
            orderBy: orderBy === "updated" ? "updated" : "startTime",
            pageToken,
            calendarId: calendarId, // Pass specific calendar ID
            timezone: timezone || undefined, // Pass timezone if provided
          });

          // Add calendarId to each event
          const eventsWithCalendarId = (calendarData.items || []).map(
            (event) => ({
              ...event,
              calendarId: calendarId,
            })
          );

          allEvents = allEvents.concat(eventsWithCalendarId);

          console.log(
            `[CALENDAR] ${new Date().toISOString()} - Fetched ${
              eventsWithCalendarId.length
            } events from calendar: ${calendarId}`
          );
        } catch (calendarError: any) {
          console.error(
            `[CALENDAR] ${new Date().toISOString()} - Error fetching events from calendar ${calendarId} for user: ${userId} - ${
              calendarError.message
            }`
          );

          // Continue with other calendars if one fails
          continue;
        }
      }

      const items = mapGoogleEventsToFullCalendar(allEvents);
      const responseTime = Date.now() - startTime;

      console.log(
        `[CALENDAR] ${new Date().toISOString()} - Events fetched successfully for user: ${userId} in ${responseTime}ms - Total events: ${
          items.length
        }, Raw events: ${
          allEvents.length
        }, Calendars: ${selectedCalendarIds.join(", ")}`
      );

      res.json({
        events: items,
        raw: process.env.NODE_ENV === "development" ? allEvents : undefined,
      });
    } catch (err: any) {
      const responseTime = Date.now() - startTime;
      console.error(
        `[CALENDAR] ${new Date().toISOString()} - Error fetching events for user: ${userId} in ${responseTime}ms - ${
          err.message
        }`
      );
      console.error(err.stack);

      // Provide more specific error messages
      if (
        err.message.includes("Invalid start date") ||
        err.message.includes("Invalid end date")
      ) {
        return res.status(400).json({ error: err.message });
      }

      res.status(500).json({ error: err.message });
    }
  }
);

// Create a new event
calendarRouter.post(
  "/events",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    const startTime = Date.now();
    const userId = req.user!.id;
    const eventData = req.body;

    console.log(
      `[CALENDAR] ${new Date().toISOString()} - Creating event for user: ${userId} - Summary: ${
        eventData.summary
      }`
    );
    console.log(
      `[CALENDAR] ${new Date().toISOString()} - Full event data: ${JSON.stringify(
        eventData
      )}`
    );

    try {
      // Get tokens
      console.log(
        `[CALENDAR] ${new Date().toISOString()} - Querying database for user: ${userId}`
      );

      const { rows } = await pgPool.query(
        "select access_token, refresh_token, scope, token_type, extract(epoch from expiry_date) * 1000 as expiry_date from public.google_calendar_connections where user_id = $1 limit 1",
        [userId]
      );

      console.log(
        `[CALENDAR] ${new Date().toISOString()} - Database query result: ${
          rows.length
        } rows found`
      );

      if (rows.length === 0) {
        console.log(
          `[CALENDAR] ${new Date().toISOString()} - No Google Calendar connection found for user: ${userId}`
        );
        return res.status(404).json({ error: "Not connected" });
      }

      const tokens = {
        access_token: rows[0].access_token as string,
        refresh_token: rows[0].refresh_token as string,
        scope: rows[0].scope as string | undefined,
        token_type: rows[0].token_type as string | undefined,
        expiry_date: rows[0].expiry_date
          ? Number(rows[0].expiry_date)
          : undefined,
      };

      console.log(
        `[CALENDAR] ${new Date().toISOString()} - Tokens retrieved - Access token: ${!!tokens.access_token}, Refresh token: ${!!tokens.refresh_token}, Scope: ${
          tokens.scope
        }`
      );

      // Create event
      console.log(
        `[CALENDAR] ${new Date().toISOString()} - Calling Google Calendar API to create event`
      );

      const createdEvent = await createEvent(tokens, eventData);
      const mappedEvent = mapGoogleEventsToFullCalendar([createdEvent])[0];
      const responseTime = Date.now() - startTime;

      console.log(
        `[CALENDAR] ${new Date().toISOString()} - Event created successfully for user: ${userId} in ${responseTime}ms - Event ID: ${
          createdEvent.id
        }`
      );

      res.json({ event: mappedEvent });
    } catch (err: any) {
      const responseTime = Date.now() - startTime;
      console.error(
        `[CALENDAR] ${new Date().toISOString()} - Error creating event for user: ${userId} in ${responseTime}ms - ${
          err.message
        }`
      );
      console.error(
        `[CALENDAR] ${new Date().toISOString()} - Full error: ${JSON.stringify(
          err
        )}`
      );
      res.status(500).json({ error: err.message });
    }
  }
);

// Update an existing event
calendarRouter.put(
  "/events/:eventId",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    const startTime = Date.now();
    const userId = req.user!.id;
    const eventId = req.params.eventId;
    const eventData = req.body;

    console.log(
      `[CALENDAR] ${new Date().toISOString()} - Updating event for user: ${userId} - Event ID: ${eventId}`
    );

    try {
      // Get tokens
      const { rows } = await pgPool.query(
        "select access_token, refresh_token, scope, token_type, extract(epoch from expiry_date) * 1000 as expiry_date from public.google_calendar_connections where user_id = $1 limit 1",
        [userId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: "Not connected" });
      }

      const tokens = {
        access_token: rows[0].access_token as string,
        refresh_token: rows[0].refresh_token as string,
        scope: rows[0].scope as string | undefined,
        token_type: rows[0].token_type as string | undefined,
        expiry_date: rows[0].expiry_date
          ? Number(rows[0].expiry_date)
          : undefined,
      };

      // Update event
      const updatedEvent = await updateEvent(tokens, eventId, eventData);
      const mappedEvent = mapGoogleEventsToFullCalendar([updatedEvent])[0];
      const responseTime = Date.now() - startTime;

      console.log(
        `[CALENDAR] ${new Date().toISOString()} - Event updated successfully for user: ${userId} in ${responseTime}ms - Event ID: ${
          updatedEvent.id
        }`
      );

      res.json({ event: mappedEvent });
    } catch (err: any) {
      const responseTime = Date.now() - startTime;
      console.error(
        `[CALENDAR] ${new Date().toISOString()} - Error updating event for user: ${userId} in ${responseTime}ms - ${
          err.message
        }`
      );
      res.status(500).json({ error: err.message });
    }
  }
);

// Delete an event
calendarRouter.delete(
  "/events/:eventId",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    const startTime = Date.now();
    const userId = req.user!.id;
    const eventId = req.params.eventId;

    console.log(
      `[CALENDAR] ${new Date().toISOString()} - Deleting event for user: ${userId} - Event ID: ${eventId}`
    );

    try {
      // Get tokens
      const { rows } = await pgPool.query(
        "select access_token, refresh_token, scope, token_type, extract(epoch from expiry_date) * 1000 as expiry_date from public.google_calendar_connections where user_id = $1 limit 1",
        [userId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: "Not connected" });
      }

      const tokens = {
        access_token: rows[0].access_token as string,
        refresh_token: rows[0].refresh_token as string,
        scope: rows[0].scope as string | undefined,
        token_type: rows[0].token_type as string | undefined,
        expiry_date: rows[0].expiry_date
          ? Number(rows[0].expiry_date)
          : undefined,
      };

      // Delete event
      await deleteEvent(tokens, eventId);
      const responseTime = Date.now() - startTime;

      console.log(
        `[CALENDAR] ${new Date().toISOString()} - Event deleted successfully for user: ${userId} in ${responseTime}ms - Event ID: ${eventId}`
      );

      res.json({ success: true });
    } catch (err: any) {
      const responseTime = Date.now() - startTime;
      console.error(
        `[CALENDAR] ${new Date().toISOString()} - Error deleting event for user: ${userId} in ${responseTime}ms - ${
          err.message
        }`
      );
      res.status(500).json({ error: err.message });
    }
  }
);

// Get list of calendars
calendarRouter.get(
  "/calendars",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    const startTime = Date.now();
    const userId = req.user!.id;

    console.log(
      `[CALENDAR] ${new Date().toISOString()} - Fetching calendars for user: ${userId}`
    );

    try {
      // Get tokens
      const { rows } = await pgPool.query(
        "select access_token, refresh_token, scope, token_type, extract(epoch from expiry_date) * 1000 as expiry_date from public.google_calendar_connections where user_id = $1 limit 1",
        [userId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: "Not connected" });
      }

      const tokens = {
        access_token: rows[0].access_token as string,
        refresh_token: rows[0].refresh_token as string,
        scope: rows[0].scope as string | undefined,
        token_type: rows[0].token_type as string | undefined,
        expiry_date: rows[0].expiry_date
          ? Number(rows[0].expiry_date)
          : undefined,
      };

      // Get calendars
      const calendars = await listCalendars(tokens);
      const responseTime = Date.now() - startTime;

      console.log(
        `[CALENDAR] ${new Date().toISOString()} - Calendars fetched successfully for user: ${userId} in ${responseTime}ms - Total calendars: ${
          calendars.length
        }`
      );

      res.json({ calendars });
    } catch (err: any) {
      const responseTime = Date.now() - startTime;
      console.error(
        `[CALENDAR] ${new Date().toISOString()} - Error fetching calendars for user: ${userId} in ${responseTime}ms - ${
          err.message
        }`
      );
      res.status(500).json({ error: err.message });
    }
  }
);

// Get specific calendar details
calendarRouter.get(
  "/calendars/:calendarId",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    const startTime = Date.now();
    const userId = req.user!.id;
    const calendarId = req.params.calendarId;

    console.log(
      `[CALENDAR] ${new Date().toISOString()} - Fetching calendar details for user: ${userId} - Calendar ID: ${calendarId}`
    );

    try {
      // Get tokens
      const { rows } = await pgPool.query(
        "select access_token, refresh_token, scope, token_type, extract(epoch from expiry_date) * 1000 as expiry_date from public.google_calendar_connections where user_id = $1 limit 1",
        [userId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: "Not connected" });
      }

      const tokens = {
        access_token: rows[0].access_token as string,
        refresh_token: rows[0].refresh_token as string,
        scope: rows[0].scope as string | undefined,
        token_type: rows[0].token_type as string | undefined,
        expiry_date: rows[0].expiry_date
          ? Number(rows[0].expiry_date)
          : undefined,
      };

      // Get calendar
      const calendar = await getCalendar(tokens, calendarId);
      const responseTime = Date.now() - startTime;

      console.log(
        `[CALENDAR] ${new Date().toISOString()} - Calendar details fetched successfully for user: ${userId} in ${responseTime}ms - Calendar ID: ${
          calendar.id
        }`
      );

      res.json({ calendar });
    } catch (err: any) {
      const responseTime = Date.now() - startTime;
      console.error(
        `[CALENDAR] ${new Date().toISOString()} - Error fetching calendar details for user: ${userId} in ${responseTime}ms - ${
          err.message
        }`
      );
      res.status(500).json({ error: err.message });
    }
  }
);

// Update a calendar
calendarRouter.put(
  "/calendars/:calendarId",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    const startTime = Date.now();
    const userId = req.user!.id;
    const calendarId = req.params.calendarId;
    const calendarData = req.body;

    console.log(
      `[CALENDAR] ${new Date().toISOString()} - Updating calendar for user: ${userId} - Calendar ID: ${calendarId}`
    );

    try {
      // Get tokens
      const { rows } = await pgPool.query(
        "select access_token, refresh_token, scope, token_type, extract(epoch from expiry_date) * 1000 as expiry_date from public.google_calendar_connections where user_id = $1 limit 1",
        [userId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: "Not connected" });
      }

      const tokens = {
        access_token: rows[0].access_token as string,
        refresh_token: rows[0].refresh_token as string,
        scope: rows[0].scope as string | undefined,
        token_type: rows[0].token_type as string | undefined,
        expiry_date: rows[0].expiry_date
          ? Number(rows[0].expiry_date)
          : undefined,
      };

      // Update calendar
      const updatedCalendar = await updateCalendar(
        tokens,
        calendarId,
        calendarData
      );
      const responseTime = Date.now() - startTime;

      console.log(
        `[CALENDAR] ${new Date().toISOString()} - Calendar updated successfully for user: ${userId} in ${responseTime}ms - Calendar ID: ${
          updatedCalendar.id
        }`
      );

      res.json({ calendar: updatedCalendar });
    } catch (err: any) {
      const responseTime = Date.now() - startTime;
      console.error(
        `[CALENDAR] ${new Date().toISOString()} - Error updating calendar for user: ${userId} in ${responseTime}ms - ${
          err.message
        }`
      );
      res.status(500).json({ error: err.message });
    }
  }
);

// Create a new calendar
calendarRouter.post(
  "/calendars",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    const startTime = Date.now();
    const userId = req.user!.id;
    const calendarData = req.body;

    console.log(
      `[CALENDAR] ${new Date().toISOString()} - Creating calendar for user: ${userId} - Summary: ${
        calendarData.summary
      }`
    );

    try {
      // Get tokens
      const { rows } = await pgPool.query(
        "select access_token, refresh_token, scope, token_type, extract(epoch from expiry_date) * 1000 as expiry_date from public.google_calendar_connections where user_id = $1 limit 1",
        [userId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: "Not connected" });
      }

      const tokens = {
        access_token: rows[0].access_token as string,
        refresh_token: rows[0].refresh_token as string,
        scope: rows[0].scope as string | undefined,
        token_type: rows[0].token_type as string | undefined,
        expiry_date: rows[0].expiry_date
          ? Number(rows[0].expiry_date)
          : undefined,
      };

      // Create calendar
      const createdCalendar = await createCalendar(tokens, calendarData);
      const responseTime = Date.now() - startTime;

      console.log(
        `[CALENDAR] ${new Date().toISOString()} - Calendar created successfully for user: ${userId} in ${responseTime}ms - Calendar ID: ${
          createdCalendar.id
        }`
      );

      res.json({ calendar: createdCalendar });
    } catch (err: any) {
      const responseTime = Date.now() - startTime;
      console.error(
        `[CALENDAR] ${new Date().toISOString()} - Error creating calendar for user: ${userId} in ${responseTime}ms - ${
          err.message
        }`
      );
      res.status(500).json({ error: err.message });
    }
  }
);

// Delete a calendar
calendarRouter.delete(
  "/calendars/:calendarId",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    const startTime = Date.now();
    const userId = req.user!.id;
    const calendarId = req.params.calendarId;

    console.log(
      `[CALENDAR] ${new Date().toISOString()} - Deleting calendar for user: ${userId} - Calendar ID: ${calendarId}`
    );

    try {
      // Get tokens
      const { rows } = await pgPool.query(
        "select access_token, refresh_token, scope, token_type, extract(epoch from expiry_date) * 1000 as expiry_date from public.google_calendar_connections where user_id = $1 limit 1",
        [userId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: "Not connected" });
      }

      const tokens = {
        access_token: rows[0].access_token as string,
        refresh_token: rows[0].refresh_token as string,
        scope: rows[0].scope as string | undefined,
        token_type: rows[0].token_type as string | undefined,
        expiry_date: rows[0].expiry_date
          ? Number(rows[0].expiry_date)
          : undefined,
      };

      // Delete calendar
      await deleteCalendar(tokens, calendarId);
      const responseTime = Date.now() - startTime;

      console.log(
        `[CALENDAR] ${new Date().toISOString()} - Calendar deleted successfully for user: ${userId} in ${responseTime}ms - Calendar ID: ${calendarId}`
      );

      res.json({ success: true });
    } catch (err: any) {
      const responseTime = Date.now() - startTime;
      console.error(
        `[CALENDAR] ${new Date().toISOString()} - Error deleting calendar for user: ${userId} in ${responseTime}ms - ${
          err.message
        }`
      );
      res.status(500).json({ error: err.message });
    }
  }
);
