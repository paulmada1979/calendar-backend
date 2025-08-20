# Database Schema Documentation

## Overview

This document describes the database schema for the Calendar Backend application, including the new tables for user preferences, timeline data, and calendar events storage.

## Tables

### 1. google_calendar_connections

Stores Google Calendar OAuth connections for users.

**Columns:**

- `id` (uuid, primary key): Unique identifier
- `user_id` (uuid, not null): Reference to auth.users table
- `provider` (text): OAuth provider (default: 'google')
- `access_token` (text, not null): OAuth access token
- `refresh_token` (text, not null): OAuth refresh token
- `scope` (text): OAuth scope
- `token_type` (text): Token type
- `expiry_date` (timestamptz): Token expiry date
- `created_at` (timestamptz): Record creation timestamp
- `updated_at` (timestamptz): Record update timestamp

**Indexes:**

- `idx_google_calendar_connections_user`: On user_id
- `ux_google_calendar_connections_user`: Unique on user_id

### 2. user_preferences

Stores user preferences including timezone and locale settings.

**Columns:**

- `id` (uuid, primary key): Unique identifier
- `user_id` (uuid, not null): Reference to auth.users table
- `timezone` (text, not null): User's selected timezone (default: 'UTC')
- `locale` (text, not null): User's selected locale (default: 'en-US')
- `created_at` (timestamptz): Record creation timestamp
- `updated_at` (timestamptz): Record update timestamp

**Indexes:**

- `ux_user_preferences_user`: Unique on user_id

### 3. user_timelines

Stores user's world timeline configurations and timezone places.

**Columns:**

- `id` (uuid, primary key): Unique identifier
- `user_id` (uuid, not null): Reference to auth.users table
- `place_id` (text, not null): Timezone identifier (e.g., 'America/New_York')
- `city` (text, not null): City name
- `country` (text, not null): Country name
- `zone` (text, not null): Full timezone string
  - `timezone_offset` (numeric(4,2), not null): Timezone offset in hours
- `locale` (text, not null): Locale (default: 'en')
- `display_order` (integer, not null): Display order for timeline (default: 0)
- `is_active` (boolean, not null): Whether the place is active (default: true) - **Note: This field is deprecated and no longer used. Records are now hard deleted.**
- `created_at` (timestamptz): Record creation timestamp
- `updated_at` (timestamptz): Record update timestamp

**Indexes:**

- `idx_user_timelines_user`: On user_id
- `idx_user_timelines_active`: On user_id and is_active - **Note: This index is deprecated and no longer used.**

### 4. calendar_events

Stores Google Calendar events locally for persistence and offline access.

**Columns:**

- `id` (uuid, primary key): Unique identifier
- `user_id` (uuid, not null): Reference to auth.users table
- `google_event_id` (text, not null): Google Calendar event ID
- `calendar_id` (text, not null): Google Calendar ID
- `summary` (text, not null): Event title/summary
- `description` (text): Event description
- `location` (text): Event location
- `start_time` (timestamptz, not null): Event start time
- `end_time` (timestamptz): Event end time
- `all_day` (boolean, not null): Whether event is all-day (default: false)
- `attendees` (jsonb): Event attendees as JSON array
- `color_id` (text): Event color ID
- `transparency` (text): Event transparency (default: 'opaque')
- `visibility` (text): Event visibility (default: 'default')
- `event_type` (text): Event type (default: 'meeting')
- `created_at` (timestamptz): Record creation timestamp
- `updated_at` (timestamptz): Record update timestamp

**Indexes:**

- `idx_calendar_events_user`: On user_id
- `idx_calendar_events_google_id`: On google_event_id
- `idx_calendar_events_calendar`: On user_id and calendar_id
- `idx_calendar_events_time_range`: On user_id, start_time, and end_time
- `ux_calendar_events_user_google`: Unique on user_id and google_event_id

## Triggers

All tables with `updated_at` columns have triggers that automatically update the timestamp when records are modified.

## API Endpoints

### User Preferences (`/user`)

#### GET `/user/preferences`

Get user preferences (timezone, locale).

**Response:**

```json
{
  "preferences": {
    "id": "uuid",
    "user_id": "uuid",
    "timezone": "America/New_York",
    "locale": "en-US",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
}
```

#### PUT `/user/preferences`

Update user preferences.

**Request Body:**

```json
{
  "timezone": "Europe/London",
  "locale": "en-GB"
}
```

### User Timelines (`/user`)

#### GET `/user/timelines`

Get user's timeline places.

**Response:**

```json
{
  "timelines": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "place_id": "America/New_York",
      "city": "New York",
      "country": "United States",
      "zone": "America/New_York",
      "timezone_offset": -5.0,
      "locale": "en",
      "display_order": 0,
      "is_active": true,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### POST `/user/timelines`

Add a new timeline place.

**Request Body:**

```json
{
  "place_id": "Europe/London",
  "city": "London",
  "country": "United Kingdom",
  "zone": "Europe/London",
  "timezone_offset": 0.0,
  "locale": "en"
}
```

#### PUT `/user/timelines/:id`

Update a timeline place.

**Request Body:**

```json
{
  "city": "Updated City",
  "display_order": 1
}
```

#### DELETE `/user/timelines/:id`

Remove a timeline place (soft delete).

#### PUT `/user/timelines/reorder`

Reorder timeline places.

**Request Body:**

```json
{
  "timelineIds": ["uuid1", "uuid2", "uuid3"]
}
```

## Migration

To apply the new schema, run the migration file:

```sql
-- Run the migration file
\i src/db/migration_001_user_preferences_and_events.sql
```

## Data Flow

1. **Event Fetching**: When events are fetched from Google Calendar API, they are automatically stored in the `calendar_events` table.
2. **User Preferences**: User timezone and locale preferences are stored and retrieved from the `user_preferences` table.
3. **Timeline Data**: User's world timeline configurations are persisted in the `user_timelines` table.
4. **Offline Access**: Stored events can be accessed even when Google Calendar API is unavailable.

## Notes

- All foreign keys reference `auth.users(id)` with cascade delete
- Events are stored automatically without changing the existing event fetching logic
- Timeline places use soft delete (setting `is_active` to false) rather than hard delete
- The system maintains backward compatibility with existing functionality
