# Google Drive Integration with Composio

This document describes the Google Drive integration implemented using Composio for the calendar backend application.

## Overview

The Google Drive integration provides comprehensive file management capabilities including:

- File listing and search
- Folder creation and management
- File upload and download
- Permission management
- Storage quota monitoring
- User profile information

## Architecture

```
Frontend → Backend API → Composio Service → Google Drive API
```

The integration uses Composio as an intermediary to handle OAuth authentication and API calls to Google Drive, providing a secure and scalable solution.

## Features

### 1. File Management

- **List all files**: Get paginated list of all files in user's Google Drive
- **Search files**: Search files by name, content, or metadata
- **File details**: Get comprehensive file information including permissions
- **Folder contents**: Browse specific folder contents

### 2. File Operations

- **Create folders**: Create new folders with optional parent folder
- **Upload files**: Upload files with metadata and content
- **File permissions**: Manage file sharing and access control

### 3. Permission Management

- **View permissions**: See who has access to files
- **Add permissions**: Share files with users, groups, or domains
- **Update permissions**: Modify existing access levels
- **Remove permissions**: Revoke access to files

### 4. Storage & Quota

- **Storage quota**: Monitor available and used storage
- **User profile**: Get Google Drive account information

## API Endpoints

### Authentication

- `POST /social/connect/googledrive` - Connect Google Drive account
- `GET /social/callback/googledrive` - OAuth callback handler
- `POST /social/disconnect/googledrive` - Disconnect Google Drive account

### File Operations

- `GET /social/google-drive/files` - List all files
- `GET /social/google-drive/search?q={query}` - Search files
- `GET /social/google-drive/files/:fileId` - Get file details
- `GET /social/google-drive/folders/:folderId` - Get folder contents
- `POST /social/google-drive/folders` - Create new folder
- `POST /social/google-drive/upload` - Upload file

### Permission Management

- `GET /social/google-drive/files/:fileId/permissions` - Get file permissions
- `POST /social/google-drive/files/:fileId/permissions` - Add/update permissions
- `DELETE /social/google-drive/files/:fileId/permissions/:permissionId` - Remove permissions

### Account Information

- `GET /social/google-drive/quota` - Get storage quota
- `GET /social/google-drive/profile` - Get user profile

## Required Scopes

The integration requests the following Google Drive scopes:

```typescript
googledrive: [
  "https://www.googleapis.com/auth/drive", // Full access to files
  "https://www.googleapis.com/auth/drive.file", // Access to files created by the app
  "https://www.googleapis.com/auth/drive.metadata.readonly", // Read metadata
  "https://www.googleapis.com/auth/userinfo.profile", // User profile information
  "https://www.googleapis.com/auth/userinfo.email", // User email address
];
```

## Environment Variables

Add these to your `.env` file:

```bash
# Composio Integration
COMPOSIO_API_KEY=your_composio_api_key
COMPOSIO_BASE_URL=https://backend.composio.dev

# Google Drive Configuration (via Composio)
GOOGLE_DRIVE_CLIENT_ID=your_google_client_id
GOOGLE_DRIVE_CLIENT_SECRET=your_google_client_secret
GOOGLE_DRIVE_REDIRECT_URI=http://localhost:4000/social/callback/googledrive

# Backend Configuration
BACKEND_URL=http://localhost:4000
APP_URL=http://localhost:3000
```

## Setup Instructions

### 1. Composio Configuration

1. Sign up for a Composio account
2. Get your API key from the Composio dashboard
3. Configure Google Drive as a connected service in Composio

### 2. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google Drive API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URIs:
   - `http://localhost:4000/social/callback/googledrive` (development)
   - `https://yourdomain.com/social/callback/googledrive` (production)

### 3. Backend Configuration

1. Install dependencies: `npm install`
2. Set environment variables
3. Start the server: `npm run dev`

## Usage Examples

### Connect Google Drive Account

```typescript
// Frontend: Initiate connection
const response = await fetch("/social/connect/googledrive", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ redirectUri: "http://localhost:3000/callback" }),
});

const { authUrl } = await response.json();
// Redirect user to authUrl for OAuth
```

### List Files

```typescript
// Get all files
const response = await fetch("/social/google-drive/files?pageSize=50");
const { files, nextPageToken } = await response.json();

// Search files
const searchResponse = await fetch(
  "/social/google-drive/search?q=document&pageSize=20"
);
const { files: searchResults } = await searchResponse.json();
```

### Upload File

```typescript
const fileData = {
  fileName: "example.txt",
  mimeType: "text/plain",
  content: "Hello, World!",
  parentFolderId: "optional_folder_id",
};

const response = await fetch("/social/google-drive/upload", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(fileData),
});

const { file } = await response.json();
```

### Manage Permissions

```typescript
// Add permission
const permission = {
  type: "user",
  role: "reader",
  emailAddress: "user@example.com",
};

const response = await fetch(
  `/social/google-drive/files/${fileId}/permissions`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(permission),
  }
);
```

## Error Handling

The API returns consistent error responses:

```typescript
{
  error: "Error message describing what went wrong";
}
```

Common error scenarios:

- **401 Unauthorized**: User not authenticated
- **400 Bad Request**: Missing required parameters
- **500 Internal Server Error**: Backend or Composio service error

## Security Considerations

1. **OAuth 2.0**: All authentication handled through Google's secure OAuth flow
2. **Token Management**: Access tokens managed securely by Composio
3. **Permission Validation**: File access validated against user permissions
4. **HTTPS**: Production endpoints should use HTTPS
5. **Rate Limiting**: Consider implementing rate limiting for API endpoints

## Troubleshooting

### Common Issues

1. **"Composio SDK not initialized"**

   - Check `COMPOSIO_API_KEY` environment variable
   - Verify Composio service is running

2. **"Google Drive not connected"**

   - User needs to complete OAuth flow
   - Check connection status in `/social/status/googledrive`

3. **Permission denied errors**

   - Verify requested scopes are granted
   - Check file ownership and sharing settings

4. **API quota exceeded**
   - Google Drive API has daily quotas
   - Implement caching for frequently accessed data

### Debug Endpoints

- `/test-composio` - Test Composio configuration
- `/test-db` - Test database connection
- `/health` - Server health check

## Performance Optimization

1. **Pagination**: Use `pageToken` and `pageSize` for large file lists
2. **Caching**: Implement caching for frequently accessed files
3. **Batch Operations**: Group multiple API calls when possible
4. **Async Processing**: Use background jobs for large file operations

## Monitoring & Logging

The service includes comprehensive logging:

- Request/response logging
- Error tracking
- Performance metrics
- User activity monitoring

## Future Enhancements

1. **File Sync**: Real-time file synchronization
2. **Collaborative Editing**: Google Docs integration
3. **Advanced Search**: Full-text search and filters
4. **Webhook Support**: Real-time notifications
5. **Bulk Operations**: Batch file operations
6. **Version Control**: File version management

## Support

For issues or questions:

1. Check the troubleshooting section
2. Review Composio documentation
3. Check Google Drive API documentation
4. Review server logs for detailed error information

## License

This integration is part of the calendar backend application. Please refer to the main project license for usage terms.
