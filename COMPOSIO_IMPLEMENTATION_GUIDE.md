# Composio Implementation Guide for Google Drive

This guide explains how to implement the actual Composio integration for Google Drive in the `makeComposioRequest` method.

## Current Status

The Google Drive service is currently a skeleton implementation. The `makeComposioRequest` method needs to be implemented to make actual API calls through Composio.

## Implementation Steps

### 1. Update the GoogleDriveService

Replace the placeholder `makeComposioRequest` method in `src/services/googleDrive.ts`:

```typescript
/**
 * Make a request through Composio to Google Drive API
 */
private async makeComposioRequest(
  userId: string,
  provider: string,
  action: string,
  params: Record<string, any>
): Promise<any> {
  try {
    // Get the user's connected account for Google Drive
    const connectedAccount = await this.getConnectedAccount(userId, provider);
    if (!connectedAccount) {
      throw new Error("Google Drive account not connected");
    }

    // Use Composio to execute the action
    const result = await composioService.executeAction(
      connectedAccount.id,
      action,
      params
    );

    return result;
  } catch (error: any) {
    console.error("[GOOGLE-DRIVE-SERVICE] Composio request failed:", error);
    throw error;
  }
}

/**
 * Get connected account for a specific provider
 */
private async getConnectedAccount(userId: string, provider: string): Promise<any> {
  // This should integrate with your connectedAccountsService
  // For now, we'll use a placeholder
  try {
    const { connectedAccountsService } = await import("./connectedAccounts");
    return await connectedAccountsService.getConnectedAccountByProvider(userId, provider);
  } catch (error) {
    console.error("[GOOGLE-DRIVE-SERVICE] Error getting connected account:", error);
    return null;
  }
}
```

### 2. Add executeAction Method to ComposioService

Add this method to `src/services/composio.ts`:

```typescript
/**
 * Execute an action on a connected account
 */
async executeAction(
  connectedAccountId: string,
  action: string,
  params: Record<string, any>
): Promise<any> {
  try {
    if (!this.composio || !this.isInitialized) {
      throw new Error("Composio SDK not initialized");
    }

    console.log(`[COMPOSIO-SERVICE] Executing action: ${action}`, {
      connectedAccountId,
      params
    });

    // Use Composio Core SDK to execute the action
    const result = await this.composio.actions.execute(
      connectedAccountId,
      action,
      params
    );

    console.log(`[COMPOSIO-SERVICE] Action executed successfully:`, result);
    return result;
  } catch (error: any) {
    console.error(`[COMPOSIO-SERVICE] Error executing action:`, error);
    throw new Error(`Failed to execute action: ${error.message}`);
  }
}
```

### 3. Configure Composio Actions

In your Composio dashboard, configure the following actions for Google Drive:

#### Files Actions

- `files.list` - List files with pagination
- `files.get` - Get file details
- `files.create` - Create new file or folder
- `files.update` - Update file metadata
- `files.delete` - Delete file

#### Permissions Actions

- `permissions.list` - List file permissions
- `permissions.create` - Create new permission
- `permissions.update` - Update permission
- `permissions.delete` - Delete permission

#### About Actions

- `about.get` - Get user profile and storage quota

### 4. Update Environment Variables

Add these to your `.env` file:

```bash
# Composio specific configuration
COMPOSIO_WORKSPACE_ID=your_workspace_id
COMPOSIO_CONNECTION_ID=your_googledrive_connection_id

# Google Drive API configuration
GOOGLE_DRIVE_API_VERSION=v3
GOOGLE_DRIVE_UPLOAD_CHUNK_SIZE=256
```

### 5. Error Handling and Retries

Implement proper error handling and retry logic:

```typescript
/**
 * Execute action with retry logic
 */
async executeActionWithRetry(
  connectedAccountId: string,
  action: string,
  params: Record<string, any>,
  maxRetries: number = 3
): Promise<any> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await this.executeAction(connectedAccountId, action, params);
    } catch (error: any) {
      lastError = error;

      // Don't retry on authentication errors
      if (error.message.includes('unauthorized') || error.message.includes('token')) {
        throw error;
      }

      // Don't retry on validation errors
      if (error.message.includes('invalid') || error.message.includes('bad request')) {
        throw error;
      }

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`[COMPOSIO-SERVICE] Retrying action in ${delay}ms (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Action failed after ${maxRetries} attempts: ${lastError?.message}`);
}
```

### 6. Rate Limiting

Implement rate limiting to respect Google Drive API quotas:

```typescript
/**
 * Rate limiter for Google Drive API calls
 */
class RateLimiter {
  private requests: number[] = [];
  private maxRequests: number;
  private timeWindow: number;

  constructor(maxRequests: number = 1000, timeWindow: number = 100000) {
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindow;
  }

  async waitForSlot(): Promise<void> {
    const now = Date.now();

    // Remove old requests outside the time window
    this.requests = this.requests.filter(time => now - time < this.timeWindow);

    // If we're at the limit, wait
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = this.timeWindow - (now - oldestRequest);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // Add current request
    this.requests.push(now);
  }
}

// Create a global rate limiter instance
const googleDriveRateLimiter = new RateLimiter(1000, 100000); // 1000 requests per 100 seconds

// Use in executeAction method
async executeAction(
  connectedAccountId: string,
  action: string,
  params: Record<string, any>
): Promise<any> {
  // Wait for rate limit slot
  await googleDriveRateLimiter.waitForSlot();

  // Execute the action
  return await this.executeActionInternal(connectedAccountId, action, params);
}
```

### 7. Testing the Integration

1. **Start the server**: `npm run dev`
2. **Test endpoints**: `npm run test:google-drive`
3. **Check logs**: Monitor server logs for Composio integration messages
4. **Verify OAuth flow**: Test the complete connection process

### 8. Monitoring and Debugging

Add monitoring endpoints to track Composio usage:

```typescript
// Add to your routes
app.get("/composio/metrics", async (req, res) => {
  try {
    const metrics = await composioService.getMetrics();
    res.json({
      success: true,
      metrics,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
```

## Common Issues and Solutions

### 1. Authentication Errors

- **Issue**: "Invalid access token"
- **Solution**: Check token refresh logic and OAuth flow

### 2. Rate Limiting

- **Issue**: "Quota exceeded"
- **Solution**: Implement proper rate limiting and exponential backoff

### 3. Permission Errors

- **Issue**: "Insufficient permissions"
- **Solution**: Verify requested scopes are granted during OAuth

### 4. Network Errors

- **Issue**: "Request timeout"
- **Solution**: Add retry logic and increase timeout values

## Next Steps

1. **Implement the `makeComposioRequest` method** using the examples above
2. **Configure Composio actions** in your dashboard
3. **Test the integration** with real Google Drive accounts
4. **Add monitoring and alerting** for production use
5. **Implement caching** for frequently accessed data
6. **Add webhook support** for real-time file updates

## Resources

- [Composio Documentation](https://docs.composio.dev/)
- [Google Drive API Reference](https://developers.google.com/drive/api/reference/rest/v3)
- [OAuth 2.0 Best Practices](https://oauth.net/2/oauth-best-practices/)
- [Rate Limiting Strategies](https://cloud.google.com/apis/design/quotas)
