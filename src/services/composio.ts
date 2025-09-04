import { pgPool } from "../lib/pg";
import { Composio } from "@composio/core";
import { logger } from "../utils/logger";

// Types for Composio integration
export interface ComposioAuthConfig {
  id: string;
  name: string;
  provider: string;
  config: Record<string, any>;
}

export interface ConnectedAccount {
  id: number;
  user_id: string;
  provider: string;
  auth_config_id?: string;
  connected_account_id?: string;
  account_label?: string;
  account_email?: string;
  external_user_id?: string;
  external_org_id?: string;
  scopes: string[];
  status: string;
  is_primary: boolean;
  last_validated_at?: Date;
  last_sync_at?: Date;
  created_at: Date;
  updated_at: Date;
  meta: Record<string, any>;
  public_url?: string;
}

export interface SocialMediaProfile {
  provider: string;
  external_user_id: string;
  account_email?: string;
  account_label?: string;
  public_url?: string;
  meta: Record<string, any>;
}

// Composio service class using the official Core SDK
export class ComposioService {
  private static instance: ComposioService;
  private composio: Composio | null = null;
  private isInitialized: boolean = false;

  // Temporary storage for OAuth state tracking
  private oauthStateMap: Map<
    string,
    { userId: string; provider: string; timestamp: number }
  > = new Map();

  private constructor() {
    this.initializeComposio();
  }

  public static getInstance(): ComposioService {
    if (!ComposioService.instance) {
      ComposioService.instance = new ComposioService();
    }
    return ComposioService.instance;
  }

  /**
   * Initialize Composio Core SDK
   */
  private async initializeComposio(): Promise<void> {
    try {
      const apiKey = process.env.COMPOSIO_API_KEY;

      if (!apiKey) {
        console.warn(
          "[COMPOSIO-SERVICE] No API key configured, SDK will not be initialized"
        );
        return;
      }

      this.composio = new Composio({
        apiKey: apiKey,
        baseURL:
          process.env.COMPOSIO_BASE_URL || "https://backend.composio.dev",
      });

      console.log(
        "[COMPOSIO-SERVICE] Composio Core SDK initialized successfully"
      );
      this.isInitialized = true;
    } catch (error) {
      console.error(
        "[COMPOSIO-SERVICE] Failed to initialize Composio Core SDK:",
        error
      );
      this.composio = null;
      this.isInitialized = false;
    }
  }

  /**
   * Get available social media platforms
   * For now, returns default platforms since Composio Core may have different API
   */
  async getAvailablePlatforms(): Promise<string[]> {
    try {
      if (!this.composio || !this.isInitialized) {
        console.warn(
          "[COMPOSIO-SERVICE] SDK not initialized, returning default platforms"
        );
        return ["linkedin", "facebook", "twitter", "instagram", "googledrive"];
      }

      // TODO: Implement actual platform fetching when we understand the Composio Core API
      // For now, return default platforms including Google Drive
      console.log(
        "[COMPOSIO-SERVICE] Using default platforms (Composio Core API integration pending)"
      );
      return ["linkedin", "facebook", "twitter", "instagram", "googledrive"];
    } catch (error) {
      console.error("[COMPOSIO-SERVICE] Error fetching platforms:", error);
      return ["linkedin", "facebook", "twitter", "instagram", "googledrive"];
    }
  }

  /**
   * Initiate OAuth flow for a social media platform
   */
  async initiateOAuth(
    provider: string,
    userId: string,
    redirectUri: string
  ): Promise<{ authUrl: string; state: string; connectionRequestId: string }> {
    try {
      // Check if Composio SDK is available
      if (!this.composio || !this.isInitialized) {
        throw new Error(
          "Composio SDK not initialized. Please configure COMPOSIO_API_KEY in your environment variables."
        );
      }

      // We'll generate state after getting the connection request ID

      console.log(`[COMPOSIO-SERVICE] Initiating OAuth for ${provider}`);

      // Use Composio Core SDK to initiate OAuth
      // Note: The actual method names may vary based on the Core API structure
      try {
        // Try different possible method names for OAuth initiation
        let authResponse;

        // Implement the correct Composio OAuth flow:
        // 1. Create an auth config
        // 2. Initiate connection with auth config ID

        console.log(
          "[COMPOSIO-SERVICE] Starting Composio OAuth flow for",
          provider
        );

        try {
          // Step 1: Get existing auth config for the provider or create one
          console.log(
            "[COMPOSIO-SERVICE] Looking for existing auth config for",
            provider
          );

          // List existing auth configs and find one for this provider
          const authConfigs = await this.composio.authConfigs.list();
          console.log(
            "[COMPOSIO-SERVICE] Found",
            authConfigs.items.length,
            "auth configs"
          );

          // Debug: Log the structure of first few configs
          console.log(
            "[COMPOSIO-SERVICE] First auth config structure:",
            JSON.stringify(authConfigs.items[0], null, 2)
          );

          let authConfig = authConfigs.items.find((config: any) => {
            // Safe access to properties
            const toolkitName = config.toolkit?.name;
            const configName = config.name;

            console.log("[COMPOSIO-SERVICE] Checking config:", {
              name: configName,
              toolkitName: toolkitName,
              provider: provider,
            });

            return (
              (toolkitName &&
                toolkitName.toLowerCase().includes(provider.toLowerCase())) ||
              (configName &&
                configName.toLowerCase().includes(provider.toLowerCase()))
            );
          }) as any;

          if (authConfig) {
            console.log(
              "[COMPOSIO-SERVICE] Using existing auth config:",
              authConfig.name,
              "ID:",
              authConfig.id
            );
          } else {
            console.log(
              "[COMPOSIO-SERVICE] Creating new auth config for",
              provider
            );
            authConfig = await this.composio.authConfigs.create(provider, {
              type: "use_composio_managed_auth",
            });
            console.log(
              "[COMPOSIO-SERVICE] New auth config created:",
              authConfig
            );
          }

          // Ensure we have an auth config
          if (!authConfig || !authConfig.id) {
            throw new Error(
              `Failed to create or find auth config for ${provider}`
            );
          }

          // Step 2: Initiate the OAuth connection
          console.log(
            "[COMPOSIO-SERVICE] Initiating connection with auth config ID:",
            authConfig.id
          );

          // Use backend callback URL instead of frontend redirect URI
          const backendCallbackUrl = `${
            process.env.BACKEND_URL || "http://localhost:4000"
          }/social/callback/${provider}`;

          console.log(
            `[COMPOSIO-SERVICE] Using backend callback URL: ${backendCallbackUrl}`
          );

          const connectionRequest =
            await this.composio.connectedAccounts.initiate(
              userId, // user identifier
              authConfig.id, // auth config ID
              {
                callbackUrl: backendCallbackUrl, // Backend callback URL
                allowMultiple: true, // Allow multiple connected accounts per user
              }
            );

          console.log(
            "[COMPOSIO-SERVICE] Connection request created:",
            connectionRequest
          );

          // Extract the connection request ID for later use
          const connectionRequestId = (connectionRequest as any).id;
          if (!connectionRequestId) {
            throw new Error("Connection request missing ID");
          }

          // Store OAuth state for later retrieval in callback
          this.storeOAuthState(connectionRequestId, userId, provider);

          // Generate state with connection request ID
          const state = this.generateState(
            userId,
            provider,
            connectionRequestId
          );

          // The connection request should contain the redirect URL
          const requestAny = connectionRequest as any;
          if (
            requestAny &&
            (requestAny.redirectUrl || requestAny.authUrl || requestAny.url)
          ) {
            return {
              authUrl:
                requestAny.redirectUrl || requestAny.authUrl || requestAny.url,
              state: state,
              connectionRequestId: connectionRequestId,
            };
          } else {
            console.log(
              "[COMPOSIO-SERVICE] Connection request structure:",
              Object.keys(connectionRequest)
            );
            throw new Error(
              `Connection request missing redirect URL: ${JSON.stringify(
                connectionRequest
              )}`
            );
          }
        } catch (composioError: any) {
          console.error(
            "[COMPOSIO-SERVICE] Composio OAuth error:",
            composioError
          );

          // Check if it's a network error
          if (
            composioError.message &&
            composioError.message.includes("ENOTFOUND")
          ) {
            throw new Error(
              `Cannot connect to Composio API. Please check your internet connection and verify the API endpoint. Error: ${composioError.message}`
            );
          }

          // Check if it's an API key error
          if (
            composioError.status === 401 ||
            composioError.message.includes("unauthorized")
          ) {
            throw new Error(
              `Invalid Composio API key. Please check your COMPOSIO_API_KEY environment variable. Error: ${composioError.message}`
            );
          }

          throw new Error(`Composio OAuth failed: ${composioError.message}`);
        }
      } catch (sdkError: any) {
        console.error("[COMPOSIO-SERVICE] Composio Core SDK error:", sdkError);
        throw new Error(
          `Failed to initiate OAuth with Composio Core SDK: ${sdkError.message}. Please check your API key and Composio configuration.`
        );
      }
    } catch (error) {
      console.error(
        `[COMPOSIO-SERVICE] Error initiating OAuth for ${provider}:`,
        error
      );

      // Mock service has been disabled - require real Composio integration
      throw error;
    }
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  async handleOAuthCallback(
    provider: string,
    code: string,
    state: string
  ): Promise<SocialMediaProfile> {
    try {
      if (!this.composio || !this.isInitialized) {
        throw new Error("Composio SDK not initialized");
      }

      console.log(`[COMPOSIO-SERVICE] Handling OAuth callback for ${provider}`);

      // Use Composio Core SDK to handle OAuth callback
      console.log(
        `[COMPOSIO-SERVICE] Handling OAuth callback for ${provider} with code: ${code}`
      );

      try {
        // Parse the state to get the connection request ID or other info
        const [userId] = state.split(":");
        console.log("[COMPOSIO-SERVICE] Extracted userId from state:", userId);

        // For OAuth callback, we need to wait for the connection to be established
        // The code parameter contains the authorization code from the OAuth provider
        console.log("[COMPOSIO-SERVICE] OAuth code received:", code);

        // Parse state to get connection request ID
        const stateParts = state.split(":");
        const connectionRequestId = stateParts[1]; // state format: userId:connectionRequestId

        if (!connectionRequestId) {
          throw new Error("No connection request ID found in state parameter");
        }

        console.log(
          "[COMPOSIO-SERVICE] Connection request ID from state:",
          connectionRequestId
        );

        // Wait for the connection to become active
        console.log(
          "[COMPOSIO-SERVICE] Waiting for connection to become active..."
        );

        // Poll for connection status with timeout
        let attempts = 0;
        const maxAttempts = 20; // 10 seconds total (500ms intervals)
        let connectionActive = false;
        let connectedAccountId = null;

        while (attempts < maxAttempts && !connectionActive) {
          attempts++;
          console.log(
            `[COMPOSIO-SERVICE] Polling attempt ${attempts}/${maxAttempts}`
          );

          try {
            const connectionRequest = await this.composio.connectedAccounts.get(
              connectionRequestId
            );
            const status = (connectionRequest as any).status;

            console.log(`[COMPOSIO-SERVICE] Connection status:`, status);

            if (status === "ACTIVE" || status === "CONNECTED") {
              connectionActive = true;
              connectedAccountId = (connectionRequest as any).id;
              console.log("[COMPOSIO-SERVICE] Connection is now active!");
              break;
            } else if (status === "FAILED" || status === "REJECTED") {
              throw new Error(`Connection failed with status: ${status}`);
            }

            // Wait 500ms before next attempt
            await new Promise((resolve) => setTimeout(resolve, 500));
          } catch (pollError) {
            console.log(
              `[COMPOSIO-SERVICE] Polling error (attempt ${attempts}):`,
              pollError
            );
            if (attempts === maxAttempts) {
              throw new Error(
                `Connection did not become active after ${maxAttempts} attempts`
              );
            }
          }
        }

        if (!connectionActive || !connectedAccountId) {
          throw new Error("Connection did not become active within timeout");
        }

        // Now fetch the actual profile data
        console.log(
          "[COMPOSIO-SERVICE] Fetching profile data for active connection..."
        );
        const profile = await this.getConnectedAccountProfile(
          connectedAccountId,
          provider
        );

        console.log(
          "[COMPOSIO-SERVICE] Profile fetched successfully:",
          profile
        );
        return profile;

        console.log(
          "[COMPOSIO-SERVICE] Created profile from callback:",
          profile
        );
        return profile;
      } catch (callbackError: any) {
        console.error(
          "[COMPOSIO-SERVICE] OAuth callback error:",
          callbackError
        );
        throw new Error(
          `Failed to handle OAuth callback: ${callbackError.message}`
        );
      }
    } catch (error) {
      console.error(
        `[COMPOSIO-SERVICE] Error handling OAuth callback for ${provider}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Check if a connection request is active
   */
  async checkConnectionStatus(connectionRequestId: string): Promise<boolean> {
    try {
      if (!this.composio || !this.isInitialized) {
        throw new Error("Composio SDK not initialized");
      }

      console.log(
        `[COMPOSIO-SERVICE] Checking connection status for:`,
        connectionRequestId
      );

      // Use Composio Core API to check connection status
      try {
        // Get the connection request details
        const connectionRequest = await this.composio.connectedAccounts.get(
          connectionRequestId
        );
        console.log(
          `[COMPOSIO-SERVICE] Connection request details:`,
          connectionRequest
        );

        // Check if the connection is active
        const status = (connectionRequest as any).status;
        console.log(`[COMPOSIO-SERVICE] Connection status:`, status);

        // Return true if connection is active/connected
        return (
          status === "ACTIVE" || status === "CONNECTED" || status === "READY"
        );
      } catch (composioError: any) {
        console.error(`[COMPOSIO-SERVICE] Composio API error:`, composioError);

        // If the connection doesn't exist or other error, return false
        return false;
      }
    } catch (error) {
      console.error(
        `[COMPOSIO-SERVICE] Error checking connection status:`,
        error
      );
      throw error;
    }
  }

  /**
   * Check if user already has an active connection for a provider
   */
  async checkExistingConnection(
    userId: string,
    provider: string
  ): Promise<string | null> {
    try {
      if (!this.composio || !this.isInitialized) {
        throw new Error("Composio SDK not initialized");
      }

      console.log(
        `[COMPOSIO-SERVICE] Checking existing connections for user:`,
        userId,
        `provider:`,
        provider
      );

      try {
        // Use the SDK's connectedAccounts.list() method properly
        const connectedAccounts = await this.composio.connectedAccounts.list();
        console.log(
          `[COMPOSIO-SERVICE] Found`,
          connectedAccounts.items.length,
          `total connected accounts`
        );

        // Log all connections with their status for debugging
        console.log(
          `[COMPOSIO-SERVICE] All connections:`,
          connectedAccounts.items.map((acc: any) => ({
            id: acc.id,
            status: acc.status,
            createdAt: acc.createdAt,
            updatedAt: acc.updatedAt,
          }))
        );

        // Filter for active connections for THIS SPECIFIC PROVIDER
        // We need to check if the connection is actually for the requested provider
        const providerSpecificConnections = connectedAccounts.items.filter(
          (account: any) => {
            const isActive =
              account.status === "ACTIVE" ||
              account.status === "CONNECTED" ||
              account.status === "READY";

            // Check if this connection is for the specific provider
            // We'll need to examine the account details to determine the provider
            const accountProvider = this.getProviderFromConnection(account);
            const isCorrectProvider = accountProvider === provider;

            console.log(`[COMPOSIO-SERVICE] Connection ${account.id}:`, {
              status: account.status,
              provider: accountProvider,
              requestedProvider: provider,
              isActive,
              isCorrectProvider,
            });

            return isActive && isCorrectProvider;
          }
        );

        console.log(
          `[COMPOSIO-SERVICE] Found`,
          providerSpecificConnections.length,
          `active connections for ${provider}`
        );

        if (providerSpecificConnections.length > 0) {
          // Return the first active connection for this provider
          const firstActive = providerSpecificConnections[0];
          console.log(
            `[COMPOSIO-SERVICE] Using active connection for ${provider}:`,
            firstActive.id
          );
          return firstActive.id;
        }

        console.log(`[COMPOSIO-SERVICE] No active connections found`);
        return null;
      } catch (composioError: any) {
        console.error(`[COMPOSIO-SERVICE] Composio API error:`, composioError);
        return null;
      }
    } catch (error) {
      console.error(
        `[COMPOSIO-SERVICE] Error checking existing connections:`,
        error
      );
      return null;
    }
  }

  /**
   * Get connected account profile from Composio
   */
  async getConnectedAccountProfile(
    connectionRequestId: string,
    provider: string
  ): Promise<SocialMediaProfile> {
    try {
      if (!this.composio || !this.isInitialized) {
        throw new Error("Composio SDK not initialized");
      }

      console.log(
        `[COMPOSIO-SERVICE] Getting profile for connection:`,
        connectionRequestId,
        `provider:`,
        provider
      );

      // Use Composio Core API to get the actual connected account profile
      try {
        // Get the connection request details
        const connectionRequest = await this.composio.connectedAccounts.get(
          connectionRequestId
        );
        console.log(
          `[COMPOSIO-SERVICE] Connection request details:`,
          connectionRequest
        );

        // Extract real profile information from the connection
        const connectionAny = connectionRequest as any;

        // Log the full connection structure for debugging
        console.log(
          `[COMPOSIO-SERVICE] Full connection structure:`,
          JSON.stringify(connectionAny, null, 2)
        );

        // Get the actual connected account ID if available
        const connectedAccountId =
          connectionAny.connectedAccountId ||
          connectionAny.accountId ||
          connectionRequestId;

        // Try to get additional profile information
        let profileData: any = {};
        try {
          // Attempt to get profile data from the connected account
          if (
            connectedAccountId &&
            connectedAccountId !== connectionRequestId
          ) {
            const accountDetails = await this.composio.connectedAccounts.get(
              connectedAccountId
            );
            profileData = accountDetails as any;
            console.log(`[COMPOSIO-SERVICE] Account details:`, profileData);
          }
        } catch (profileError) {
          console.log(
            `[COMPOSIO-SERVICE] Could not fetch additional profile data:`,
            profileError
          );
        }

        // Extract real user data from JWT token
        let realEmail = `user@${provider}.com`;
        let realName = `${provider} Account`;
        let realPicture = `https://${provider}.com/profile`;
        let realProfileUrl = `https://${provider}.com/profile`;

        try {
          if (connectionAny.data?.id_token) {
            // Parse JWT token to extract user information
            const jwtPayload = JSON.parse(
              Buffer.from(
                connectionAny.data.id_token.split(".")[1],
                "base64"
              ).toString()
            );
            console.log(`[COMPOSIO-SERVICE] JWT payload:`, jwtPayload);

            realEmail = jwtPayload.email || realEmail;
            realName = jwtPayload.name || realName;
            realPicture = jwtPayload.picture || realPicture;

            // For LinkedIn, try to construct the profile URL from user ID
            if (provider === "linkedin" && jwtPayload.sub) {
              // LinkedIn profile URL format: https://www.linkedin.com/in/{user-id}
              realProfileUrl = `https://www.linkedin.com/in/${jwtPayload.sub}`;
            }

            console.log(`[COMPOSIO-SERVICE] Extracted real data:`, {
              email: realEmail,
              name: realName,
              picture: realPicture,
              profileUrl: realProfileUrl,
            });
          }
        } catch (jwtError) {
          console.log(
            `[COMPOSIO-SERVICE] Could not parse JWT token:`,
            jwtError
          );
        }

        // For LinkedIn, try to get the actual profile URL from the API
        if (provider === "linkedin" && connectionAny.data?.access_token) {
          try {
            console.log(
              `[COMPOSIO-SERVICE] Attempting to fetch LinkedIn profile URL...`
            );
            // Make a call to LinkedIn API to get the actual profile URL
            const linkedinResponse = await fetch(
              "https://api.linkedin.com/v2/me",
              {
                headers: {
                  Authorization: `Bearer ${connectionAny.data.access_token}`,
                  "X-Restli-Protocol-Version": "2.0.0",
                },
              }
            );

            if (linkedinResponse.ok) {
              const linkedinData = await linkedinResponse.json();
              console.log(
                `[COMPOSIO-SERVICE] LinkedIn API response:`,
                linkedinData
              );

              if (linkedinData.publicIdentifier) {
                realProfileUrl = `https://www.linkedin.com/in/${linkedinData.publicIdentifier}`;
                console.log(
                  `[COMPOSIO-SERVICE] Found LinkedIn profile URL:`,
                  realProfileUrl
                );
              }
            }
          } catch (apiError) {
            console.log(
              `[COMPOSIO-SERVICE] Could not fetch LinkedIn profile URL:`,
              apiError
            );
          }
        }

        // Create profile with real data from Composio
        const profile: SocialMediaProfile = {
          provider: provider as any, // Cast to enum type
          external_user_id: connectedAccountId,
          account_email: realEmail,
          account_label: realName,
          public_url: realProfileUrl, // Use the real profile URL, not the picture
          meta: {
            composio_connected: true,
            connected_at: new Date().toISOString(),
            connection_request_id: connectionRequestId,
            connected_account_id: connectedAccountId,
            connection_status: connectionAny.status,
            profile_data: profileData,
            access_token: connectionAny.data?.access_token,
            id_token: connectionAny.data?.id_token,
            scopes: connectionAny.data?.scope?.split(","),
            profile_picture: realPicture, // Store picture separately in meta
            note: "Real profile data from Composio Core API",
          },
        };

        console.log(
          `[COMPOSIO-SERVICE] Created real profile from Composio:`,
          profile
        );
        return profile;
      } catch (composioError: any) {
        console.error(`[COMPOSIO-SERVICE] Composio API error:`, composioError);

        // Fallback to basic profile if Composio API fails
        console.log(
          `[COMPOSIO-SERVICE] Falling back to basic profile structure`
        );
        const profile: SocialMediaProfile = {
          provider: provider as any,
          external_user_id: connectionRequestId,
          account_email: `user@${provider}.com`,
          account_label: `${provider} Account`,
          public_url: `https://${provider}.com/profile`,
          meta: {
            composio_connected: true,
            connected_at: new Date().toISOString(),
            connection_request_id: connectionRequestId,
            error: "Could not fetch real profile data from Composio",
            fallback: true,
          },
        };

        return profile;
      }
    } catch (error) {
      console.error(
        `[COMPOSIO-SERVICE] Error getting connected account profile:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get user profile from a connected social media account
   */
  async getUserProfile(
    provider: string,
    accessToken: string
  ): Promise<Record<string, any>> {
    try {
      if (!this.composio || !this.isInitialized) {
        throw new Error("Composio SDK not initialized");
      }

      console.log(`[COMPOSIO-SERVICE] Fetching profile for ${provider}`);

      // TODO: Implement actual profile fetching when we understand the Composio Core API
      throw new Error("Composio Core profile fetching not yet implemented");
    } catch (error) {
      console.error(
        `[COMPOSIO-SERVICE] Error fetching profile for ${provider}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Validate if a connection is still active
   */
  async validateConnection(
    provider: string,
    accessToken: string
  ): Promise<boolean> {
    try {
      if (!this.composio || !this.isInitialized) {
        return false;
      }

      // TODO: Implement actual connection validation when we understand the Composio Core API
      // For now, return false to indicate validation is not available
      return false;
    } catch (error) {
      console.error(
        `[COMPOSIO-SERVICE] Error validating connection for ${provider}:`,
        error
      );
      return false;
    }
  }

  /**
   * Get connection status from Composio
   */
  async getConnectionStatus(
    connectionId: string
  ): Promise<Record<string, any>> {
    try {
      if (!this.composio || !this.isInitialized) {
        throw new Error("Composio SDK not initialized");
      }

      // TODO: Implement actual connection status when we understand the Composio Core API
      throw new Error("Composio Core connection status not yet implemented");
    } catch (error) {
      console.error(
        `[COMPOSIO-SERVICE] Error getting connection status:`,
        error
      );
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(
    provider: string,
    refreshToken: string
  ): Promise<Record<string, any>> {
    try {
      if (!this.composio || !this.isInitialized) {
        throw new Error("Composio SDK not initialized");
      }

      // TODO: Implement actual token refresh when we understand the Composio Core API
      throw new Error("Composio Core token refresh not yet implemented");
    } catch (error) {
      console.error(
        `[COMPOSIO-SERVICE] Error refreshing token for ${provider}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Store OAuth state for later retrieval
   */
  private storeOAuthState(
    connectionRequestId: string,
    userId: string,
    provider: string
  ): void {
    this.oauthStateMap.set(connectionRequestId, {
      userId,
      provider,
      timestamp: Date.now(),
    });

    // Clean up old entries (older than 1 hour)
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [key, value] of this.oauthStateMap.entries()) {
      if (value.timestamp < oneHourAgo) {
        this.oauthStateMap.delete(key);
      }
    }

    console.log(
      `[COMPOSIO-SERVICE] Stored OAuth state for ${connectionRequestId}:`,
      { userId, provider }
    );
  }

  /**
   * Retrieve OAuth state by connection request ID
   */
  public getOAuthState(
    connectionRequestId: string
  ): { userId: string; provider: string } | null {
    const state = this.oauthStateMap.get(connectionRequestId);
    if (state) {
      console.log(
        `[COMPOSIO-SERVICE] Retrieved OAuth state for ${connectionRequestId}:`,
        state
      );
      return state;
    }
    return null;
  }

  /**
   * Clean up OAuth state after successful callback
   */
  public cleanupOAuthState(connectionRequestId: string): void {
    const deleted = this.oauthStateMap.delete(connectionRequestId);
    if (deleted) {
      console.log(
        `[COMPOSIO-SERVICE] Cleaned up OAuth state for ${connectionRequestId}`
      );
    }
  }

  /**
   * Extract provider information from a Composio connection
   */
  private getProviderFromConnection(connection: any): string {
    try {
      // Try to get provider from various possible locations in the connection object
      const possibleProviderFields = [
        connection.provider,
        connection.toolkit?.name,
        connection.authConfig?.toolkit?.name,
        connection.authConfig?.name,
        connection.metadata?.provider,
        connection.data?.provider,
      ];

      for (const field of possibleProviderFields) {
        if (field && typeof field === "string") {
          const provider = field.toLowerCase();
          console.log(
            `[COMPOSIO-SERVICE] Found provider in connection: ${provider}`
          );
          return provider;
        }
      }

      // If no provider found, log the connection structure for debugging
      console.log(
        `[COMPOSIO-SERVICE] Connection structure:`,
        Object.keys(connection)
      );
      console.log(`[COMPOSIO-SERVICE] Connection details:`, connection);

      // Default to 'unknown' if we can't determine the provider
      return "unknown";
    } catch (error) {
      console.error(
        `[COMPOSIO-SERVICE] Error extracting provider from connection:`,
        error
      );
      return "unknown";
    }
  }

  /**
   * Generate a secure state parameter for OAuth
   */
  private generateState(
    userId: string,
    provider: string,
    connectionRequestId?: string
  ): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2);

    if (connectionRequestId) {
      // Include connection request ID for proper callback handling
      return `${userId}:${connectionRequestId}`;
    } else {
      // Fallback format for backward compatibility
      return `${userId}:${provider}:${timestamp}:${random}`;
    }
  }

  /**
   * Get default scopes for each platform
   */
  private getDefaultScopes(provider: string): string[] {
    const scopes: Record<string, string[]> = {
      linkedin: ["r_liteprofile", "r_emailaddress"],
      facebook: ["email", "public_profile"],
      twitter: ["tweet.read", "users.read"],
      instagram: ["user_profile", "user_media"],
      googledrive: [
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/drive.metadata.readonly",
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
    };

    return scopes[provider] || ["read"];
  }

  /**
   * Mock OAuth flow has been disabled
   * This method is kept for reference but will throw an error if called
   */
  private mockOAuthFlow(
    provider: string,
    userId: string,
    redirectUri: string
  ): { authUrl: string; state: string } {
    throw new Error(
      `Mock OAuth service has been disabled for ${provider}. Please use real Composio integration.`
    );
  }

  /**
   * Check if the service is properly initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.composio !== null;
  }

  /**
   * Execute a Composio action
   */
  async executeAction(
    toolkit: string,
    action: string,
    params: Record<string, any>
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      if (!this.composio || !this.isInitialized) {
        throw new Error("Composio SDK not initialized");
      }

      logger.info(`[COMPOSIO-SERVICE] Executing action: ${toolkit}.${action}`);

      // Use Composio Core SDK to execute actions
      // The correct method is tools.execute based on the documentation
      const result = await this.composio.tools.execute(
        `${toolkit.toUpperCase()}_${action.toUpperCase()}`,
        {
          userId: "default", // Use default user for now
          arguments: params,
        }
      );

      logger.info(
        `[COMPOSIO-SERVICE] Action executed successfully: ${toolkit}.${action}`
      );

      return {
        success: true,
        data: result.data,
      };
    } catch (error: any) {
      logger.error(
        `[COMPOSIO-SERVICE] Error executing action ${toolkit}.${action}:`,
        error
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get service status
   */
  getStatus(): Record<string, any> {
    return {
      initialized: this.isInitialized,
      sdkAvailable: this.composio !== null,
      apiKeyConfigured: !!process.env.COMPOSIO_API_KEY,
      nodeEnv: process.env.NODE_ENV || "development",
      note: "Mock service has been disabled. Real Composio Core API integration required.",
      status: this.isInitialized
        ? "Ready for real OAuth"
        : "Not initialized - requires COMPOSIO_API_KEY",
    };
  }
}

// Export singleton instance
export const composioService = ComposioService.getInstance();
