import fs from "fs";
import path from "path";
import { logger } from "../utils/logger";

export interface LocalFileInfo {
  localPath: string;
  fileSize: number;
  downloadedAt: Date;
}

export class FileManagerService {
  private tempDir: string;
  private maxConcurrentDownloads: number = 3;
  private downloadQueue: Array<() => Promise<void>> = [];
  private activeDownloads: number = 0;

  constructor() {
    // Create temp directory in project root
    this.tempDir = path.join(process.cwd(), "temp", "google-drive-files");
    this.ensureTempDir();
  }

  /**
   * Ensure temp directory exists
   */
  private ensureTempDir(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
      logger.info(`[FILE-MANAGER] Created temp directory: ${this.tempDir}`);
    }
  }

  /**
   * Download a single file from Google Drive to local temp folder
   */
  async downloadFile(
    fileId: string,
    fileName: string,
    accessToken: string,
    userId: string
  ): Promise<LocalFileInfo> {
    try {
      // Create user-specific subdirectory
      const userDir = path.join(this.tempDir, userId);
      if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
      }

      // Create safe filename (remove special characters)
      const safeFileName = this.createSafeFileName(fileName);
      const localPath = path.join(userDir, `${fileId}_${safeFileName}`);

      logger.info(
        `[FILE-MANAGER] Downloading file: ${fileName} to ${localPath}`
      );

      // Download file from Google Drive
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Google Drive API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      // Convert response to buffer and save to file
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      fs.writeFileSync(localPath, buffer);

      const fileSize = buffer.length;
      const downloadedAt = new Date();

      logger.info(
        `[FILE-MANAGER] File downloaded successfully: ${fileName} (${fileSize} bytes)`
      );

      return {
        localPath,
        fileSize,
        downloadedAt,
      };
    } catch (error: any) {
      logger.error(`[FILE-MANAGER] Error downloading file ${fileName}:`, error);
      throw error;
    }
  }

  /**
   * Download all files from Google Drive for a user
   */
  async downloadAllUserFiles(
    userId: string,
    accessToken: string,
    files: Array<{ id: string; name: string; mimeType: string }>
  ): Promise<Array<{ fileId: string; localInfo: LocalFileInfo }>> {
    try {
      logger.info(
        `[FILE-MANAGER] Starting download of ${files.length} files for user ${userId}`
      );

      const downloadedFiles: Array<{
        fileId: string;
        localInfo: LocalFileInfo;
      }> = [];

      // Filter for supported document types
      const supportedFiles = files.filter((file) =>
        this.isSupportedDocumentType(file.mimeType)
      );

      logger.info(
        `[FILE-MANAGER] Found ${supportedFiles.length} supported document files`
      );

      // Download files with concurrency control
      const chunks = this.chunkArray(
        supportedFiles,
        this.maxConcurrentDownloads
      );

      for (const chunk of chunks) {
        const downloadPromises = chunk.map(async (file) => {
          try {
            const localInfo = await this.downloadFile(
              file.id,
              file.name,
              accessToken,
              userId
            );

            return {
              fileId: file.id,
              localInfo,
            };
          } catch (error: any) {
            logger.error(
              `[FILE-MANAGER] Failed to download file ${file.name}:`,
              error
            );
            return null;
          }
        });

        const results = await Promise.all(downloadPromises);
        const validResults = results.filter((result) => result !== null);
        downloadedFiles.push(...validResults);
      }

      logger.info(
        `[FILE-MANAGER] Successfully downloaded ${downloadedFiles.length} files for user ${userId}`
      );

      return downloadedFiles;
    } catch (error: any) {
      logger.error(`[FILE-MANAGER] Error downloading user files:`, error);
      throw error;
    }
  }

  /**
   * Get local file path for a document
   */
  getLocalFilePath(userId: string, fileId: string, fileName: string): string {
    const userDir = path.join(this.tempDir, userId);
    const safeFileName = this.createSafeFileName(fileName);
    return path.join(userDir, `${fileId}_${safeFileName}`);
  }

  /**
   * Check if local file exists
   */
  fileExists(localPath: string): boolean {
    return fs.existsSync(localPath);
  }

  /**
   * Get file size
   */
  getFileSize(localPath: string): number {
    try {
      const stats = fs.statSync(localPath);
      return stats.size;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Delete local file after processing
   */
  deleteFile(localPath: string): boolean {
    try {
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
        logger.info(`[FILE-MANAGER] Deleted local file: ${localPath}`);
        return true;
      }
      return false;
    } catch (error: any) {
      logger.error(`[FILE-MANAGER] Error deleting file ${localPath}:`, error);
      return false;
    }
  }

  /**
   * Clean up old files (older than specified days)
   */
  cleanupOldFiles(maxAgeDays: number = 7): void {
    try {
      const cutoffTime = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

      const cleanupDir = (dirPath: string) => {
        if (!fs.existsSync(dirPath)) return;

        const items = fs.readdirSync(dirPath);

        for (const item of items) {
          const itemPath = path.join(dirPath, item);
          const stats = fs.statSync(itemPath);

          if (stats.isDirectory()) {
            cleanupDir(itemPath);
            // Remove empty directories
            if (fs.readdirSync(itemPath).length === 0) {
              fs.rmdirSync(itemPath);
            }
          } else if (stats.isFile() && stats.mtime.getTime() < cutoffTime) {
            fs.unlinkSync(itemPath);
            logger.info(`[FILE-MANAGER] Cleaned up old file: ${itemPath}`);
          }
        }
      };

      cleanupDir(this.tempDir);
      logger.info(
        `[FILE-MANAGER] Cleanup completed for files older than ${maxAgeDays} days`
      );
    } catch (error: any) {
      logger.error(`[FILE-MANAGER] Error during cleanup:`, error);
    }
  }

  /**
   * Get disk usage statistics
   */
  getDiskUsage(): {
    totalSize: number;
    fileCount: number;
    directorySize: number;
  } {
    try {
      let totalSize = 0;
      let fileCount = 0;

      const calculateSize = (dirPath: string): number => {
        if (!fs.existsSync(dirPath)) return 0;

        let size = 0;
        const items = fs.readdirSync(dirPath);

        for (const item of items) {
          const itemPath = path.join(dirPath, item);
          const stats = fs.statSync(itemPath);

          if (stats.isDirectory()) {
            size += calculateSize(itemPath);
          } else if (stats.isFile()) {
            size += stats.size;
            fileCount++;
          }
        }

        return size;
      };

      const directorySize = calculateSize(this.tempDir);

      return {
        totalSize: directorySize,
        fileCount,
        directorySize,
      };
    } catch (error: any) {
      logger.error(`[FILE-MANAGER] Error calculating disk usage:`, error);
      return { totalSize: 0, fileCount: 0, directorySize: 0 };
    }
  }

  /**
   * Save file buffer to local storage
   */
  async saveFileToLocal(
    fileBuffer: Buffer,
    fileName: string,
    userId: string,
    fileId: string
  ): Promise<LocalFileInfo> {
    try {
      // Create user-specific subdirectory
      const userDir = path.join(this.tempDir, userId);
      if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
      }

      // Create safe filename (remove special characters)
      const safeFileName = this.createSafeFileName(fileName);
      const localPath = path.join(userDir, `${fileId}_${safeFileName}`);

      logger.info(`[FILE-MANAGER] Saving file: ${fileName} to ${localPath}`);

      // Write buffer to file
      fs.writeFileSync(localPath, fileBuffer);

      const fileSize = fileBuffer.length;
      const downloadedAt = new Date();

      logger.info(
        `[FILE-MANAGER] File saved successfully: ${fileName} (${fileSize} bytes)`
      );

      return {
        localPath,
        fileSize,
        downloadedAt,
      };
    } catch (error: any) {
      logger.error(`[FILE-MANAGER] Error saving file ${fileName}:`, error);
      throw error;
    }
  }

  /**
   * Create safe filename by removing special characters
   */
  private createSafeFileName(fileName: string): string {
    return fileName
      .replace(/[^a-zA-Z0-9.-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
  }

  /**
   * Check if MIME type is supported
   */
  private isSupportedDocumentType(mimeType: string): boolean {
    const supportedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "text/plain",
      "text/markdown",
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
}

export const fileManagerService = new FileManagerService();
