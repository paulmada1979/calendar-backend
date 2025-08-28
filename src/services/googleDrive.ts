import { composioService } from "./composio";

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime: string;
  modifiedTime: string;
  parents?: string[];
  webViewLink?: string;
  permissions?: GoogleDrivePermission[];
}

export interface GoogleDrivePermission {
  id: string;
  type: "user" | "group" | "domain" | "anyone";
  role: "owner" | "writer" | "commenter" | "reader";
  emailAddress?: string;
  domain?: string;
  allowFileDiscovery?: boolean;
}

export interface GoogleDriveFolder {
  id: string;
  name: string;
  mimeType: string;
  createdTime: string;
  modifiedTime: string;
  parents?: string[];
  webViewLink?: string;
}

export interface GoogleDriveSearchResult {
  files: GoogleDriveFile[];
  nextPageToken?: string;
}

export class GoogleDriveService {
  private static instance: GoogleDriveService;

  private constructor() {}

  public static getInstance(): GoogleDriveService {
    if (!GoogleDriveService.instance) {
      GoogleDriveService.instance = new GoogleDriveService();
    }
    return GoogleDriveService.instance;
  }

  /**
   * Get all files from Google Drive with proper permissions
   */
  async getAllFiles(
    userId: string,
    pageToken?: string,
    pageSize: number = 100
  ): Promise<GoogleDriveSearchResult> {
    try {
      // Check if user has Google Drive connected
      const isConnected = await this.checkGoogleDriveConnection(userId);
      if (!isConnected) {
        throw new Error(
          "Google Drive not connected. Please connect your account first."
        );
      }

      // Use Composio to make the API call to Google Drive
      const response = await this.makeComposioRequest(
        userId,
        "googledrive",
        "files.list",
        {
          pageSize,
          pageToken,
          fields:
            "nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, parents, webViewLink, permissions)",
          orderBy: "modifiedTime desc",
        }
      );

      return {
        files: response.files || [],
        nextPageToken: response.nextPageToken,
      };
    } catch (error: any) {
      console.error("[GOOGLE-DRIVE-SERVICE] Error getting all files:", error);
      throw new Error(`Failed to get files: ${error.message}`);
    }
  }

  /**
   * Search files in Google Drive
   */
  async searchFiles(
    userId: string,
    query: string,
    pageToken?: string,
    pageSize: number = 100
  ): Promise<GoogleDriveSearchResult> {
    try {
      const isConnected = await this.checkGoogleDriveConnection(userId);
      if (!isConnected) {
        throw new Error(
          "Google Drive not connected. Please connect your account first."
        );
      }

      const response = await this.makeComposioRequest(
        userId,
        "googledrive",
        "files.list",
        {
          q: query,
          pageSize,
          pageToken,
          fields:
            "nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, parents, webViewLink, permissions)",
          orderBy: "modifiedTime desc",
        }
      );

      return {
        files: response.files || [],
        nextPageToken: response.nextPageToken,
      };
    } catch (error: any) {
      console.error("[GOOGLE-DRIVE-SERVICE] Error searching files:", error);
      throw new Error(`Failed to search files: ${error.message}`);
    }
  }

  /**
   * Get file details including permissions
   */
  async getFileDetails(
    userId: string,
    fileId: string
  ): Promise<GoogleDriveFile> {
    try {
      const isConnected = await this.checkGoogleDriveConnection(userId);
      if (!isConnected) {
        throw new Error(
          "Google Drive not connected. Please connect your account first."
        );
      }

      const response = await this.makeComposioRequest(
        userId,
        "googledrive",
        "files.get",
        {
          fileId,
          fields:
            "id, name, mimeType, size, createdTime, modifiedTime, parents, webViewLink, permissions",
        }
      );

      return response;
    } catch (error: any) {
      console.error(
        "[GOOGLE-DRIVE-SERVICE] Error getting file details:",
        error
      );
      throw new Error(`Failed to get file details: ${error.message}`);
    }
  }

  /**
   * Get folder contents
   */
  async getFolderContents(
    userId: string,
    folderId: string,
    pageToken?: string,
    pageSize: number = 100
  ): Promise<GoogleDriveSearchResult> {
    try {
      const isConnected = await this.checkGoogleDriveConnection(userId);
      if (!isConnected) {
        throw new Error(
          "Google Drive not connected. Please connect your account first."
        );
      }

      const response = await this.makeComposioRequest(
        userId,
        "googledrive",
        "files.list",
        {
          q: `'${folderId}' in parents and trashed=false`,
          pageSize,
          pageToken,
          fields:
            "nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, parents, webViewLink, permissions)",
          orderBy: "name",
        }
      );

      return {
        files: response.files || [],
        nextPageToken: response.nextPageToken,
      };
    } catch (error: any) {
      console.error(
        "[GOOGLE-DRIVE-SERVICE] Error getting folder contents:",
        error
      );
      throw new Error(`Failed to get folder contents: ${error.message}`);
    }
  }

  /**
   * Create a new folder
   */
  async createFolder(
    userId: string,
    name: string,
    parentFolderId?: string
  ): Promise<GoogleDriveFolder> {
    try {
      const isConnected = await this.checkGoogleDriveConnection(userId);
      if (!isConnected) {
        throw new Error(
          "Google Drive not connected. Please connect your account first."
        );
      }

      const fileMetadata = {
        name,
        mimeType: "application/vnd.google-apps.folder",
        ...(parentFolderId && { parents: [parentFolderId] }),
      };

      const response = await this.makeComposioRequest(
        userId,
        "googledrive",
        "files.create",
        {
          requestBody: fileMetadata,
          fields:
            "id, name, mimeType, createdTime, modifiedTime, parents, webViewLink",
        }
      );

      return response;
    } catch (error: any) {
      console.error("[GOOGLE-DRIVE-SERVICE] Error creating folder:", error);
      throw new Error(`Failed to create folder: ${error.message}`);
    }
  }

  /**
   * Upload a file to Google Drive
   */
  async uploadFile(
    userId: string,
    fileName: string,
    mimeType: string,
    content: string | Buffer,
    parentFolderId?: string
  ): Promise<GoogleDriveFile> {
    try {
      const isConnected = await this.checkGoogleDriveConnection(userId);
      if (!isConnected) {
        throw new Error(
          "Google Drive not connected. Please connect your account first."
        );
      }

      const fileMetadata = {
        name: fileName,
        ...(parentFolderId && { parents: [parentFolderId] }),
      };

      const media = {
        mimeType,
        body: content,
      };

      const response = await this.makeComposioRequest(
        userId,
        "googledrive",
        "files.create",
        {
          requestBody: fileMetadata,
          media: {
            mimeType,
            body: content,
          },
          fields:
            "id, name, mimeType, size, createdTime, modifiedTime, parents, webViewLink",
        }
      );

      return response;
    } catch (error: any) {
      console.error("[GOOGLE-DRIVE-SERVICE] Error uploading file:", error);
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  }

  /**
   * Update file permissions
   */
  async updateFilePermissions(
    userId: string,
    fileId: string,
    permission: Omit<GoogleDrivePermission, "id">
  ): Promise<GoogleDrivePermission> {
    try {
      const isConnected = await this.checkGoogleDriveConnection(userId);
      if (!isConnected) {
        throw new Error(
          "Google Drive not connected. Please connect your account first."
        );
      }

      const response = await this.makeComposioRequest(
        userId,
        "googledrive",
        "permissions.create",
        {
          fileId,
          requestBody: permission,
          fields: "id, type, role, emailAddress, domain, allowFileDiscovery",
        }
      );

      return response;
    } catch (error: any) {
      console.error(
        "[GOOGLE-DRIVE-SERVICE] Error updating file permissions:",
        error
      );
      throw new Error(`Failed to update file permissions: ${error.message}`);
    }
  }

  /**
   * Delete file permissions
   */
  async deleteFilePermissions(
    userId: string,
    fileId: string,
    permissionId: string
  ): Promise<void> {
    try {
      const isConnected = await this.checkGoogleDriveConnection(userId);
      if (!isConnected) {
        throw new Error(
          "Google Drive not connected. Please connect your account first."
        );
      }

      await this.makeComposioRequest(
        userId,
        "googledrive",
        "permissions.delete",
        {
          fileId,
          permissionId,
        }
      );
    } catch (error: any) {
      console.error(
        "[GOOGLE-DRIVE-SERVICE] Error deleting file permissions:",
        error
      );
      throw new Error(`Failed to delete file permissions: ${error.message}`);
    }
  }

  /**
   * Get file permissions
   */
  async getFilePermissions(
    userId: string,
    fileId: string
  ): Promise<GoogleDrivePermission[]> {
    try {
      const isConnected = await this.checkGoogleDriveConnection(userId);
      if (!isConnected) {
        throw new Error(
          "Google Drive not connected. Please connect your account first."
        );
      }

      const response = await this.makeComposioRequest(
        userId,
        "googledrive",
        "permissions.list",
        {
          fileId,
          fields:
            "permissions(id, type, role, emailAddress, domain, allowFileDiscovery)",
        }
      );

      return response.permissions || [];
    } catch (error: any) {
      console.error(
        "[GOOGLE-DRIVE-SERVICE] Error getting file permissions:",
        error
      );
      throw new Error(`Failed to get file permissions: ${error.message}`);
    }
  }

  /**
   * Check if user has Google Drive connected
   */
  private async checkGoogleDriveConnection(userId: string): Promise<boolean> {
    try {
      // Check if user has a connected Google Drive account
      const { connectedAccountsService } = await import("./connectedAccounts");
      const account =
        await connectedAccountsService.getConnectedAccountByProvider(
          userId,
          "googledrive"
        );
      return account !== null && account.status === "active";
    } catch (error) {
      console.error("[GOOGLE-DRIVE-SERVICE] Error checking connection:", error);
      return false;
    }
  }

  /**
   * Make a request to Google Drive API using the stored access token
   */
  private async makeComposioRequest(
    userId: string,
    provider: string,
    action: string,
    params: Record<string, any>
  ): Promise<any> {
    try {
      // Get the user's connected account for Google Drive
      const { connectedAccountsService } = await import("./connectedAccounts");
      const connectedAccount =
        await connectedAccountsService.getConnectedAccountByProvider(
          userId,
          provider
        );

      if (!connectedAccount) {
        throw new Error("Google Drive account not connected");
      }

      // Get the access token from the connected account
      const accessToken = connectedAccount.meta?.access_token;
      if (!accessToken) {
        throw new Error("No access token found for Google Drive account");
      }

      // Make direct API calls to Google Drive using the access token
      return await this.makeGoogleDriveAPIRequest(action, params, accessToken);
    } catch (error: any) {
      console.error(
        "[GOOGLE-DRIVE-SERVICE] Google Drive API request failed:",
        error
      );
      throw error;
    }
  }

  /**
   * Make direct API calls to Google Drive
   */
  private async makeGoogleDriveAPIRequest(
    action: string,
    params: Record<string, any>,
    accessToken: string
  ): Promise<any> {
    const baseURL = "https://www.googleapis.com/drive/v3";

    try {
      switch (action) {
        case "files.list":
          const queryParams = new URLSearchParams();
          if (params.pageSize)
            queryParams.append("pageSize", params.pageSize.toString());
          if (params.pageToken)
            queryParams.append("pageToken", params.pageToken);
          if (params.fields) queryParams.append("fields", params.fields);
          if (params.orderBy) queryParams.append("orderBy", params.orderBy);
          if (params.q) queryParams.append("q", params.q);

          const response = await fetch(`${baseURL}/files?${queryParams}`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          });

          if (!response.ok) {
            throw new Error(
              `Google Drive API error: ${response.status} ${response.statusText}`
            );
          }

          return await response.json();

        case "files.get":
          const fileId = params.fileId;
          const fields = params.fields || "*";

          const fileResponse = await fetch(
            `${baseURL}/files/${fileId}?fields=${fields}`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
            }
          );

          if (!fileResponse.ok) {
            throw new Error(
              `Google Drive API error: ${fileResponse.status} ${fileResponse.statusText}`
            );
          }

          return await fileResponse.json();

        case "about.get":
          const aboutFields = params.fields || "*";

          const aboutResponse = await fetch(
            `${baseURL}/about?fields=${aboutFields}`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
            }
          );

          if (!aboutResponse.ok) {
            throw new Error(
              `Google Drive API error: ${aboutResponse.status} ${aboutResponse.statusText}`
            );
          }

          return await aboutResponse.json();

        default:
          throw new Error(`Unsupported Google Drive action: ${action}`);
      }
    } catch (error: any) {
      console.error(`[GOOGLE-DRIVE-SERVICE] Error in ${action}:`, error);
      throw error;
    }
  }

  /**
   * Get storage quota information
   */
  async getStorageQuota(userId: string): Promise<{
    limit: string;
    usage: string;
    usageInDrive: string;
    usageInDriveTrash: string;
  }> {
    try {
      const isConnected = await this.checkGoogleDriveConnection(userId);
      if (!isConnected) {
        throw new Error(
          "Google Drive not connected. Please connect your account first."
        );
      }

      const response = await this.makeComposioRequest(
        userId,
        "googledrive",
        "about.get",
        {
          fields: "storageQuota",
        }
      );

      return response.storageQuota;
    } catch (error: any) {
      console.error(
        "[GOOGLE-DRIVE-SERVICE] Error getting storage quota:",
        error
      );
      throw new Error(`Failed to get storage quota: ${error.message}`);
    }
  }

  /**
   * Get user's Google Drive profile
   */
  async getUserProfile(userId: string): Promise<{
    displayName: string;
    emailAddress: string;
    photoLink?: string;
    permissionId: string;
  }> {
    try {
      const isConnected = await this.checkGoogleDriveConnection(userId);
      if (!isConnected) {
        throw new Error(
          "Google Drive not connected. Please connect your account first."
        );
      }

      const response = await this.makeComposioRequest(
        userId,
        "googledrive",
        "about.get",
        {
          fields: "user",
        }
      );

      return response.user;
    } catch (error: any) {
      console.error(
        "[GOOGLE-DRIVE-SERVICE] Error getting user profile:",
        error
      );
      throw new Error(`Failed to get user profile: ${error.message}`);
    }
  }
}

export const googleDriveService = GoogleDriveService.getInstance();
