# Langflow Integration with Google Drive Documents

This document describes the integration of Langflow with Google Drive documents for automated document processing.

## Overview

The system automatically processes Google Drive documents (PDF, DOCX, TXT, MD, DOC) by:

1. **Downloading all files** to local temporary storage when users connect their Google Drive
2. **Creating database entries** with local file paths for efficient access
3. **Running a cronjob** every 5 minutes to check for unprocessed documents
4. **Processing documents locally** by reading from local storage
5. **Uploading to Langflow** and executing flows
6. **Deleting local files** after successful processing
7. **Updating document status** in the database

## Architecture

### Services

#### 1. LangflowService (`src/services/langflow.ts`)

- Handles file uploads to Langflow using direct API calls
- Executes Langflow flows via REST API endpoints
- Manages document processing workflow
- Integrates with GoogleDriveDocumentsService
- Uses FormData and Blob for file uploads

#### 2. CronjobService (`src/services/cronjob.ts`)

- Runs every 5 minutes to check for unprocessed documents
- Automatically processes documents in the background
- Provides manual trigger capabilities
- Manages service lifecycle (start/stop)

#### 3. GoogleDriveDocumentsService (`src/services/googleDriveDocuments.ts`)

- Manages document storage and status tracking
- Tracks processing status (pending, processing, completed, failed)
- Stores Langflow processing results

#### 4. FileManagerService (`src/services/fileManager.ts`)

- Downloads Google Drive files to local temporary storage
- Manages local file paths and cleanup
- Handles concurrent downloads with rate limiting
- Provides disk usage monitoring and cleanup

### Database Schema

The `user_google_documents` table includes:

- `processed`: Boolean flag for processing status
- `processing_status`: Enum (pending, processing, completed, failed)
- `result`: JSONB field storing Langflow processing results
- `processing_error`: Error message if processing fails
- `local_file_path`: Local file path where document is stored temporarily
- `downloaded_at`: Timestamp when file was downloaded to local storage

## Environment Variables

Add these to your `.env` file:

```bash
# Langflow Integration
LANGFLOW_API_URL=https://editor.ai-did-it.com
LANGFLOW_API_KEY=sk-ErkhYlPLOx9Kut2bodEsd1FjHZ2z_UydVZLW9M_Ofg8
LANGFLOW_FLOW_ID=5942de6b-31fd-4f5b-aef5-45dce5e4d253

# Cronjob Configuration
CRONJOB_PATTERN=*/5 * * * *
```

## Langflow API Integration

The system uses direct API calls to Langflow instead of the TypeScript client library:

### File Upload Endpoint

- **URL**: `POST /api/v2/files/`
- **Headers**: `x-api-key: {your_api_key}`
- **Body**: FormData with file blob

### Flow Execution Endpoint

- **URL**: `POST /api/v1/run/{flow_id}`
- **Headers**: `Content-Type: application/json`, `x-api-key: {your_api_key}`
- **Body**: JSON payload with file path and input parameters

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

- **All supported documents are downloaded** to local temporary storage (`temp/google-drive-files/{userId}/`)
- **Database entries are created** with local file paths for efficient access
- **Files are organized** by user ID in separate directories
- **All documents start** with `processed: false` and `processing_status: 'pending'`
- **Local file paths** are stored in `local_file_path` field
- **Download timestamps** are recorded in `downloaded_at` field

### 2. Automated Processing

Every 5 minutes, the cronjob:

- **Queries for unprocessed documents** from the database
- **Reads files from local storage** (no need to download from Google Drive again)
- **Uploads files to Langflow** for processing
- **Executes the specified flow** with the uploaded files
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

- **Concurrent Downloads**: Downloads up to 3 files simultaneously for better performance
- **Safe Filenames**: Automatically creates safe filenames by removing special characters
- **User Isolation**: Each user's files are stored in separate directories
- **Automatic Cleanup**: Old files are automatically cleaned up after 7 days
- **Disk Usage Monitoring**: Tracks total disk usage and file counts
- **Error Handling**: Gracefully handles download failures and continues with other files

## Error Handling

### Processing Failures

- Documents marked as failed are not retried automatically
- Error messages are stored in `processing_error`
- Failed documents can be manually retried via API

### Service Failures

- Cronjob service automatically restarts on next scheduled run
- Database connection issues are logged and handled gracefully
- Langflow API failures are captured and logged

## Monitoring

### Logs

All operations are logged with structured logging:

- `[LANGFLOW-SERVICE]` - Document processing operations
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

1. Set up environment variables
2. Start the server: `npm run dev`
3. Connect a Google Drive account
4. Monitor logs for document processing
5. Use cronjob control endpoints for manual testing

### Adding New File Types

To support additional file types:

1. Update `getMimeType()` in `LangflowService`
2. Add MIME type mapping
3. Update file filtering in sync logic

### Customizing Langflow Flows

Modify the flow execution in `runLangflowFlow()`:

```typescript
private async runLangflowFlow(fileId: string) {
  // Customize flow parameters
  const flowParams = {
    flowId: this.flowId,
    inputs: {
      file: fileId,
      // Add custom parameters
      processingOptions: {
        extractText: true,
        analyzeStructure: true
      }
    }
  };

  // Execute with custom parameters
  return await this.client.runFlow(flowParams);
}
```

## Troubleshooting

### Common Issues

#### 1. Documents Not Processing

- Check cronjob service status: `GET /social/cronjob/status`
- Verify environment variables are set
- Check logs for error messages

#### 2. Langflow API Errors

- Verify `LANGFLOW_API_URL` and `LANGFLOW_API_KEY`
- Check Langflow server is running
- Verify flow ID exists and is accessible

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
- Processing results are user-scoped

## Performance

- Documents are processed sequentially to avoid overwhelming APIs
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
