# Google Drive Documents Management System

This document describes the Google Drive documents management system that automatically saves and tracks all user documents when they connect their Google Drive account.

## Overview

When a user connects their Google Drive account, the system automatically:

1. **Scans their Google Drive** for document files (PDF, DOCX, TXT, MD, DOC)
2. **Saves document metadata** to the `user_google_documents` table
3. **Tracks processing status** for future document processing workflows
4. **Provides APIs** to manage and monitor documents

## Features

### 🔄 **Automatic Document Sync**

- Automatically syncs documents when user connects Google Drive
- Filters for supported document types
- Updates existing documents and adds new ones
- Handles large document collections efficiently

### 📊 **Document Tracking**

- Tracks processing status (pending, processing, completed, failed)
- Stores file metadata (name, size, type, modification date)
- Maintains Google Drive file links
- Provides comprehensive statistics

### 🚀 **Processing Workflow Support**

- Ready for future document processing pipelines
- Batch processing capabilities
- Error handling and retry mechanisms
- Status updates and progress tracking

## Supported Document Types

The system automatically detects and saves these document types:

| File Extension | MIME Type                                                                 | Description              |
| -------------- | ------------------------------------------------------------------------- | ------------------------ |
| `.pdf`         | `application/pdf`                                                         | PDF documents            |
| `.docx`        | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | Microsoft Word documents |
| `.txt`         | `text/plain`                                                              | Plain text files         |
| `.md`          | `text/markdown`, `text/x-markdown`                                        | Markdown files           |
| `.doc`         | `application/msword`, `application/vnd.ms-word`                           | Legacy Word documents    |

## Database Schema

### `user_google_documents` Table

```sql
CREATE TABLE public.user_google_documents (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id text NOT NULL,
  google_drive_file_id text NOT NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint,
  google_drive_web_view_link text,
  last_modified_at timestamptz,
  processed boolean DEFAULT false,
  processing_status text DEFAULT 'pending',
  processing_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Unique constraint
  CONSTRAINT ux_user_google_documents_user_file UNIQUE (user_id, google_drive_file_id)
);
```

### Key Fields

- **`processed`**: Boolean flag indicating if document has been processed
- **`processing_status`**: Current status (pending, processing, completed, failed)
- **`processing_error`**: Error message if processing failed
- **`google_drive_file_id`**: Unique identifier from Google Drive
- **`file_path`**: File path/name for organization

## API Endpoints

### Document Sync

#### Auto-Sync on Connection

Documents are automatically synced when a user connects their Google Drive account via OAuth.

#### Manual Sync

```http
POST /social/google-drive/sync-documents
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "message": "Documents synced successfully",
  "result": {
    "total": 25,
    "new": 25,
    "updated": 0,
    "errors": []
  }
}
```

### Document Retrieval

#### Get All Documents

```http
GET /social/google-drive/documents?limit=100&offset=0
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "documents": [
    {
      "id": 1,
      "user_id": "user-123",
      "file_name": "document.pdf",
      "mime_type": "application/pdf",
      "processed": false,
      "processing_status": "pending",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 25,
  "limit": 100,
  "offset": 0
}
```

#### Get Unprocessed Documents

```http
GET /social/google-drive/documents/unprocessed?limit=50
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "documents": [
    {
      "id": 1,
      "file_name": "document.pdf",
      "mime_type": "application/pdf",
      "processed": false,
      "processing_status": "pending"
    }
  ],
  "count": 1,
  "limit": 50
}
```

### Document Statistics

#### Get Document Stats

```http
GET /social/google-drive/documents/stats
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "stats": {
    "total": 25,
    "processed": 10,
    "unprocessed": 15,
    "byType": {
      "application/pdf": 15,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": 8,
      "text/plain": 2
    }
  }
}
```

### Document Processing

#### Update Processing Status

```http
POST /social/google-drive/documents/:documentId/process
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "completed"
}
```

**Available Statuses:**

- `pending`: Document is waiting to be processed
- `processing`: Document is currently being processed
- `completed`: Document has been successfully processed
- `failed`: Document processing failed

**Response:**

```json
{
  "success": true,
  "message": "Document marked as completed",
  "document": {
    "id": 1,
    "processed": true,
    "processing_status": "completed",
    "updated_at": "2024-01-01T00:00:00Z"
  }
}
```

### Document Management

#### Delete Document

```http
DELETE /social/google-drive/documents/:documentId
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "message": "Document deleted successfully"
}
```

## Usage Examples

### Frontend Integration

#### 1. Connect Google Drive and Auto-Sync

```typescript
// Connect Google Drive account
const response = await fetch("/social/connect/googledrive", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ redirectUri: "http://localhost:3000/callback" }),
});

// Documents are automatically synced after successful connection
```

#### 2. Get User's Documents

```typescript
// Get all documents
const documentsResponse = await fetch(
  "/social/google-drive/documents?limit=50"
);
const { documents, total } = await documentsResponse.json();

// Get unprocessed documents for processing
const unprocessedResponse = await fetch(
  "/social/google-drive/documents/unprocessed"
);
const { documents: unprocessedDocs } = await unprocessedResponse.json();
```

#### 3. Process Documents

```typescript
// Mark document as processing
await fetch(`/social/google-drive/documents/${documentId}/process`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ status: "processing" }),
});

// After processing is complete
await fetch(`/social/google-drive/documents/${documentId}/process`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ status: "completed" }),
});

// If processing fails
await fetch(`/social/google-drive/documents/${documentId}/process`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    status: "failed",
    error: "Failed to extract text from PDF",
  }),
});
```

#### 4. Monitor Progress

```typescript
// Get processing statistics
const statsResponse = await fetch("/social/google-drive/documents/stats");
const { stats } = await statsResponse.json();

console.log(`Progress: ${stats.processed}/${stats.total} documents processed`);
console.log(`Remaining: ${stats.unprocessed} documents`);
```

## Processing Workflow

### 1. **Document Discovery**

- User connects Google Drive
- System scans for supported document types
- Documents saved to database with `processed: false`

### 2. **Processing Queue**

- System identifies unprocessed documents
- Documents can be processed in batches
- Status updated to `processing` during execution

### 3. **Processing Execution**

- Your processing logic runs on each document
- Extract text, analyze content, etc.
- Update status based on results

### 4. **Status Updates**

- Mark as `completed` on success
- Mark as `failed` with error message on failure
- Track processing history and errors

## Error Handling

### Sync Errors

- Document sync failures don't break OAuth flow
- Errors are logged for debugging
- Partial syncs are supported

### Processing Errors

- Failed documents maintain error messages
- Retry mechanisms can be implemented
- Error aggregation for analysis

## Performance Considerations

### Batch Operations

- Documents are synced in batches
- Database operations use efficient UPSERT
- Pagination for large document collections

### Caching

- Document metadata cached in database
- Google Drive API calls minimized
- Efficient status tracking

## Future Enhancements

### 1. **Advanced Processing**

- Document content extraction
- Text analysis and indexing
- AI-powered document insights

### 2. **Real-time Updates**

- Webhook support for file changes
- Incremental sync capabilities
- Live processing status updates

### 3. **Advanced Organization**

- Folder structure preservation
- Document tagging and categorization
- Search and filtering capabilities

### 4. **Processing Pipelines**

- Configurable processing workflows
- Multiple processing stages
- Parallel processing support

## Security Features

### 1. **User Isolation**

- Documents are user-scoped
- No cross-user document access
- Secure authentication required

### 2. **Data Privacy**

- Only metadata is stored
- No document content in database
- Secure Google Drive integration

### 3. **Access Control**

- JWT-based authentication
- User ID validation
- Secure API endpoints

## Monitoring and Debugging

### Logging

- Comprehensive logging throughout the system
- Error tracking and debugging information
- Performance metrics and timing

### Health Checks

- Database connection monitoring
- Google Drive API status
- Processing queue health

## Setup Instructions

### 1. **Database Migration**

```bash
# Run the migration to create the table
psql -d your_database -f src/db/migration_003_user_google_documents.sql
```

### 2. **Environment Variables**

```bash
# Ensure Google Drive integration is configured
GOOGLE_DRIVE_CLIENT_ID=your_client_id
GOOGLE_DRIVE_CLIENT_SECRET=your_client_secret
COMPOSIO_API_KEY=your_composio_key
```

### 3. **Service Integration**

```typescript
// Import the service
import { googleDriveDocumentsService } from "./services/googleDriveDocuments";

// Use in your application
const documents = await googleDriveDocumentsService.getUserDocuments(userId);
```

## Troubleshooting

### Common Issues

1. **Documents Not Syncing**

   - Check Google Drive connection status
   - Verify OAuth scopes include file access
   - Check server logs for sync errors

2. **Processing Status Not Updating**

   - Verify document ID exists
   - Check database permissions
   - Validate status values

3. **Performance Issues**
   - Implement pagination for large collections
   - Use batch operations where possible
   - Monitor database query performance

### Debug Endpoints

- `/social/google-drive/documents/stats` - Check document counts
- `/social/google-drive/documents/unprocessed` - View pending documents
- Server logs - Detailed error information

## Support

For issues or questions:

1. Check the troubleshooting section
2. Review server logs for detailed errors
3. Verify database schema and permissions
4. Test with small document collections first

This system provides a robust foundation for managing Google Drive documents with comprehensive tracking and processing capabilities.
