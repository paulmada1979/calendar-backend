# AididMyChat Calendar Backend

APIs to connect/disconnect Google Calendar and fetch events compatible with FullCalendar.

## Stack

- TypeScript, Node.js, Express
- Raw Postgres via `pg` (no ORM) against your existing Supabase database
- Supabase JWT auth middleware for user verification
- Google APIs (OAuth2 + Calendar)
- Docker + docker-compose

## Environment

Copy `env.example` to `.env` and fill values:

```
cp env.example .env
```

Required:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET` (from Supabase JWT Settings)
- `DATABASE_URL` (Supabase Postgres connection string)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- `APP_URL` (frontend URL)
- `STATE_JWT_SECRET` (any strong secret)

## Local Development

```
npm i
npm run dev
```

## Docker

```
docker build -t calendar-backend .
docker run --env-file .env -p 4000:4000 calendar-backend
# or
docker compose up --build
```

## Database

Run the schema once to create the integration table in your Supabase database:

```
psql "$DATABASE_URL" -f src/db/schema.sql
```

This only creates a separate `public.google_calendar_connections` table with a foreign key to existing `public.users`.

## API

- `GET /health`
- `GET /auth/google/url` (auth required): returns `{ url }` to start OAuth
- `GET /auth/google/callback?code=...&state=...`: handles provider callback, stores tokens, redirects to `${APP_URL}/calendar?connected=google`
- `POST /auth/google/disconnect` (auth required): removes connection
- `GET /calendar/events?start=ISO&end=ISO&maxResults=&q=` (auth required): returns `{ events: FullCalendarEvent[] }`

Auth: pass Supabase access token in `Authorization: Bearer <access_token>`.

This is the backend for the Google Calendar feature of the AididMyChat website.

Implemented APIs and setup per requirements:

- Connect Google account with Calendar permission
- Disconnect Google account
- Fetch calendar events with time range filtering
- Responses compatible with `@fullcalendar/core`, `@fullcalendar/daygrid`, `@fullcalendar/timegrid`, `@fullcalendar/list`
- Uses existing Supabase database; creates a separate integration table; does not modify other tables
- Supabase auth is enforced via middleware verifying Supabase JWTs (no ORM; raw Postgres via `pg`)

Tech: TypeScript, Node.js (Express), Postgres, Supabase, Google APIs, Docker

Environment

1. Copy and fill env

```
cp env.example .env
```

Required values:

- SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_JWT_SECRET (from Supabase project settings, JWT -> JWT Secret)
- DATABASE_URL (Supabase Postgres connection string)
- GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI (e.g. http://localhost:4000/auth/google/callback)
- APP_URL (your frontend, e.g. http://localhost:3000)
- STATE_JWT_SECRET (any strong random string)

Database schema (run once)
Create the integration table in your Supabase database:

```
psql "$DATABASE_URL" -f src/db/schema.sql
```

This creates `public.google_calendar_connections` with a foreign key to `auth.users(id)` and a unique index on `user_id`.

Run locally

```
npm i
npm run dev
# Health check
curl http://localhost:4000/health
```

Docker

```
docker build -t calendar-backend .
docker run --env-file .env -p 4000:4000 calendar-backend
# or
docker compose up --build
```

API

- GET /health
- GET /auth/google/url (auth required)
  - Returns `{ url }` to start OAuth. Include `Authorization: Bearer <supabase_access_token>`.
- GET /auth/google/callback?code=...&state=...
  - Handles Google callback, stores tokens for the authenticated user (from `state`), then redirects to `${APP_URL}/calendar?connected=google`.
- POST /auth/google/disconnect (auth required)
  - Removes stored tokens for the user.
- GET /calendar/events (auth required)
  - Query params: `start`, `end`, `q`, `maxResults`, `singleEvents`, `orderBy` (`startTime|updated`), `pageToken`
  - Returns `{ events: FullCalendarEvent[] }`, suitable for FullCalendar

Auth from frontend

- Retrieve Supabase access token on the frontend (`supabase.auth.getSession()`)
- Pass it as `Authorization: Bearer <access_token>` to all protected endpoints.

Code style

- Clean code, modular and maintainable
