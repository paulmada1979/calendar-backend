import { composioService } from "./composio";
import { logger } from "../utils/logger";
import { googleDriveDocumentsService } from "./googleDriveDocuments";

export interface ComposioGoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
  modifiedTime?: string;
  parents?: string[];
}

export interface ComposioGoogleDriveFileList {
  files: ComposioGoogleDriveFile[];
  nextPageToken?: string;
}

export class ComposioGoogleDriveService {
  private static instance: ComposioGoogleDriveService;

  private constructor() {}

  public static getInstance(): ComposioGoogleDriveService {
    if (!ComposioGoogleDriveService.instance) {
      ComposioGoogleDriveService.instance = new ComposioGoogleDriveService();
    }
    return ComposioGoogleDriveService.instance;
  }

  /**
   * Get all files from Google Drive using Composio
   */
  async getAllFiles(
    userId: string,
    pageToken?: string,
    pageSize: number = 100
  ): Promise<ComposioGoogleDriveFileList> {
    try {
      logger.info(
        `[COMPOSIO-GOOGLE-DRIVE] Getting all files for user: ${userId}`
      );

      // Get the connected account for Google Drive
      const { connectedAccountsService } = await import("./connectedAccounts");
      const connectedAccount =
        await connectedAccountsService.getConnectedAccountByProvider(
          userId,
          "googledrive"
        );

      if (!connectedAccount?.meta?.access_token) {
        throw new Error("No Google Drive access token found");
      }

      // Use Composio to get files from Google Drive
      const files = await this.getFilesFromComposio(
        connectedAccount.meta.access_token,
        pageToken,
        pageSize
      );

      logger.info(
        `[COMPOSIO-GOOGLE-DRIVE] Retrieved ${files.files.length} files`
      );
      return files;
    } catch (error: any) {
      logger.error(`[COMPOSIO-GOOGLE-DRIVE] Error getting files:`, error);
      throw error;
    }
  }

  /**
   * Get files from Google Drive using direct API calls with Composio's token management
   */
  private async getFilesFromComposio(
    accessToken: string,
    pageToken?: string,
    pageSize: number = 100
  ): Promise<ComposioGoogleDriveFileList> {
    try {
      // Use direct Google Drive API calls with Composio's token management
      // This approach is more reliable than trying to use specific Composio actions
      const url = new URL("https://www.googleapis.com/drive/v3/files");
      url.searchParams.set("pageSize", pageSize.toString());
      url.searchParams.set(
        "fields",
        "nextPageToken, files(id, name, mimeType, size, webViewLink, modifiedTime, parents)"
      );

      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Google Drive API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data = await response.json();

      // Transform the result to our expected format
      const files = data.files || [];
      const transformedFiles: ComposioGoogleDriveFile[] = files.map(
        (file: any) => ({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          size: file.size,
          webViewLink: file.webViewLink,
          modifiedTime: file.modifiedTime,
          parents: file.parents,
        })
      );

      return {
        files: transformedFiles,
        nextPageToken: data.nextPageToken,
      };
    } catch (error: any) {
      logger.error(
        `[COMPOSIO-GOOGLE-DRIVE] Error getting files from Google Drive API:`,
        error
      );
      throw error;
    }
  }

  /**
   * Download a single file from Google Drive using direct API calls
   */
  async downloadFile(
    fileId: string,
    fileName: string,
    userId: string
  ): Promise<Buffer> {
    try {
      logger.info(
        `[COMPOSIO-GOOGLE-DRIVE] Downloading file: ${fileName} (${fileId})`
      );

      // Get the connected account for Google Drive
      const { connectedAccountsService } = await import("./connectedAccounts");
      const connectedAccount =
        await connectedAccountsService.getConnectedAccountByProvider(
          userId,
          "googledrive"
        );

      if (!connectedAccount?.meta?.access_token) {
        throw new Error("No Google Drive access token found");
      }

      // Use direct Google Drive API call to download file
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        {
          headers: {
            Authorization: `Bearer ${connectedAccount.meta.access_token}`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Google Drive API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      // Convert response to buffer
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      logger.info(
        `[COMPOSIO-GOOGLE-DRIVE] File downloaded successfully: ${fileName} (${buffer.length} bytes)`
      );

      return buffer;
    } catch (error: any) {
      logger.error(
        `[COMPOSIO-GOOGLE-DRIVE] Error downloading file ${fileName}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Download multiple files with proper error handling and rate limiting
   */
  async downloadMultipleFiles(
    userId: string,
    files: Array<{ id: string; name: string; mimeType: string }>,
    maxConcurrent: number = 3
  ): Promise<
    Array<{
      fileId: string;
      fileName: string;
      buffer: Buffer;
      success: boolean;
      error?: string;
    }>
  > {
    try {
      logger.info(
        `[COMPOSIO-GOOGLE-DRIVE] Starting download of ${files.length} files for user ${userId}`
      );

      const results: Array<{
        fileId: string;
        fileName: string;
        buffer: Buffer;
        success: boolean;
        error?: string;
      }> = [];

      // Filter for supported document types
      const supportedFiles = files.filter((file) =>
        this.isSupportedDocumentType(file.mimeType)
      );

      logger.info(
        `[COMPOSIO-GOOGLE-DRIVE] Found ${supportedFiles.length} supported document files`
      );

      // Download files in chunks to avoid overwhelming the API
      const chunks = this.chunkArray(supportedFiles, maxConcurrent);

      for (const chunk of chunks) {
        const downloadPromises = chunk.map(async (file) => {
          try {
            const buffer = await this.downloadFile(file.id, file.name, userId);
            return {
              fileId: file.id,
              fileName: file.name,
              buffer,
              success: true,
            };
          } catch (error: any) {
            logger.error(
              `[COMPOSIO-GOOGLE-DRIVE] Failed to download file ${file.name}:`,
              error
            );
            return {
              fileId: file.id,
              fileName: file.name,
              buffer: Buffer.alloc(0),
              success: false,
              error: error.message,
            };
          }
        });

        const chunkResults = await Promise.all(downloadPromises);
        results.push(...chunkResults);

        // Add a small delay between chunks to be respectful to the API
        if (chunks.indexOf(chunk) < chunks.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      const successfulDownloads = results.filter((r) => r.success).length;
      logger.info(
        `[COMPOSIO-GOOGLE-DRIVE] Successfully downloaded ${successfulDownloads}/${results.length} files`
      );

      return results;
    } catch (error: any) {
      logger.error(
        `[COMPOSIO-GOOGLE-DRIVE] Error downloading multiple files:`,
        error
      );
      throw error;
    }
  }

  /**
   * Sync all documents from Google Drive for a user using Composio
   */
  async syncUserDocuments(userId: string): Promise<{
    total: number;
    new: number;
    updated: number;
    errors: string[];
  }> {
    try {
      logger.info(`[COMPOSIO-GOOGLE-DRIVE] Starting sync for user: ${userId}`);

      // Get all files from Google Drive using Composio
      const allFiles = await this.getAllFiles(userId, undefined, 1000);

      // Filter for document types
      const documentTypes = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
        "text/plain", // .txt
        "text/markdown", // .md
        "text/x-markdown", // .md alternative
        "application/msword", // .doc
        "application/vnd.ms-word", // .doc alternative
      ];

      const documents = allFiles.files.filter((file) =>
        documentTypes.includes(file.mimeType)
      );

      logger.info(
        `[COMPOSIO-GOOGLE-DRIVE] Found ${documents.length} documents out of ${allFiles.files.length} total files`
      );

      // Download files using Composio with proper error handling
      const downloadResults = await this.downloadMultipleFiles(
        userId,
        documents.map((file) => ({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
        }))
      );

      // Save successful downloads to database
      const { fileManagerService } = await import("./fileManager");
      const documentsToSave = [];

      for (const downloadResult of downloadResults) {
        if (downloadResult.success) {
          // Save file to local storage
          const localFileInfo = await fileManagerService.saveFileToLocal(
            downloadResult.buffer,
            downloadResult.fileName,
            userId,
            downloadResult.fileId
          );

          // Find the original document info
          const originalDoc = documents.find(
            (doc) => doc.id === downloadResult.fileId
          );
          if (originalDoc) {
            documentsToSave.push({
              user_id: userId,
              google_drive_file_id: originalDoc.id,
              file_name: originalDoc.name,
              file_path: this.buildFilePath(originalDoc),
              mime_type: originalDoc.mimeType,
              file_size: originalDoc.size
                ? parseInt(originalDoc.size)
                : undefined,
              google_drive_web_view_link: originalDoc.webViewLink,
              last_modified_at: originalDoc.modifiedTime
                ? new Date(originalDoc.modifiedTime)
                : undefined,
              local_file_path: localFileInfo.localPath,
              downloaded_at: localFileInfo.downloadedAt,
            });
          }
        }
      }

      // Save all documents to database
      const savedDocuments = await googleDriveDocumentsService.saveDocuments(
        documentsToSave
      );

      logger.info(
        `[COMPOSIO-GOOGLE-DRIVE] Successfully synced ${savedDocuments.length} documents`
      );

      return {
        total: documents.length,
        new: savedDocuments.length,
        updated: 0, // We're using UPSERT, so all are either new or updated
        errors: downloadResults
          .filter((r) => !r.success)
          .map((r) => r.error || "Unknown error"),
      };
    } catch (error: any) {
      logger.error(
        `[COMPOSIO-GOOGLE-DRIVE] Error syncing user documents:`,
        error
      );
      throw new Error(`Failed to sync user documents: ${error.message}`);
    }
  }

  /**
   * Check if MIME type is supported
   */
  private isSupportedDocumentType(mimeType: string): boolean {
    const supportedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "application/vnd.ms-word",
      "text/plain",
      "text/markdown",
      "text/x-markdown",
    ];

    return supportedTypes.includes(mimeType);
  }

  /**
   * Split array into chunks for concurrency control
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Build file path from Google Drive file
   */
  private buildFilePath(file: ComposioGoogleDriveFile): string {
    // For now, just use the file name
    // In the future, you could build a full path based on folder structure
    return file.name;
  }
}

export const composioGoogleDriveService =
  ComposioGoogleDriveService.getInstance();
