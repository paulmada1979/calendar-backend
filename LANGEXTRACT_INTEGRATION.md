# LangExtract Integration with Google Drive Documents

This document describes the integration of LangExtract with Google Drive documents for automated document processing.

## Overview

The system automatically processes Google Drive documents (PDF, DOCX, TXT, MD, DOC) by:

1. **Downloading all files** to local temporary storage when users connect their Google Drive
2. **Creating database entries** with local file paths for efficient access
3. **Running a cronjob** every 5 minutes to check for unprocessed documents
4. **Processing documents locally** by reading from local storage
5. **Uploading to LangExtract API** for document processing
6. **Deleting local files** after successful processing
7. **Updating document status** in the database

## Architecture

### Services

#### 1. LangExtractService (`src/services/langExtract.ts`)

- Handles file uploads to LangExtract API using direct API calls
- Manages document processing workflow
- Integrates with GoogleDriveDocumentsService
- Uses FormData and Blob for file uploads
- Includes user authentication via user_id parameter

#### 2. CronjobService (`src/services/cronjob.ts`)

- Runs every 5 minutes to check for unprocessed documents
- Automatically processes documents in the background
- Provides manual trigger capabilities
- Manages service lifecycle (start/stop)

#### 3. GoogleDriveDocumentsService (`src/services/googleDriveDocuments.ts`)

- Manages document storage and status tracking
- Tracks processing status (pending, processing, completed, failed)
- Stores LangExtract processing results

#### 4. ComposioGoogleDriveService (`src/services/composioGoogleDrive.ts`)

- Uses Composio's token management for Google Drive authentication
- Makes direct Google Drive API calls with proper error handling
- Handles large file collections with better error handling
- Downloads files with rate limiting and retry mechanisms
- Provides robust file download with proper error recovery

#### 5. FileManagerService (`src/services/fileManager.ts`)

- Manages local file paths and cleanup
- Handles file storage and retrieval
- Provides disk usage monitoring and cleanup
- Works with Composio service for file operations

### Database Schema

The `user_google_documents` table includes:

- `processed`: Boolean flag for processing status
- `processing_status`: Enum (pending, processing, completed, failed)
- `result`: JSONB field storing LangExtract processing results
- `processing_error`: Error message if processing fails
- `local_file_path`: Local file path where document is stored temporarily
- `downloaded_at`: Timestamp when file was downloaded to local storage

## Environment Variables

Add these to your `.env` file:

```bash
# LangExtract Integration
LANGEXTRACT_BASE_URL=your_langextract_api_url

# Cronjob Configuration
CRONJOB_PATTERN=*/5 * * * *
```

## LangExtract API Integration

The system uses direct API calls to LangExtract API:

### Document Upload Endpoint

- **URL**: `POST /api/document/documents/upload/`
- **Body**: FormData with file blob, userId, and processing options
- **Parameters**:
  - `file`: The document file (PDF, DOCX, TXT, MD, DOC)
  - `userId`: The authenticated user's ID
  - `enable_docling`: Enable Docling for PDF processing (true/false)
  - `processing_options`: JSON string with processing configuration

## API Endpoints

### Cronjob Control

#### Get Cronjob Status

```http
GET /social/cronjob/status
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "status": {
    "isRunning": true,
    "nextRun": "2025-08-28T18:00:00.000Z",
    "cronPattern": "*/5 * * * *"
  }
}
```

#### Start Cronjob Service

```http
POST /social/cronjob/start
Authorization: Bearer <token>
```

#### Stop Cronjob Service

```http
POST /social/cronjob/stop
Authorization: Bearer <token>
```

#### Manually Trigger Processing

```http
POST /social/cronjob/trigger
Authorization: Bearer <token>
```

### Document Management

#### Get Document Statistics

```http
GET /social/google-drive/documents/stats
Authorization: Bearer <token>
```

#### Update Document Status

```http
POST /social/google-drive/documents/:documentId/process
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "completed|failed|processing",
  "error": "Error message (required for failed status)"
}
```

## Workflow

### 1. Document Sync & Download

When a user connects Google Drive:

- **All supported documents are downloaded** using Composio's Google Drive integration
- **Files are downloaded** to local temporary storage (`temp/google-drive-files/{userId}/`)
- **Database entries are created** with local file paths for efficient access
- **Files are organized** by user ID in separate directories
- **All documents start** with `processed: false` and `processing_status: 'pending'`
- **Local file paths** are stored in `local_file_path` field
- **Download timestamps** are recorded in `downloaded_at` field
- **Composio handles** token management and authentication
- **Direct Google Drive API calls** with proper error handling and rate limiting

### 2. Automated Processing

Every 5 minutes, the cronjob:

- **Queries for unprocessed documents** from the database
- **Reads files from local storage** (no need to download from Google Drive again)
- **Uploads files to LangExtract API** for processing
- **Updates document status** based on processing results
- **Deletes local files** after successful processing to free up disk space

### 3. Status Tracking

Documents progress through states:

- `pending` → `processing` → `completed`/`failed`
- Results are stored in the `result` field
- Errors are captured in `processing_error`

## Configuration

### Cronjob Schedule

The cronjob schedule is configurable via the `CRONJOB_PATTERN` environment variable. The default is every 5 minutes (`*/5 * * * *`).

**Common patterns:**

- `*/5 * * * *` - Every 5 minutes (default)
- `*/10 * * * *` - Every 10 minutes
- `0 * * * *` - Every hour
- `0 0 * * *` - Every day at midnight
- `0 9 * * 1-5` - Every weekday at 9 AM

**To modify the schedule:**

1. Set the `CRONJOB_PATTERN` environment variable in your `.env` file
2. Restart the server

```bash
# Example: Run every 10 minutes
CRONJOB_PATTERN=*/10 * * * *

# Example: Run every hour
CRONJOB_PATTERN=0 * * * *

# Example: Run daily at 2 AM
CRONJOB_PATTERN=0 2 * * *
```

### Supported File Types

- PDF (`application/pdf`)
- DOCX (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`)
- DOC (`application/msword`)
- TXT (`text/plain`)
- MD (`text/markdown`)

### File Management Features

- **Composio Integration**: Uses Composio's token management for Google Drive authentication
- **Direct API Calls**: Makes direct Google Drive API calls for better reliability
- **Token Management**: Composio handles OAuth token refresh and management automatically
- **Rate Limiting**: Built-in rate limiting and retry mechanisms
- **Concurrent Downloads**: Downloads up to 3 files simultaneously for better performance
- **Safe Filenames**: Automatically creates safe filenames by removing special characters
- **User Isolation**: Each user's files are stored in separate directories
- **Automatic Cleanup**: Old files are automatically cleaned up after 7 days
- **Disk Usage Monitoring**: Tracks total disk usage and file counts
- **Error Handling**: Gracefully handles download failures and continues with other files
- **Large Collection Support**: Better handling of large Google Drive collections

## Error Handling

### Processing Failures

- Documents marked as failed are not retried automatically
- Error messages are stored in `processing_error`
- Failed documents can be manually retried via API

### Service Failures

- Cronjob service automatically restarts on next scheduled run
- Database connection issues are logged and handled gracefully
- LangExtract API failures are captured and logged

## Monitoring

### Logs

All operations are logged with structured logging:

- `[LANGEXTRACT-SERVICE]` - Document processing operations (LangExtract API calls)
- `[CRONJOB-SERVICE]` - Scheduled job execution
- `[GOOGLE-DRIVE-DOCUMENTS-SERVICE]` - Database operations

### Metrics

The system tracks:

- Total documents processed
- Success/failure rates
- Processing time per document
- Queue length (pending documents)

## Development

### Testing

To test the integration:

1. Set up environment variables (especially `LANGEXTRACT_BASE_URL`)
2. Start the server: `npm run dev`
3. Connect a Google Drive account
4. Monitor logs for document processing
5. Use cronjob control endpoints for manual testing

### Adding New File Types

To support additional file types:

1. Update MIME type handling in `LangExtractService`
2. Add MIME type mapping
3. Update file filtering in sync logic

### Customizing LangExtract Processing

Modify the upload parameters in `uploadFileToLangExtract()`:

```typescript
private async uploadFileToLangExtract(
  fileBuffer: Buffer,
  fileName: string,
  userId: string
) {
  // Prepare the form data with the file to upload
  const data = new FormData();
  const uint8Array = new Uint8Array(fileBuffer);
  data.append("file", new Blob([uint8Array]), fileName);
  data.append("userId", userId);
  data.append("enable_docling", "true");
  data.append("processing_options", JSON.stringify({
    extractText: true,
    analyzeStructure: true,
    enableDocling: true,
    schemaValidation: false,
    autoDetectSchema: true,
    skipSchemaValidation: true
  }));

  // Upload to LangExtract API
  return await fetch(`${this.baseUrl}/api/document/documents/upload/`, {
    method: "POST",
    body: data,
  });
}
```

## Troubleshooting

### Common Issues

#### 1. Documents Not Processing

- Check cronjob service status: `GET /social/cronjob/status`
- Verify environment variables are set
- Check logs for error messages

#### 2. LangExtract API Errors

- Verify `LANGEXTRACT_BASE_URL` is set correctly
- Check LangExtract server is running and accessible
- Verify the API endpoint `/api/document/documents/upload/` is available

#### 3. Google Drive Access Issues

- Check OAuth token validity
- Verify Google Drive API permissions
- Check connected account status

### Debug Mode

Enable detailed logging by setting:

```bash
LOG_LEVEL=DEBUG
NODE_ENV=development
```

## Security Considerations

- All endpoints require authentication
- Access tokens are stored securely in database
- File downloads use signed URLs where possible
- Processing results are user-scoped via userId parameter

## Performance

- Documents are processed sequentially to avoid overwhelming the LangExtract API
- 1-second delay between document processing
- Database transactions ensure data consistency
- Connection pooling for database operations

## Future Enhancements

- Batch processing for multiple documents
- Retry mechanism for failed documents
- Webhook notifications for processing completion
- Advanced scheduling options
- Processing queue management
- Real-time processing status updates
