import { google, Auth, calendar_v3 } from "googleapis";

export function createOAuthClient(): Auth.OAuth2Client {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  return client;
}

export function getAuthUrl(state: string) {
  const client = createOAuthClient();
  const scopes = [
    "https://www.googleapis.com/auth/calendar.readonly",
    "openid",
    "email",
    "profile",
  ];
  return client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent",
    state,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

export function getCalendarClient(tokens: Auth.Credentials) {
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
  } & Record<string, any>
): Promise<calendar_v3.Schema$Events> {
  const calendar = getCalendarClient(tokens);
  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin: params.timeMin,
    timeMax: params.timeMax,
    maxResults: params.maxResults ?? 2500,
    q: params.q,
    singleEvents: params.singleEvents ?? true,
    orderBy: params.orderBy ?? "startTime",
    pageToken: params.pageToken,
  });
  return response.data;
}
