# Calendar Backend Troubleshooting Guide

This guide helps resolve common issues with the Google Calendar integration.

## Issue 1: Google Calendar API Not Returning Events

### Symptoms

- API returns `{"events": [], "items": []}`
- No events shown in calendar
- Events exist in Google Calendar but not in API response

### Debugging Steps

#### 1. Test Connection Endpoint

```bash
# Test the new connection endpoint
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:4000/calendar/test-connection
```

This endpoint will:

- Check your Google Calendar connection
- Test with a wider date range (30 days before/after)
- Show detailed connection information
- Return sample events if found

#### 2. Check Logs

Look for these log entries:

```
[GOOGLE-SERVICE] - Making Google Calendar API request with params: {...}
[GOOGLE-SERVICE] - timeMin: ... (converted date)
[GOOGLE-SERVICE] - timeMax: ... (converted date)
[GOOGLE-SERVICE] - Google Calendar API call completed successfully
```

#### 3. Verify Date Parameters

The issue might be with date formatting. Check:

- `start` parameter: Should be ISO 8601 format (e.g., `2025-08-18T19:03:27.664Z`)
- `end` parameter: Should be ISO 8601 format (e.g., `2025-08-19T19:03:27.664Z`)

#### 4. Test with Different Date Ranges

Try these date ranges:

```bash
# Last 7 days to next 7 days
start=2025-08-11T00:00:00Z&end=2025-08-25T23:59:59Z

# Last 30 days to next 30 days
start=2025-07-19T00:00:00Z&end=2025-09-17T23:59:59Z

# Specific month (August 2025)
start=2025-08-01T00:00:00Z&end=2025-08-31T23:59:59Z
```

#### 5. Check Google Calendar Settings

- Verify the event is in your primary calendar
- Check if the event is marked as "private" or has restricted access
- Ensure the event is not deleted or cancelled
- Verify timezone settings in Google Calendar

### Common Causes

1. **Date Range Too Narrow**: The requested date range might not include your event
2. **Timezone Issues**: Date conversion between UTC and local time
3. **Calendar Access**: The OAuth scope might not have sufficient permissions
4. **Event Privacy**: Events might be marked as private or restricted
5. **API Quotas**: Google Calendar API might have rate limits

## Issue 2: Frontend Shows "Connect Calendar" Button

### Symptoms

- Backend shows user is connected
- Frontend still shows "Connect Google Calendar" button
- Connection status not syncing between backend and frontend

### Debugging Steps

#### 1. Check Browser Console

Look for these log messages:

```
[CALENDAR] Connection check: Connected successfully {...}
[CALENDAR] Connection check: Not connected (404)
[CALENDAR] Connection check: Connection failed {...}
```

#### 2. Test Connection Check

The frontend now uses `/calendar/test-connection` to check status:

```javascript
// This endpoint provides detailed connection information
GET / calendar / test - connection;
```

#### 3. Verify Authentication

Ensure the user is properly authenticated:

```javascript
// Check if user has valid session
const { data } = await supabase.auth.getSession();
console.log("Session:", data.session);
```

#### 4. Check Network Requests

In browser DevTools → Network tab:

- Look for requests to `/calendar/test-connection`
- Check response status codes
- Verify Authorization headers are present

### Common Causes

1. **Token Expiry**: Access token might have expired
2. **CORS Issues**: Cross-origin requests might be blocked
3. **Authentication State**: Supabase session might be invalid
4. **API Endpoint**: The connection check endpoint might be failing

## Issue 3: Date Validation Errors

### Symptoms

- `RangeError: Invalid time value`
- API returns 400 Bad Request for date parameters
- Date conversion failures

### Debugging Steps

#### 1. Check Date Format

Ensure dates are in valid ISO 8601 format:

```javascript
// Valid formats
"2025-08-18T19:03:27.664Z"; // UTC
"2025-08-18T19:03:27.664+06:00"; // With timezone offset
"2025-08-18"; // Date only (all-day events)
```

#### 2. Test Date Validation

The backend now validates dates before processing:

```javascript
// Invalid dates will return 400 Bad Request
// with specific error messages
```

#### 3. Check Frontend Date Generation

Verify how dates are generated in the frontend:

```javascript
// FullCalendar should provide valid ISO strings
const start = arg.startStr; // Should be valid ISO string
const end = arg.endStr; // Should be valid ISO string
```

## Debugging Tools

### 1. Debug Calendar Script

```bash
npm run debug:calendar
```

This script checks:

- Environment variables
- OAuth client creation
- Auth URL generation
- Common configuration issues

### 2. Test Logging

```bash
npm run test:logging
```

Tests the logging system and shows different log levels.

### 3. Test Endpoints

```bash
# Health check
curl http://localhost:4000/health

# Test logging
curl http://localhost:4000/test-logging

# Test calendar connection (requires auth)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:4000/calendar/test-connection
```

## Environment Variables

Ensure these are set in your `.env` file:

```bash
# Google OAuth
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:4000/auth/google/callback

# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_JWT_SECRET=your_jwt_secret

# Database
DATABASE_URL=your_database_url

# App
APP_URL=http://localhost:3000
NODE_ENV=development
LOG_LEVEL=DEBUG
```

## Log Levels

Control logging verbosity:

```bash
# Show all logs
LOG_LEVEL=DEBUG npm run dev

# Show only warnings and errors
LOG_LEVEL=WARN npm run dev

# Show only errors
LOG_LEVEL=ERROR npm run dev
```

## Next Steps

1. **Test the connection endpoint** to see detailed connection info
2. **Check the logs** for API request/response details
3. **Verify date ranges** being sent to Google API
4. **Test with wider date ranges** to see if events exist
5. **Check Google Calendar settings** for event visibility

## Getting Help

If issues persist:

1. Check the logs for detailed error messages
2. Test with the `/calendar/test-connection` endpoint
3. Verify Google Calendar API is enabled in Google Cloud Console
4. Check OAuth consent screen configuration
5. Verify the calendar has events in the specified date range
