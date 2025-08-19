import { google, Auth, calendar_v3 } from "googleapis";

export function createOAuthClient(): Auth.OAuth2Client {
  console.log(
    `[GOOGLE-SERVICE] ${new Date().toISOString()} - Creating OAuth2 client`
  );
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  return client;
}

export function getAuthUrl(state: string) {
  console.log(
    `[GOOGLE-SERVICE] ${new Date().toISOString()} - Generating Google OAuth URL with state: ${state.substring(
      0,
      20
    )}...`
  );
  const client = createOAuthClient();
  const scopes = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
    "openid",
    "email",
    "profile",
  ];

  const url = client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent",
    state,
  });

  console.log(
    `[GOOGLE-SERVICE] ${new Date().toISOString()} - Google OAuth URL generated successfully - Scopes: ${scopes.join(
      ", "
    )}`
  );
  return url;
}

export async function exchangeCodeForTokens(code: string) {
  console.log(
    `[GOOGLE-SERVICE] ${new Date().toISOString()} - Exchanging authorization code for tokens`
  );
  const startTime = Date.now();

  try {
    const client = createOAuthClient();
    const { tokens } = await client.getToken(code);

    const responseTime = Date.now() - startTime;
    console.log(
      `[GOOGLE-SERVICE] ${new Date().toISOString()} - Token exchange completed successfully in ${responseTime}ms - Access token: ${!!tokens.access_token}, Refresh token: ${!!tokens.refresh_token}, Scope: ${
        tokens.scope || "none"
      }`
    );

    return tokens;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(
      `[GOOGLE-SERVICE] ${new Date().toISOString()} - Token exchange failed in ${responseTime}ms - Error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
    throw error;
  }
}

export function getCalendarClient(tokens: Auth.Credentials) {
  console.log(
    `[GOOGLE-SERVICE] ${new Date().toISOString()} - Creating Google Calendar client with tokens - Access token: ${!!tokens.access_token}, Refresh token: ${!!tokens.refresh_token}`
  );
  const client = createOAuthClient();
  client.setCredentials(tokens);
  return google.calendar({ version: "v3", auth: client });
}

export async function listEvents(
  tokens: Auth.Credentials,
  params: {
    timeMin?: string;
    timeMax?: string;
    maxResults?: number;
    q?: string;
    singleEvents?: boolean;
    orderBy?: "startTime" | "updated";
    pageToken?: string;
    calendarId?: string;
  } & Record<string, any>
): Promise<calendar_v3.Schema$Events> {
  const startTime = Date.now();
  console.log(
    `[GOOGLE-SERVICE] ${new Date().toISOString()} - Fetching events from Google Calendar API - Params: ${JSON.stringify(
      params
    )}`
  );

  try {
    const calendar = getCalendarClient(tokens);

    // Add more debugging for date parameters
    if (params.timeMin) {
      console.log(
        `[GOOGLE-SERVICE] ${new Date().toISOString()} - timeMin: ${
          params.timeMin
        } (${new Date(params.timeMin).toISOString()})`
      );
    }
    if (params.timeMax) {
      console.log(
        `[GOOGLE-SERVICE] ${new Date().toISOString()} - timeMax: ${
          params.timeMax
        } (${new Date(params.timeMax).toISOString()})`
      );
    }

    const requestParams = {
      calendarId: params.calendarId || "primary",
      timeMin: params.timeMin,
      timeMax: params.timeMax,
      maxResults: params.maxResults ?? 2500,
      q: params.q,
      singleEvents: params.singleEvents ?? true,
      orderBy: params.orderBy ?? "startTime",
      pageToken: params.pageToken,
      // Add timezone to ensure proper date handling
      timeZone: "UTC",
      // Add showDeleted: false to exclude deleted events
      showDeleted: false,
      // Add alwaysIncludeEmail: true to get attendee information
      alwaysIncludeEmail: true,
    };

    console.log(
      `[GOOGLE-SERVICE] ${new Date().toISOString()} - Making Google Calendar API request with params:`,
      requestParams
    );

    const response = await calendar.events.list(requestParams);

    const responseTime = Date.now() - startTime;
    const eventCount = response.data.items?.length || 0;

    console.log(
      `[GOOGLE-SERVICE] ${new Date().toISOString()} - Google Calendar API call completed successfully in ${responseTime}ms - Events returned: ${eventCount}, Next page token: ${
        response.data.nextPageToken ? "Present" : "None"
      }`
    );

    // Log some details about the response
    if (response.data.items && response.data.items.length > 0) {
      console.log(
        `[GOOGLE-SERVICE] ${new Date().toISOString()} - Sample event:`,
        {
          id: response.data.items[0].id,
          summary: response.data.items[0].summary,
          start: response.data.items[0].start,
          end: response.data.items[0].end,
          allDay: response.data.items[0].start?.date ? true : false,
        }
      );
    } else {
      console.log(
        `[GOOGLE-SERVICE] ${new Date().toISOString()} - No events found in the specified time range`
      );
    }

    return response.data;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(
      `[GOOGLE-SERVICE] ${new Date().toISOString()} - Google Calendar API call failed in ${responseTime}ms - Error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );

    // Log more details about the error
    if (error instanceof Error) {
      console.error(
        `[GOOGLE-SERVICE] ${new Date().toISOString()} - Error stack:`,
        error.stack
      );
    }

    throw error;
  }
}

export async function createEvent(
  tokens: Auth.Credentials,
  eventData: {
    summary: string;
    description?: string;
    location?: string;
    start: { dateTime?: string; date?: string; timeZone?: string };
    end: { dateTime?: string; date?: string; timeZone?: string };
    attendees?: Array<{ email: string; displayName?: string }>;
    reminders?:
      | { useDefault: boolean }
      | { overrides: Array<{ method: string; minutes: number }> };
    colorId?: string;
    transparency?: "opaque" | "transparent";
    visibility?: "default" | "public" | "private" | "confidential";
  }
): Promise<calendar_v3.Schema$Event> {
  const startTime = Date.now();
  console.log(
    `[GOOGLE-SERVICE] ${new Date().toISOString()} - Creating event in Google Calendar - Summary: ${
      eventData.summary
    }`
  );
  console.log(
    `[GOOGLE-SERVICE] ${new Date().toISOString()} - Full event data: ${JSON.stringify(
      eventData
    )}`
  );

  try {
    const calendar = getCalendarClient(tokens);
    console.log(
      `[GOOGLE-SERVICE] ${new Date().toISOString()} - Google Calendar client created successfully`
    );

    const event = {
      summary: eventData.summary,
      description: eventData.description,
      location: eventData.location,
      start: eventData.start,
      end: eventData.end,
      attendees: eventData.attendees,
      reminders: eventData.reminders,
      colorId: eventData.colorId,
      transparency: eventData.transparency,
      visibility: eventData.visibility,
    };

    console.log(
      `[GOOGLE-SERVICE] ${new Date().toISOString()} - Event object prepared: ${JSON.stringify(
        event
      )}`
    );

    console.log(
      `[GOOGLE-SERVICE] ${new Date().toISOString()} - Making Google Calendar API call to insert event`
    );

    const response = await calendar.events.insert({
      calendarId: "primary",
      requestBody: event,
      sendUpdates: "all",
    });

    const responseTime = Date.now() - startTime;
    console.log(
      `[GOOGLE-SERVICE] ${new Date().toISOString()} - Event created successfully in ${responseTime}ms - Event ID: ${
        response.data.id
      }`
    );

    return response.data;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(
      `[GOOGLE-SERVICE] ${new Date().toISOString()} - Event creation failed in ${responseTime}ms - Error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
    console.error(
      `[GOOGLE-SERVICE] ${new Date().toISOString()} - Full error details: ${JSON.stringify(
        error
      )}`
    );
    throw error;
  }
}

export async function updateEvent(
  tokens: Auth.Credentials,
  eventId: string,
  eventData: Partial<{
    summary: string;
    description: string;
    location: string;
    start: { dateTime?: string; date?: string; timeZone?: string };
    end: { dateTime?: string; date?: string; timeZone?: string };
    attendees: Array<{ email: string; displayName?: string }>;
    reminders:
      | { useDefault: boolean }
      | { overrides: Array<{ method: string; minutes: number }> };
    colorId: string;
    transparency: "opaque" | "transparent";
    visibility: "default" | "public" | "private" | "confidential";
    calendarId?: string;
  }>
): Promise<calendar_v3.Schema$Event> {
  const startTime = Date.now();
  console.log(
    `[GOOGLE-SERVICE] ${new Date().toISOString()} - Updating event in Google Calendar - Event ID: ${eventId}`
  );
  console.log(
    `[GOOGLE-SERVICE] ${new Date().toISOString()} - Update data received: ${JSON.stringify(
      eventData
    )}`
  );

  try {
    const calendar = getCalendarClient(tokens);

    // First, get the existing event to merge with updates
    const calendarId = eventData.calendarId || "primary";
    const existingEvent = await calendar.events.get({
      calendarId: calendarId,
      eventId: eventId,
    });

    console.log(
      `[GOOGLE-SERVICE] ${new Date().toISOString()} - Existing event data: ${JSON.stringify(
        {
          start: existingEvent.data.start,
          end: existingEvent.data.end,
          allDay: existingEvent.data.start?.date ? true : false,
        }
      )}`
    );

    // Merge existing event with updates
    const mergedEventData = {
      ...existingEvent.data,
      ...eventData,
    };

    // Ensure we have both start and end times for non-all-day events
    if (
      mergedEventData.start &&
      !mergedEventData.end &&
      !mergedEventData.start.date
    ) {
      // If we only have start time and it's not an all-day event, calculate end time
      if (existingEvent.data.start && existingEvent.data.end) {
        const originalStart = new Date(
          existingEvent.data.start.dateTime || existingEvent.data.start.date!
        );
        const originalEnd = new Date(
          existingEvent.data.end.dateTime || existingEvent.data.end.date!
        );
        const duration = originalEnd.getTime() - originalStart.getTime();

        const newStart = new Date(mergedEventData.start.dateTime!);
        const newEnd = new Date(newStart.getTime() + duration);

        mergedEventData.end = {
          dateTime: newEnd.toISOString(),
          timeZone:
            mergedEventData.start.timeZone ||
            existingEvent.data.start?.timeZone ||
            "UTC",
        };

        console.log(
          `[GOOGLE-SERVICE] ${new Date().toISOString()} - Calculated end time: ${JSON.stringify(
            mergedEventData.end
          )}`
        );
      } else {
        // If no existing end time, create a default 1-hour duration
        const newStart = new Date(mergedEventData.start.dateTime!);
        const newEnd = new Date(newStart.getTime() + 60 * 60 * 1000); // 1 hour later

        mergedEventData.end = {
          dateTime: newEnd.toISOString(),
          timeZone:
            mergedEventData.start.timeZone ||
            existingEvent.data.start?.timeZone ||
            "UTC",
        };

        console.log(
          `[GOOGLE-SERVICE] ${new Date().toISOString()} - Created default end time (1 hour): ${JSON.stringify(
            mergedEventData.end
          )}`
        );
      }
    } else if (mergedEventData.start?.date && !mergedEventData.end?.date) {
      // Handle all-day events - ensure they have both start and end dates
      if (existingEvent.data.start?.date && existingEvent.data.end?.date) {
        const originalStart = new Date(existingEvent.data.start.date);
        const originalEnd = new Date(existingEvent.data.end.date);
        const duration = originalEnd.getTime() - originalStart.getTime();

        const newStart = new Date(mergedEventData.start.date);
        const newEnd = new Date(newStart.getTime() + duration);

        mergedEventData.end = {
          date: newEnd.toISOString().split("T")[0], // Just the date part
        };

        console.log(
          `[GOOGLE-SERVICE] ${new Date().toISOString()} - Calculated all-day end date: ${JSON.stringify(
            mergedEventData.end
          )}`
        );
      } else {
        // Default to 1 day duration for all-day events
        const newStart = new Date(mergedEventData.start.date);
        const newEnd = new Date(newStart.getTime() + 24 * 60 * 60 * 1000); // 1 day later

        mergedEventData.end = {
          date: newEnd.toISOString().split("T")[0], // Just the date part
        };

        console.log(
          `[GOOGLE-SERVICE] ${new Date().toISOString()} - Created default all-day end date: ${JSON.stringify(
            mergedEventData.end
          )}`
        );
      }
    }

    // CRITICAL: Ensure we always have both start and end times
    if (!mergedEventData.start || !mergedEventData.end) {
      throw new Error(
        "Both start and end times are required for event updates"
      );
    }

    // Validate that start is before end
    let startTime: Date, endTime: Date;

    if (mergedEventData.start.date) {
      // All-day event
      startTime = new Date(mergedEventData.start.date);
      endTime = new Date(
        mergedEventData.end.date || mergedEventData.end.dateTime!
      );
    } else {
      // Time-based event
      startTime = new Date(mergedEventData.start.dateTime!);
      endTime = new Date(mergedEventData.end.dateTime!);
    }

    if (startTime >= endTime) {
      console.log(
        `[GOOGLE-SERVICE] ${new Date().toISOString()} - Invalid time range detected, start: ${startTime.toISOString()}, end: ${endTime.toISOString()}`
      );

      // Fix invalid time range by ensuring end is after start
      if (mergedEventData.start.date) {
        // All-day event: ensure end date is at least 1 day after start
        const newEndDate = new Date(startTime);
        newEndDate.setDate(newEndDate.getDate() + 1);
        mergedEventData.end = {
          date: newEndDate.toISOString().split("T")[0],
        };
      } else {
        // Time-based event: ensure end time is at least 1 hour after start
        const newEndTime = new Date(startTime.getTime() + 60 * 60 * 1000);
        mergedEventData.end = {
          dateTime: newEndTime.toISOString(),
          timeZone: mergedEventData.start.timeZone || "UTC",
        };
      }

      console.log(
        `[GOOGLE-SERVICE] ${new Date().toISOString()} - Fixed time range: ${JSON.stringify(
          mergedEventData.end
        )}`
      );
    }

    // Ensure format consistency - both start and end must use the same format
    if (mergedEventData.start && mergedEventData.end) {
      const isStartAllDay = !!mergedEventData.start.date;
      const isEndAllDay = !!mergedEventData.end.date;

      if (isStartAllDay !== isEndAllDay) {
        console.log(
          `[GOOGLE-SERVICE] ${new Date().toISOString()} - Format mismatch detected, fixing consistency`
        );

        if (isStartAllDay) {
          // Start is all-day, make end all-day too
          if (mergedEventData.end.dateTime) {
            const endDate = new Date(mergedEventData.end.dateTime);
            mergedEventData.end = {
              date: endDate.toISOString().split("T")[0],
            };
            console.log(
              `[GOOGLE-SERVICE] ${new Date().toISOString()} - Converted end to all-day format: ${JSON.stringify(
                mergedEventData.end
              )}`
            );
          }
        } else {
          // Start is time-based, make end time-based too
          if (mergedEventData.end.date) {
            const endDate = new Date(mergedEventData.end.date);
            // Set to end of the day
            endDate.setHours(23, 59, 59, 999);
            mergedEventData.end = {
              dateTime: endDate.toISOString(),
              timeZone: mergedEventData.start.timeZone || "UTC",
            };
            console.log(
              `[GOOGLE-SERVICE] ${new Date().toISOString()} - Converted end to time-based format: ${JSON.stringify(
                mergedEventData.end
              )}`
            );
          }
        }
      }
    }

    console.log(
      `[GOOGLE-SERVICE] ${new Date().toISOString()} - Merged event data: ${JSON.stringify(
        {
          start: mergedEventData.start,
          end: mergedEventData.end,
          allDay: mergedEventData.start?.date ? true : false,
        }
      )}`
    );

    const response = await calendar.events.update({
      calendarId: calendarId,
      eventId: eventId,
      requestBody: mergedEventData,
      sendUpdates: "all",
    });

    const responseTime = Date.now() - startTime;
    console.log(
      `[GOOGLE-SERVICE] ${new Date().toISOString()} - Event updated successfully in ${responseTime}ms - Event ID: ${
        response.data.id
      }`
    );

    return response.data;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(
      `[GOOGLE-SERVICE] ${new Date().toISOString()} - Event update failed in ${responseTime}ms - Error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
    throw error;
  }
}

export async function deleteEvent(
  tokens: Auth.Credentials,
  eventId: string
): Promise<void> {
  const startTime = Date.now();
  console.log(
    `[GOOGLE-SERVICE] ${new Date().toISOString()} - Deleting event from Google Calendar - Event ID: ${eventId}`
  );

  try {
    const calendar = getCalendarClient(tokens);

    await calendar.events.delete({
      calendarId: "primary",
      eventId: eventId,
      sendUpdates: "all",
    });

    const responseTime = Date.now() - startTime;
    console.log(
      `[GOOGLE-SERVICE] ${new Date().toISOString()} - Event deleted successfully in ${responseTime}ms - Event ID: ${eventId}`
    );
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(
      `[GOOGLE-SERVICE] ${new Date().toISOString()} - Event deletion failed in ${responseTime}ms - Error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
    throw error;
  }
}

export async function listCalendars(
  tokens: Auth.Credentials
): Promise<calendar_v3.Schema$CalendarListEntry[]> {
  const startTime = Date.now();
  console.log(
    `[GOOGLE-SERVICE] ${new Date().toISOString()} - Fetching calendar list from Google Calendar API`
  );

  try {
    const calendar = getCalendarClient(tokens);

    const response = await calendar.calendarList.list({
      maxResults: 250,
      showDeleted: false,
      showHidden: false,
    });

    const responseTime = Date.now() - startTime;
    const calendarCount = response.data.items?.length || 0;

    console.log(
      `[GOOGLE-SERVICE] ${new Date().toISOString()} - Calendar list fetched successfully in ${responseTime}ms - Calendars returned: ${calendarCount}`
    );

    // Debug: Log each calendar's details
    if (response.data.items) {
      response.data.items.forEach((cal, index) => {
        console.log(`[GOOGLE-SERVICE] Calendar ${index + 1}:`, {
          id: cal.id,
          summary: cal.summary,
          primary: cal.primary,
          accessRole: cal.accessRole,
          selected: cal.selected,
          description: cal.description,
        });
      });
    }

    return response.data.items || [];
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(
      `[GOOGLE-SERVICE] ${new Date().toISOString()} - Calendar list fetch failed in ${responseTime}ms - Error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
    throw error;
  }
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<Auth.Credentials> {
  const startTime = Date.now();
  console.log(
    `[GOOGLE-SERVICE] ${new Date().toISOString()} - Refreshing access token`
  );

  try {
    const client = createOAuthClient();
    // Set the refresh token and get new credentials
    client.setCredentials({ refresh_token: refreshToken });
    const response = await client.getAccessToken();

    const responseTime = Date.now() - startTime;
    console.log(
      `[GOOGLE-SERVICE] ${new Date().toISOString()} - Access token refreshed successfully in ${responseTime}ms`
    );

    return {
      access_token: response.token || "",
      refresh_token: refreshToken, // Keep the original refresh token
      scope: undefined,
      token_type: "Bearer",
      expiry_date: undefined,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(
      `[GOOGLE-SERVICE] ${new Date().toISOString()} - Access token refresh failed in ${responseTime}ms - Error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
    throw error;
  }
}

export async function getValidTokens(
  tokens: Auth.Credentials
): Promise<Auth.Credentials> {
  const startTime = Date.now();
  console.log(
    `[GOOGLE-SERVICE] ${new Date().toISOString()} - Validating tokens`
  );

  try {
    // Check if access token is expired or will expire soon (within 5 minutes)
    const now = Date.now();
    const expiryTime = tokens.expiry_date || 0;
    const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds

    if (expiryTime && now + fiveMinutes >= expiryTime) {
      console.log(
        `[GOOGLE-SERVICE] ${new Date().toISOString()} - Access token expired or expiring soon, refreshing...`
      );

      if (!tokens.refresh_token) {
        throw new Error("No refresh token available");
      }

      const refreshedTokens = await refreshAccessToken(tokens.refresh_token);
      const responseTime = Date.now() - startTime;

      console.log(
        `[GOOGLE-SERVICE] ${new Date().toISOString()} - Tokens validated and refreshed in ${responseTime}ms`
      );

      return refreshedTokens;
    }

    const responseTime = Date.now() - startTime;
    console.log(
      `[GOOGLE-SERVICE] ${new Date().toISOString()} - Tokens are still valid in ${responseTime}ms`
    );

    return tokens;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(
      `[GOOGLE-SERVICE] ${new Date().toISOString()} - Token validation failed in ${responseTime}ms - Error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
    throw error;
  }
}

export async function getPrimaryCalendarTimezone(
  tokens: Auth.Credentials
): Promise<string | null> {
  const startTime = Date.now();
  console.log(
    `[GOOGLE-SERVICE] ${new Date().toISOString()} - Fetching primary calendar timezone`
  );

  try {
    const calendar = getCalendarClient(tokens);

    const response = await calendar.calendars.get({
      calendarId: "primary",
    });

    const timezone = response.data.timeZone;
    const responseTime = Date.now() - startTime;

    console.log(
      `[GOOGLE-SERVICE] ${new Date().toISOString()} - Primary calendar timezone fetched successfully in ${responseTime}ms - Timezone: ${timezone}`
    );

    return timezone || null;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(
      `[GOOGLE-SERVICE] ${new Date().toISOString()} - Primary calendar timezone fetch failed in ${responseTime}ms - Error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
    return null;
  }
}

export async function getCalendar(
  tokens: Auth.Credentials,
  calendarId: string
): Promise<calendar_v3.Schema$Calendar> {
  const startTime = Date.now();
  console.log(
    `[GOOGLE-SERVICE] ${new Date().toISOString()} - Fetching calendar details - Calendar ID: ${calendarId}`
  );

  try {
    const calendar = getCalendarClient(tokens);

    const response = await calendar.calendars.get({
      calendarId: calendarId,
    });

    const responseTime = Date.now() - startTime;
    console.log(
      `[GOOGLE-SERVICE] ${new Date().toISOString()} - Calendar details fetched successfully in ${responseTime}ms - Calendar ID: ${
        response.data.id
      }`
    );

    return response.data;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(
      `[GOOGLE-SERVICE] ${new Date().toISOString()} - Calendar details fetch failed in ${responseTime}ms - Error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
    throw error;
  }
}

export async function createCalendar(
  tokens: Auth.Credentials,
  calendarData: {
    summary: string;
    description?: string;
    location?: string;
    timeZone?: string;
    colorId?: string;
  }
): Promise<calendar_v3.Schema$Calendar> {
  const startTime = Date.now();
  console.log(
    `[GOOGLE-SERVICE] ${new Date().toISOString()} - Creating calendar in Google Calendar - Summary: ${
      calendarData.summary
    }`
  );

  try {
    const calendar = getCalendarClient(tokens);

    const response = await calendar.calendars.insert({
      requestBody: calendarData,
    });

    const responseTime = Date.now() - startTime;
    console.log(
      `[GOOGLE-SERVICE] ${new Date().toISOString()} - Calendar created successfully in ${responseTime}ms - Calendar ID: ${
        response.data.id
      }`
    );

    return response.data;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(
      `[GOOGLE-SERVICE] ${new Date().toISOString()} - Calendar creation failed in ${responseTime}ms - Error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
    throw error;
  }
}

export async function deleteCalendar(
  tokens: Auth.Credentials,
  calendarId: string
): Promise<void> {
  const startTime = Date.now();
  console.log(
    `[GOOGLE-SERVICE] ${new Date().toISOString()} - Deleting calendar from Google Calendar - Calendar ID: ${calendarId}`
  );

  try {
    const calendar = getCalendarClient(tokens);

    await calendar.calendars.delete({
      calendarId: calendarId,
    });

    const responseTime = Date.now() - startTime;
    console.log(
      `[GOOGLE-SERVICE] ${new Date().toISOString()} - Calendar deleted successfully in ${responseTime}ms - Calendar ID: ${calendarId}`
    );
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(
      `[GOOGLE-SERVICE] ${new Date().toISOString()} - Calendar deletion failed in ${responseTime}ms - Error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
    throw error;
  }
}

export async function updateCalendar(
  tokens: Auth.Credentials,
  calendarId: string,
  calendarData: Partial<{
    summary: string;
    description: string;
    location: string;
    timeZone: string;
    colorId: string;
  }>
): Promise<calendar_v3.Schema$Calendar> {
  const startTime = Date.now();
  console.log(
    `[GOOGLE-SERVICE] ${new Date().toISOString()} - Updating calendar - Calendar ID: ${calendarId}`
  );

  try {
    const calendar = getCalendarClient(tokens);

    const response = await calendar.calendars.update({
      calendarId: calendarId,
      requestBody: calendarData,
    });

    const responseTime = Date.now() - startTime;
    console.log(
      `[GOOGLE-SERVICE] ${new Date().toISOString()} - Calendar updated successfully in ${responseTime}ms - Calendar ID: ${
        response.data.id
      }`
    );

    return response.data;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(
      `[GOOGLE-SERVICE] ${new Date().toISOString()} - Calendar update failed in ${responseTime}ms - Error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
    throw error;
  }
}
