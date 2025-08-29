import express from "express";
import { isAuth, AuthenticatedRequest } from "../middleware/isAuth";
import { composioService } from "../services/composio";
import { connectedAccountsService } from "../services/connectedAccounts";
import { googleDriveService } from "../services/googleDrive";
import { googleDriveDocumentsService } from "../services/googleDriveDocuments";
import { cronjobService } from "../services/cronjob";

export const socialMediaRouter = express.Router();

// Get available social media platforms
socialMediaRouter.get(
  "/platforms",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const platforms = await composioService.getAvailablePlatforms();
      res.json({ success: true, platforms });
    } catch (error: any) {
      console.error(
        `[SOCIAL-MEDIA-ROUTES] Error fetching platforms: ${error.message}`
      );
      res.status(500).json({ error: "Failed to fetch platforms" });
    }
  }
);

// Get user's connected accounts
socialMediaRouter.get(
  "/accounts",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const accounts = await connectedAccountsService.getUserConnectedAccounts(
        userId
      );
      res.json({ success: true, accounts });
    } catch (error: any) {
      console.error(
        `[SOCIAL-MEDIA-ROUTES] Error fetching user accounts: ${error.message}`
      );
      res.status(500).json({ error: "Failed to fetch user accounts" });
    }
  }
);

// Get connection status for a specific provider
socialMediaRouter.get(
  "/status/:provider",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { provider } = req.params;

      const account =
        await connectedAccountsService.getConnectedAccountByProvider(
          userId,
          provider
        );

      if (account) {
        res.json({
          success: true,
          connected: true,
          account: {
            id: account.id,
            provider: account.provider,
            account_label: account.account_label,
            account_email: account.account_email,
            public_url: account.public_url,
            connected_at: account.created_at,
            last_synced: account.last_sync_at,
          },
        });
      } else {
        res.json({ success: true, connected: false });
      }
    } catch (error: any) {
      console.error(
        `[SOCIAL-MEDIA-ROUTES] Error checking connection status: ${error.message}`
      );
      res.status(500).json({ error: "Failed to check connection status" });
    }
  }
);

// Initiate OAuth flow for a social media platform
socialMediaRouter.post(
  "/connect/:provider",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { provider } = req.params;
      const { redirectUri } = req.body;

      if (!redirectUri) {
        return res.status(400).json({ error: "redirectUri is required" });
      }

      // Clean up any incorrect entries first
      await connectedAccountsService.cleanupIncorrectEntries(userId);

      // Check if already connected
      const existingAccount =
        await connectedAccountsService.getConnectedAccountByProvider(
          userId,
          provider
        );
      if (existingAccount) {
        return res
          .status(400)
          .json({ error: `Already connected to ${provider}` });
      }

      // Check if user already has an active connection for this provider
      console.log(
        `[SOCIAL-MEDIA-ROUTES] Checking for existing ${provider} connection...`
      );
      const existingConnectionId =
        await composioService.checkExistingConnection(userId, provider);

      if (existingConnectionId) {
        console.log(
          `[SOCIAL-MEDIA-ROUTES] Found existing ${provider} connection:`,
          existingConnectionId
        );

        // Check if we already have this in our database
        const existingAccount =
          await connectedAccountsService.getConnectedAccountByProvider(
            userId,
            provider
          );

        if (existingAccount) {
          console.log(
            `[SOCIAL-MEDIA-ROUTES] Account already exists in database:`,
            existingAccount.id
          );
          return res.json({
            success: true,
            alreadyConnected: true,
            accountId: existingAccount.id,
            message: `Already connected to ${provider}`,
          });
        } else {
          // Connection exists in Composio but not in our database - create it
          console.log(
            `[SOCIAL-MEDIA-ROUTES] Creating database entry for existing connection...`
          );
          const profile = await composioService.getConnectedAccountProfile(
            existingConnectionId,
            provider
          );
          const connectedAccount =
            await connectedAccountsService.createConnectedAccount(
              userId,
              profile
            );
          await connectedAccountsService.updateLastValidated(
            connectedAccount.id
          );

          return res.json({
            success: true,
            alreadyConnected: true,
            accountId: connectedAccount.id,
            message: `Successfully connected to ${provider}`,
          });
        }
      }

      // IMPORTANT: For now, let's force new OAuth flows for each provider
      // to avoid the issue of reusing connections across different platforms
      console.log(
        `[SOCIAL-MEDIA-ROUTES] Forcing new OAuth flow for ${provider} to ensure provider-specific connection`
      );

      // No existing connection, initiate new OAuth flow
      console.log(
        `[SOCIAL-MEDIA-ROUTES] No existing connection found, initiating OAuth...`
      );
      const { authUrl, state, connectionRequestId } =
        await composioService.initiateOAuth(provider, userId, redirectUri);

      console.log(`[SOCIAL-MEDIA-ROUTES] OAuth initiated for ${provider}:`, {
        authUrl,
        state,
        userId,
        redirectUri,
        connectionRequestId,
      });

      res.json({
        success: true,
        authUrl,
        state,
        connectionRequestId,
        message: `Redirecting to ${provider} for authorization`,
      });
    } catch (error: any) {
      console.error(
        `[SOCIAL-MEDIA-ROUTES] Error initiating OAuth: ${error.message}`
      );
      res.status(500).json({ error: "Failed to initiate OAuth flow" });
    }
  }
);

// Check connection status and create database entry when ready
socialMediaRouter.post("/check-connection/:provider", async (req, res) => {
  try {
    const { provider } = req.params;
    const { connectionRequestId, userId } = req.body;

    console.log(
      `[SOCIAL-MEDIA-ROUTES] Checking connection status for ${provider}`
    );
    console.log(
      `[SOCIAL-MEDIA-ROUTES] Connection request ID:`,
      connectionRequestId
    );
    console.log(`[SOCIAL-MEDIA-ROUTES] User ID:`, userId);

    if (!connectionRequestId || !userId) {
      return res.status(400).json({
        error: "Missing connectionRequestId or userId",
      });
    }

    // Check if connection is active using Composio
    const isActive = await composioService.checkConnectionStatus(
      connectionRequestId
    );

    if (isActive) {
      // Connection is active, create database entry
      console.log(
        `[SOCIAL-MEDIA-ROUTES] Connection is active, creating database entry...`
      );

      // Get the connected account profile from Composio
      const profile = await composioService.getConnectedAccountProfile(
        connectionRequestId,
        provider
      );

      // Store in database
      const connectedAccount =
        await connectedAccountsService.createConnectedAccount(userId, profile);

      // Update last validated time
      await connectedAccountsService.updateLastValidated(connectedAccount.id);

      console.log(
        `[SOCIAL-MEDIA-ROUTES] Successfully created connected account:`,
        connectedAccount.id
      );

      res.json({
        success: true,
        connected: true,
        accountId: connectedAccount.id,
        message: `Successfully connected to ${provider}`,
      });
    } else {
      // Connection not yet active
      res.json({
        success: true,
        connected: false,
        message: `Connection to ${provider} is still pending`,
      });
    }
  } catch (error: any) {
    console.error(
      `[SOCIAL-MEDIA-ROUTES] Error checking connection: ${error.message}`
    );
    res.status(500).json({
      error: `Failed to check connection: ${error.message}`,
    });
  }
});

// Handle OAuth callback from Composio
socialMediaRouter.get("/callback/:provider", async (req, res) => {
  try {
    const { provider } = req.params;
    const {
      code,
      state,
      error,
      mock_oauth,
      status,
      connectedAccountId,
      appName,
    } = req.query;

    console.log(
      `[SOCIAL-MEDIA-ROUTES] OAuth callback received for ${provider}`
    );
    console.log(`[SOCIAL-MEDIA-ROUTES] Query parameters:`, req.query);

    console.log(`[SOCIAL-MEDIA-ROUTES] OAuth callback for ${provider}:`, {
      code: code ? "Present" : "Missing",
      state: state ? "Present" : "Missing",
      status: status || "None",
      connectedAccountId: connectedAccountId || "None",
      appName: appName || "None",
      error: error || "None",
      mock_oauth: mock_oauth || "None",
    });

    if (error) {
      console.error(
        `[SOCIAL-MEDIA-ROUTES] OAuth error for ${provider}: ${error}`
      );
      return res.redirect(
        `${
          process.env.APP_URL || "http://localhost:3000"
        }/integrations?error=true&message=OAuth authorization failed`
      );
    }

    // Handle Composio's success redirect format
    if (status === "success" && connectedAccountId) {
      console.log(
        `[SOCIAL-MEDIA-ROUTES] Composio success redirect with connectedAccountId: ${connectedAccountId}`
      );
      console.log(`[SOCIAL-MEDIA-ROUTES] Full query parameters:`, req.query);

      try {
        // Get the profile data for this connected account
        const profile = await composioService.getConnectedAccountProfile(
          connectedAccountId.toString(),
          provider
        );

        console.log(`[SOCIAL-MEDIA-ROUTES] Profile data:`, profile);

        // Get userId from stored OAuth state
        const oauthState = composioService.getOAuthState(
          connectedAccountId.toString()
        );
        let userId = oauthState?.userId;

        if (!userId) {
          console.log(
            `[SOCIAL-MEDIA-ROUTES] No userId found in OAuth state for ${connectedAccountId}`
          );

          // Try to get userId from the profile metadata as fallback
          userId = profile.meta?.user_id;

          if (!userId) {
            throw new Error(
              "Cannot determine userId from OAuth callback. OAuth state not found."
            );
          }
        }

        // Store in database
        console.log(
          `[SOCIAL-MEDIA-ROUTES] Creating connected account for user ${userId}...`
        );
        const connectedAccount =
          await connectedAccountsService.createConnectedAccount(
            userId,
            profile
          );
        console.log(
          `[SOCIAL-MEDIA-ROUTES] Connected account created with ID:`,
          connectedAccount.id
        );

        // Update last validated time
        console.log(`[SOCIAL-MEDIA-ROUTES] Updating last validated time...`);
        await connectedAccountsService.updateLastValidated(connectedAccount.id);
        console.log(
          `[SOCIAL-MEDIA-ROUTES] Last validated time updated successfully`
        );

        // Auto-sync Google Drive documents if this is a Google Drive connection
        if (provider === "googledrive") {
          try {
            console.log(
              `[SOCIAL-MEDIA-ROUTES] Auto-syncing Google Drive documents for user ${userId}...`
            );
            const syncResult =
              await googleDriveDocumentsService.syncUserDocuments(userId);
            console.log(
              `[SOCIAL-MEDIA-ROUTES] Auto-sync completed: ${syncResult.total} documents found`
            );
          } catch (syncError: any) {
            console.error(
              `[SOCIAL-MEDIA-ROUTES] Auto-sync failed: ${syncError.message}`
            );
            // Don't fail the OAuth flow if sync fails
          }
        }

        // Clean up OAuth state
        composioService.cleanupOAuthState(connectedAccountId.toString());

        console.log(
          `[SOCIAL-MEDIA-ROUTES] Successfully created connected account:`,
          connectedAccount.id
        );

        // Redirect back to frontend with success
        const redirectUrl = `${
          process.env.APP_URL || "http://localhost:3000"
        }/integrations?success=true&provider=${provider}&message=Successfully connected to ${provider}`;

        console.log(
          `[SOCIAL-MEDIA-ROUTES] Redirecting to frontend:`,
          redirectUrl
        );
        res.redirect(redirectUrl);
        return;
      } catch (profileError: any) {
        console.error(
          `[SOCIAL-MEDIA-ROUTES] Error getting profile: ${profileError.message}`
        );
        const redirectUrl = `${
          process.env.APP_URL || "http://localhost:3000"
        }/integrations?error=true&message=Failed to get profile data for ${provider}`;
        res.redirect(redirectUrl);
        return;
      }
    }

    // Handle traditional OAuth callback format (code + state)
    if (!code || !state) {
      return res.status(400).json({ error: "Missing code or state parameter" });
    }

    // Parse state to get userId
    const [userId] = state.toString().split(":");
    if (!userId) {
      return res.status(400).json({ error: "Invalid state parameter" });
    }

    let profile;

    // Mock OAuth has been disabled - require real Composio integration
    if (mock_oauth === "true") {
      throw new Error(
        `Mock OAuth has been disabled for ${provider}. Please use real Composio integration.`
      );
    }

    // Handle real OAuth callback
    profile = await composioService.handleOAuthCallback(
      provider,
      code.toString(),
      state.toString()
    );

    console.log(`[SOCIAL-MEDIA-ROUTES] Profile data:`, profile);

    // Store in database
    console.log(
      `[SOCIAL-MEDIA-ROUTES] Creating connected account for user ${userId}...`
    );
    const connectedAccount =
      await connectedAccountsService.createConnectedAccount(userId, profile);
    console.log(
      `[SOCIAL-MEDIA-ROUTES] Connected account created with ID:`,
      connectedAccount.id
    );

    // Update last validated time
    console.log(`[SOCIAL-MEDIA-ROUTES] Updating last validated time...`);
    await connectedAccountsService.updateLastValidated(connectedAccount.id);
    console.log(
      `[SOCIAL-MEDIA-ROUTES] Last validated time updated successfully`
    );

    // Auto-sync Google Drive documents if this is a Google Drive connection
    if (provider === "googledrive") {
      try {
        console.log(
          `[SOCIAL-MEDIA-ROUTES] Auto-syncing Google Drive documents for user ${userId}...`
        );
        const syncResult = await googleDriveDocumentsService.syncUserDocuments(
          userId
        );
        console.log(
          `[SOCIAL-MEDIA-ROUTES] Auto-sync completed: ${syncResult.total} documents found`
        );
      } catch (syncError: any) {
        console.error(
          `[SOCIAL-MEDIA-ROUTES] Auto-sync failed: ${syncError.message}`
        );
        // Don't fail the OAuth flow if sync fails
      }
    }

    console.log(
      `[SOCIAL-MEDIA-ROUTES] Successfully created connected account:`,
      connectedAccount.id
    );

    // Redirect back to frontend with success
    const redirectUrl = `${
      process.env.APP_URL || "http://localhost:3000"
    }/integrations?success=true&provider=${provider}&message=Successfully connected to ${provider}`;

    console.log(`[SOCIAL-MEDIA-ROUTES] Redirecting to frontend:`, redirectUrl);
    res.redirect(redirectUrl);
  } catch (error: any) {
    console.error(
      `[SOCIAL-MEDIA-ROUTES] Error handling OAuth callback: ${error.message}`
    );
    console.error(`[SOCIAL-MEDIA-ROUTES] Full error:`, error);
    console.error(`[SOCIAL-MEDIA-ROUTES] Error stack:`, error.stack);

    const redirectUrl = `${
      process.env.APP_URL || "http://localhost:3000"
    }/integrations?error=true&message=Failed to complete ${
      req.params.provider
    } connection`;
    res.redirect(redirectUrl);
  }
});

// Disconnect a social media account
socialMediaRouter.post(
  "/disconnect/:provider",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { provider } = req.params;

      const account =
        await connectedAccountsService.getConnectedAccountByProvider(
          userId,
          provider
        );

      if (!account) {
        return res.status(404).json({ error: `No ${provider} account found` });
      }

      await connectedAccountsService.disconnectAccount(account.id);

      res.json({
        success: true,
        message: `Successfully disconnected from ${provider}`,
      });
    } catch (error: any) {
      console.error(
        `[SOCIAL-MEDIA-ROUTES] Error disconnecting account: ${error.message}`
      );
      res.status(500).json({ error: "Failed to disconnect account" });
    }
  }
);

// Refresh connection (validate and update tokens if needed)
socialMediaRouter.post(
  "/refresh/:provider",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { provider } = req.params;

      const account =
        await connectedAccountsService.getConnectedAccountByProvider(
          userId,
          provider
        );

      if (!account) {
        return res.status(404).json({ error: `No ${provider} account found` });
      }

      // Get access token from meta
      const accessToken = account.meta.access_token;
      if (!accessToken) {
        return res.status(400).json({ error: "No access token found" });
      }

      // Validate connection
      const isValid = await composioService.validateConnection(
        provider,
        accessToken
      );

      if (isValid) {
        await connectedAccountsService.updateLastValidated(account.id);
        res.json({ success: true, message: "Connection is valid" });
      } else {
        // Mark as invalid and suggest reconnection
        await connectedAccountsService.updateConnectedAccount(account.id, {
          status: "invalid",
        });
        res.json({
          success: false,
          message: "Connection is invalid, please reconnect",
        });
      }
    } catch (error: any) {
      console.error(
        `[SOCIAL-MEDIA-ROUTES] Error refreshing connection: ${error.message}`
      );
      res.status(500).json({ error: "Failed to refresh connection" });
    }
  }
);

// Get user profile from connected account
socialMediaRouter.get(
  "/profile/:provider",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { provider } = req.params;

      const account =
        await connectedAccountsService.getConnectedAccountByProvider(
          userId,
          provider
        );

      if (!account) {
        return res.status(404).json({ error: `No ${provider} account found` });
      }

      const accessToken = account.meta.access_token;
      if (!accessToken) {
        return res.status(400).json({ error: "No access token found" });
      }

      // Get fresh profile data
      const profile = await composioService.getUserProfile(
        provider,
        accessToken
      );

      res.json({ success: true, profile });
    } catch (error: any) {
      console.error(
        `[SOCIAL-MEDIA-ROUTES] Error fetching profile: ${error.message}`
      );
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  }
);

// Get connection statistics
socialMediaRouter.get(
  "/stats",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const stats = await connectedAccountsService.getConnectionStats(userId);

      res.json({ success: true, stats });
    } catch (error: any) {
      console.error(
        `[SOCIAL-MEDIA-ROUTES] Error fetching connection stats: ${error.message}`
      );
      res.status(500).json({ error: "Failed to fetch connection stats" });
    }
  }
);

// ===== GOOGLE DRIVE ROUTES =====

// Get all files from Google Drive
socialMediaRouter.get(
  "/google-drive/files",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { pageToken, pageSize = 100 } = req.query;

      const result = await googleDriveService.getAllFiles(
        userId,
        pageToken as string,
        Number(pageSize)
      );

      res.json({
        success: true,
        files: result.files,
        nextPageToken: result.nextPageToken,
        totalFiles: result.files.length,
      });
    } catch (error: any) {
      console.error(
        `[GOOGLE-DRIVE-ROUTES] Error getting files: ${error.message}`
      );
      res.status(500).json({ error: error.message });
    }
  }
);

// Search files in Google Drive
socialMediaRouter.get(
  "/google-drive/search",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { q, pageToken, pageSize = 100 } = req.query;

      if (!q) {
        return res.status(400).json({ error: "Search query 'q' is required" });
      }

      const result = await googleDriveService.searchFiles(
        userId,
        q as string,
        pageToken as string,
        Number(pageSize)
      );

      res.json({
        success: true,
        files: result.files,
        nextPageToken: result.nextPageToken,
        totalFiles: result.files.length,
        query: q,
      });
    } catch (error: any) {
      console.error(
        `[GOOGLE-DRIVE-ROUTES] Error searching files: ${error.message}`
      );
      res.status(500).json({ error: error.message });
    }
  }
);

// Get file details
socialMediaRouter.get(
  "/google-drive/files/:fileId",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { fileId } = req.params;

      const file = await googleDriveService.getFileDetails(userId, fileId);

      res.json({
        success: true,
        file,
      });
    } catch (error: any) {
      console.error(
        `[GOOGLE-DRIVE-ROUTES] Error getting file details: ${error.message}`
      );
      res.status(500).json({ error: error.message });
    }
  }
);

// Get folder contents
socialMediaRouter.get(
  "/google-drive/folders/:folderId",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { folderId } = req.params;
      const { pageToken, pageSize = 100 } = req.query;

      const result = await googleDriveService.getFolderContents(
        userId,
        folderId,
        pageToken as string,
        Number(pageSize)
      );

      res.json({
        success: true,
        folderId,
        files: result.files,
        nextPageToken: result.nextPageToken,
        totalFiles: result.files.length,
      });
    } catch (error: any) {
      console.error(
        `[GOOGLE-DRIVE-ROUTES] Error getting folder contents: ${error.message}`
      );
      res.status(500).json({ error: error.message });
    }
  }
);

// Create a new folder
socialMediaRouter.post(
  "/google-drive/folders",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { name, parentFolderId } = req.body;

      if (!name) {
        return res.status(400).json({ error: "Folder name is required" });
      }

      const folder = await googleDriveService.createFolder(
        userId,
        name,
        parentFolderId
      );

      res.json({
        success: true,
        folder,
        message: "Folder created successfully",
      });
    } catch (error: any) {
      console.error(
        `[GOOGLE-DRIVE-ROUTES] Error creating folder: ${error.message}`
      );
      res.status(500).json({ error: error.message });
    }
  }
);

// Upload a file
socialMediaRouter.post(
  "/google-drive/upload",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { fileName, mimeType, content, parentFolderId } = req.body;

      if (!fileName || !mimeType || !content) {
        return res.status(400).json({
          error: "fileName, mimeType, and content are required",
        });
      }

      const file = await googleDriveService.uploadFile(
        userId,
        fileName,
        mimeType,
        content,
        parentFolderId
      );

      res.json({
        success: true,
        file,
        message: "File uploaded successfully",
      });
    } catch (error: any) {
      console.error(
        `[GOOGLE-DRIVE-ROUTES] Error uploading file: ${error.message}`
      );
      res.status(500).json({ error: error.message });
    }
  }
);

// Get file permissions
socialMediaRouter.get(
  "/google-drive/files/:fileId/permissions",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { fileId } = req.params;

      const permissions = await googleDriveService.getFilePermissions(
        userId,
        fileId
      );

      res.json({
        success: true,
        fileId,
        permissions,
      });
    } catch (error: any) {
      console.error(
        `[GOOGLE-DRIVE-ROUTES] Error getting file permissions: ${error.message}`
      );
      res.status(500).json({ error: error.message });
    }
  }
);

// Update file permissions
socialMediaRouter.post(
  "/google-drive/files/:fileId/permissions",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { fileId } = req.params;
      const { type, role, emailAddress, domain, allowFileDiscovery } = req.body;

      if (!type || !role) {
        return res.status(400).json({
          error: "type and role are required",
        });
      }

      const permission = await googleDriveService.updateFilePermissions(
        userId,
        fileId,
        {
          type,
          role,
          emailAddress,
          domain,
          allowFileDiscovery,
        }
      );

      res.json({
        success: true,
        permission,
        message: "Permission updated successfully",
      });
    } catch (error: any) {
      console.error(
        `[GOOGLE-DRIVE-ROUTES] Error updating file permissions: ${error.message}`
      );
      res.status(500).json({ error: error.message });
    }
  }
);

// Delete file permissions
socialMediaRouter.delete(
  "/google-drive/files/:fileId/permissions/:permissionId",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { fileId, permissionId } = req.params;

      await googleDriveService.deleteFilePermissions(
        userId,
        fileId,
        permissionId
      );

      res.json({
        success: true,
        message: "Permission deleted successfully",
      });
    } catch (error: any) {
      console.error(
        `[GOOGLE-DRIVE-ROUTES] Error deleting file permissions: ${error.message}`
      );
      res.status(500).json({ error: error.message });
    }
  }
);

// Get storage quota
socialMediaRouter.get(
  "/google-drive/quota",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;

      const quota = await googleDriveService.getStorageQuota(userId);

      res.json({
        success: true,
        quota,
      });
    } catch (error: any) {
      console.error(
        `[GOOGLE-DRIVE-ROUTES] Error getting storage quota: ${error.message}`
      );
      res.status(500).json({ error: error.message });
    }
  }
);

// Get Google Drive user profile
socialMediaRouter.get(
  "/google-drive/profile",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;

      const profile = await googleDriveService.getUserProfile(userId);

      res.json({
        success: true,
        profile,
      });
    } catch (error: any) {
      console.error(
        `[GOOGLE-DRIVE-ROUTES] Error getting user profile: ${error.message}`
      );
      res.status(500).json({ error: error.message });
    }
  }
);

// ===== GOOGLE DRIVE DOCUMENTS ROUTES =====

// Sync all documents from Google Drive for a user
socialMediaRouter.post(
  "/google-drive/sync-documents",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;

      console.log(
        `[GOOGLE-DRIVE-DOCUMENTS-ROUTES] Starting document sync for user: ${userId}`
      );

      const syncResult = await googleDriveDocumentsService.syncUserDocuments(
        userId
      );

      res.json({
        success: true,
        message: "Documents synced successfully",
        result: syncResult,
      });
    } catch (error: any) {
      console.error(
        `[GOOGLE-DRIVE-DOCUMENTS-ROUTES] Error syncing documents: ${error.message}`
      );
      res.status(500).json({ error: error.message });
    }
  }
);

// Get all documents for a user
socialMediaRouter.get(
  "/google-drive/documents",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { limit = 100, offset = 0 } = req.query;

      const result = await googleDriveDocumentsService.getUserDocuments(
        userId,
        Number(limit),
        Number(offset)
      );

      res.json({
        success: true,
        documents: result.documents,
        total: result.total,
        limit: Number(limit),
        offset: Number(offset),
      });
    } catch (error: any) {
      console.error(
        `[GOOGLE-DRIVE-DOCUMENTS-ROUTES] Error getting documents: ${error.message}`
      );
      res.status(500).json({ error: error.message });
    }
  }
);

// Get unprocessed documents for a user
socialMediaRouter.get(
  "/google-drive/documents/unprocessed",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { limit = 100 } = req.query;

      const documents =
        await googleDriveDocumentsService.getUnprocessedDocuments(
          userId,
          Number(limit)
        );

      res.json({
        success: true,
        documents,
        count: documents.length,
        limit: Number(limit),
      });
    } catch (error: any) {
      console.error(
        `[GOOGLE-DRIVE-DOCUMENTS-ROUTES] Error getting unprocessed documents: ${error.message}`
      );
      res.status(500).json({ error: error.message });
    }
  }
);

// Get document statistics for a user
socialMediaRouter.get(
  "/google-drive/documents/stats",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;

      const stats = await googleDriveDocumentsService.getDocumentStats(userId);

      res.json({
        success: true,
        stats,
      });
    } catch (error: any) {
      console.error(
        `[GOOGLE-DRIVE-DOCUMENTS-ROUTES] Error getting document stats: ${error.message}`
      );
      res.status(500).json({ error: error.message });
    }
  }
);

// Mark document as processed
socialMediaRouter.post(
  "/google-drive/documents/:documentId/process",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { documentId } = req.params;
      const { status, error } = req.body;

      if (!status) {
        return res.status(400).json({ error: "Status is required" });
      }

      let updatedDocument;
      if (status === "completed") {
        updatedDocument = await googleDriveDocumentsService.markAsProcessed(
          Number(documentId)
        );
      } else if (status === "failed") {
        if (!error) {
          return res
            .status(400)
            .json({ error: "Error message is required for failed status" });
        }
        updatedDocument = await googleDriveDocumentsService.markAsFailed(
          Number(documentId),
          error
        );
      } else {
        updatedDocument =
          await googleDriveDocumentsService.updateProcessingStatus(
            Number(documentId),
            status,
            error
          );
      }

      res.json({
        success: true,
        message: `Document marked as ${status}`,
        document: updatedDocument,
      });
    } catch (error: any) {
      console.error(
        `[GOOGLE-DRIVE-DOCUMENTS-ROUTES] Error updating document status: ${error.message}`
      );
      res.status(500).json({ error: error.message });
    }
  }
);

// Delete a document
socialMediaRouter.delete(
  "/google-drive/documents/:documentId",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { documentId } = req.params;

      await googleDriveDocumentsService.deleteDocument(Number(documentId));

      res.json({
        success: true,
        message: "Document deleted successfully",
      });
    } catch (error: any) {
      console.error(
        `[GOOGLE-DRIVE-DOCUMENTS-ROUTES] Error deleting document: ${error.message}`
      );
      res.status(500).json({ error: error.message });
    }
  }
);

// ============================================================================
// CRONJOB CONTROL ENDPOINTS
// ============================================================================

// Get cronjob service status
socialMediaRouter.get(
  "/cronjob/status",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const status = cronjobService.getStatus();
      res.json({
        success: true,
        status,
      });
    } catch (error: any) {
      console.error(
        `[CRONJOB-ROUTES] Error getting cronjob status: ${error.message}`
      );
      res.status(500).json({ error: error.message });
    }
  }
);

// Start cronjob service
socialMediaRouter.post(
  "/cronjob/start",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      cronjobService.start();
      res.json({
        success: true,
        message: "Cronjob service started successfully",
      });
    } catch (error: any) {
      console.error(
        `[CRONJOB-ROUTES] Error starting cronjob service: ${error.message}`
      );
      res.status(500).json({ error: error.message });
    }
  }
);

// Stop cronjob service
socialMediaRouter.post(
  "/cronjob/stop",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      cronjobService.stop();
      res.json({
        success: true,
        message: "Cronjob service stopped successfully",
      });
    } catch (error: any) {
      console.error(
        `[CRONJOB-ROUTES] Error stopping cronjob service: ${error.message}`
      );
      res.status(500).json({ error: error.message });
    }
  }
);

// Manually trigger document processing
socialMediaRouter.post(
  "/cronjob/trigger",
  isAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      await cronjobService.triggerProcessing();
      res.json({
        success: true,
        message: "Document processing triggered successfully",
      });
    } catch (error: any) {
      console.error(
        `[CRONJOB-ROUTES] Error triggering document processing: ${error.message}`
      );
      res.status(500).json({ error: error.message });
    }
  }
);

export default socialMediaRouter;
