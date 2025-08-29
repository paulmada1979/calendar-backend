import { pgPool } from "../lib/pg";
import { googleDriveService } from "./googleDrive";

export interface GoogleDriveDocument {
  id: number;
  user_id: string;
  google_drive_file_id: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  file_size?: number;
  google_drive_web_view_link?: string;
  last_modified_at?: Date;
  processed: boolean;
  processing_status: "pending" | "processing" | "completed" | "failed";
  processing_error?: string;
  result?: any;
  local_file_path?: string;
  downloaded_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface DocumentToSave {
  user_id: string;
  google_drive_file_id: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  file_size?: number;
  google_drive_web_view_link?: string;
  last_modified_at?: Date;
  local_file_path?: string;
  downloaded_at?: Date;
}

export class GoogleDriveDocumentsService {
  private static instance: GoogleDriveDocumentsService;

  private constructor() {}

  public static getInstance(): GoogleDriveDocumentsService {
    if (!GoogleDriveDocumentsService.instance) {
      GoogleDriveDocumentsService.instance = new GoogleDriveDocumentsService();
    }
    return GoogleDriveDocumentsService.instance;
  }

  /**
   * Save a Google Drive document to the database
   */
  async saveDocument(document: DocumentToSave): Promise<GoogleDriveDocument> {
    try {
      const query = `
        INSERT INTO public.user_google_documents (
          user_id, google_drive_file_id, file_name, file_path, mime_type, 
          file_size, google_drive_web_view_link, last_modified_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (user_id, google_drive_file_id) 
        DO UPDATE SET
          file_name = EXCLUDED.file_name,
          file_path = EXCLUDED.file_path,
          mime_type = EXCLUDED.mime_type,
          file_size = EXCLUDED.file_size,
          google_drive_web_view_link = EXCLUDED.google_drive_web_view_link,
          last_modified_at = EXCLUDED.last_modified_at,
          updated_at = now()
        RETURNING *
      `;

      const values = [
        document.user_id,
        document.google_drive_file_id,
        document.file_name,
        document.file_path,
        document.mime_type,
        document.file_size,
        document.google_drive_web_view_link,
        document.last_modified_at,
      ];

      const result = await pgPool.query(query, values);
      return result.rows[0];
    } catch (error: any) {
      console.error(
        "[GOOGLE-DRIVE-DOCUMENTS-SERVICE] Error saving document:",
        error
      );
      throw new Error(`Failed to save document: ${error.message}`);
    }
  }

  /**
   * Save multiple Google Drive documents to the database
   */
  async saveDocuments(
    documents: DocumentToSave[]
  ): Promise<GoogleDriveDocument[]> {
    try {
      if (documents.length === 0) {
        return [];
      }

      // Use a transaction for better performance and consistency
      const client = await pgPool.connect();
      try {
        await client.query("BEGIN");

        const savedDocuments: GoogleDriveDocument[] = [];

        // Insert documents one by one to avoid complex batch insert syntax issues
        for (const doc of documents) {
          const query = `
            INSERT INTO public.user_google_documents (
              user_id, google_drive_file_id, file_name, file_path, mime_type,
              file_size, google_drive_web_view_link, last_modified_at,
              local_file_path, downloaded_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (user_id, google_drive_file_id)
            DO UPDATE SET
              file_name = EXCLUDED.file_name,
              file_path = EXCLUDED.file_path,
              mime_type = EXCLUDED.mime_type,
              file_size = EXCLUDED.file_size,
              google_drive_web_view_link = EXCLUDED.google_drive_web_view_link,
              last_modified_at = EXCLUDED.last_modified_at,
              local_file_path = EXCLUDED.local_file_path,
              downloaded_at = EXCLUDED.downloaded_at,
              updated_at = now()
            RETURNING *
          `;

          const values = [
            doc.user_id,
            doc.google_drive_file_id,
            doc.file_name,
            doc.file_path,
            doc.mime_type,
            doc.file_size,
            doc.google_drive_web_view_link,
            doc.last_modified_at,
            doc.local_file_path,
            doc.downloaded_at,
          ];

          const result = await client.query(query, values);
          savedDocuments.push(result.rows[0]);
        }

        await client.query("COMMIT");
        return savedDocuments;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error: any) {
      console.error(
        "[GOOGLE-DRIVE-DOCUMENTS-SERVICE] Error saving documents:",
        error
      );
      throw new Error(`Failed to save documents: ${error.message}`);
    }
  }

  /**
   * Get a document by ID
   */
  async getDocumentById(
    documentId: string
  ): Promise<GoogleDriveDocument | null> {
    try {
      const query = `
        SELECT * FROM public.user_google_documents
        WHERE id = $1
      `;

      const result = await pgPool.query(query, [documentId]);
      return result.rows[0] || null;
    } catch (error: any) {
      console.error(
        "[GOOGLE-DRIVE-DOCUMENTS-SERVICE] Error getting document by ID:",
        error
      );
      throw new Error(`Failed to get document: ${error.message}`);
    }
  }

  /**
   * Get all documents for a user
   */
  async getUserDocuments(
    userId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<{ documents: GoogleDriveDocument[]; total: number }> {
    try {
      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total 
        FROM public.user_google_documents 
        WHERE user_id = $1
      `;
      const countResult = await pgPool.query(countQuery, [userId]);
      const total = parseInt(countResult.rows[0].total);

      // Get documents with pagination
      const query = `
        SELECT * FROM public.user_google_documents 
        WHERE user_id = $1 
        ORDER BY created_at DESC 
        LIMIT $2 OFFSET $3
      `;
      const result = await pgPool.query(query, [userId, limit, offset]);

      return {
        documents: result.rows,
        total,
      };
    } catch (error: any) {
      console.error(
        "[GOOGLE-DRIVE-DOCUMENTS-SERVICE] Error getting user documents:",
        error
      );
      throw new Error(`Failed to get user documents: ${error.message}`);
    }
  }

  /**
   * Get unprocessed documents for a user
   */
  async getUnprocessedDocuments(
    userId: string,
    limit: number = 100
  ): Promise<GoogleDriveDocument[]> {
    try {
      const query = `
        SELECT * FROM public.user_google_documents 
        WHERE user_id = $1 AND processed = false 
        ORDER BY created_at ASC 
        LIMIT $2
      `;
      const result = await pgPool.query(query, [userId, limit]);
      return result.rows;
    } catch (error: any) {
      console.error(
        "[GOOGLE-DRIVE-DOCUMENTS-SERVICE] Error getting unprocessed documents:",
        error
      );
      throw new Error(`Failed to get unprocessed documents: ${error.message}`);
    }
  }

  /**
   * Update document processing status
   */
  async updateProcessingStatus(
    documentId: number,
    status: "pending" | "processing" | "completed" | "failed",
    error?: string
  ): Promise<GoogleDriveDocument> {
    try {
      const query = `
        UPDATE public.user_google_documents 
        SET 
          processed = $2,
          processing_status = $3,
          processing_error = $4,
          updated_at = now()
        WHERE id = $1 
        RETURNING *
      `;

      const processed = status === "completed";
      const values = [documentId, processed, status, error];
      const result = await pgPool.query(query, values);

      if (result.rows.length === 0) {
        throw new Error(`Document with ID ${documentId} not found`);
      }

      return result.rows[0];
    } catch (error: any) {
      console.error(
        "[GOOGLE-DRIVE-DOCUMENTS-SERVICE] Error updating processing status:",
        error
      );
      throw new Error(`Failed to update processing status: ${error.message}`);
    }
  }

  /**
   * Mark document as processed
   */
  async markAsProcessed(
    documentId: number,
    additionalData?: { result?: any; processing_status?: string }
  ): Promise<GoogleDriveDocument> {
    try {
      let query = `
        UPDATE public.user_google_documents 
        SET 
          processed = true,
          processing_status = $2,
          updated_at = now()
      `;

      const values: any[] = [
        documentId,
        additionalData?.processing_status || "completed",
      ];

      // Add result field if provided
      if (additionalData?.result !== undefined) {
        query += `, result = $3`;
        values.push(JSON.stringify(additionalData.result));
      }

      query += ` WHERE id = $1 RETURNING *`;

      const result = await pgPool.query(query, values);

      if (result.rows.length === 0) {
        throw new Error(`Document with ID ${documentId} not found`);
      }

      return result.rows[0];
    } catch (error: any) {
      console.error(
        "[GOOGLE-DRIVE-DOCUMENTS-SERVICE] Error marking document as processed:",
        error
      );
      throw new Error(`Failed to mark document as processed: ${error.message}`);
    }
  }

  /**
   * Mark document as failed
   */
  async markAsFailed(
    documentId: number,
    error: string
  ): Promise<GoogleDriveDocument> {
    return this.updateProcessingStatus(documentId, "failed", error);
  }

  /**
   * Delete a document
   */
  async deleteDocument(documentId: number): Promise<void> {
    try {
      const query = `
        DELETE FROM public.user_google_documents 
        WHERE id = $1
      `;
      await pgPool.query(query, [documentId]);
    } catch (error: any) {
      console.error(
        "[GOOGLE-DRIVE-DOCUMENTS-SERVICE] Error deleting document:",
        error
      );
      throw new Error(`Failed to delete document: ${error.message}`);
    }
  }

  /**
   * Get document statistics for a user
   */
  async getDocumentStats(userId: string): Promise<{
    total: number;
    processed: number;
    unprocessed: number;
    byType: Record<string, number>;
  }> {
    try {
      const query = `
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN processed = true THEN 1 END) as processed,
          COUNT(CASE WHEN processed = false THEN 1 END) as unprocessed,
          mime_type,
          COUNT(*) as type_count
        FROM public.user_google_documents 
        WHERE user_id = $1 
        GROUP BY mime_type
      `;

      const result = await pgPool.query(query, [userId]);

      const byType: Record<string, number> = {};
      let total = 0;
      let processed = 0;
      let unprocessed = 0;

      result.rows.forEach((row) => {
        byType[row.mime_type] = parseInt(row.type_count);
        total += parseInt(row.type_count);
      });

      // Get processed counts
      const processedQuery = `
        SELECT 
          COUNT(CASE WHEN processed = true THEN 1 END) as processed,
          COUNT(CASE WHEN processed = false THEN 1 END) as unprocessed
        FROM public.user_google_documents 
        WHERE user_id = $1
      `;
      const processedResult = await pgPool.query(processedQuery, [userId]);
      processed = parseInt(processedResult.rows[0].processed);
      unprocessed = parseInt(processedResult.rows[0].unprocessed);

      return {
        total,
        processed,
        unprocessed,
        byType,
      };
    } catch (error: any) {
      console.error(
        "[GOOGLE-DRIVE-DOCUMENTS-SERVICE] Error getting document stats:",
        error
      );
      throw new Error(`Failed to get document stats: ${error.message}`);
    }
  }

  /**
   * Sync all documents from Google Drive for a user
   */
  async syncUserDocuments(userId: string): Promise<{
    total: number;
    new: number;
    updated: number;
    errors: string[];
  }> {
    try {
      console.log(
        `[GOOGLE-DRIVE-DOCUMENTS-SERVICE] Starting sync for user: ${userId}`
      );

      // Get all files from Google Drive
      const allFiles = await googleDriveService.getAllFiles(
        userId,
        undefined,
        1000
      );

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

      console.log(
        `[GOOGLE-DRIVE-DOCUMENTS-SERVICE] Found ${documents.length} documents out of ${allFiles.files.length} total files`
      );

      // Download all files to local temp folder
      const { fileManagerService } = await import("./fileManager");
      const { connectedAccountsService } = await import("./connectedAccounts");

      // Get access token for Google Drive
      const connectedAccount =
        await connectedAccountsService.getConnectedAccountByProvider(
          userId,
          "googledrive"
        );

      if (!connectedAccount?.meta?.access_token) {
        throw new Error("No Google Drive access token found");
      }

      // Download files to local storage
      const downloadedFiles = await fileManagerService.downloadAllUserFiles(
        userId,
        connectedAccount.meta.access_token,
        documents.map((file) => ({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
        }))
      );

      console.log(
        `[GOOGLE-DRIVE-DOCUMENTS-SERVICE] Downloaded ${downloadedFiles.length} files to local storage`
      );

      // Convert to DocumentToSave format with local file paths
      const documentsToSave: DocumentToSave[] = documents.map((file) => {
        const downloadedFile = downloadedFiles.find(
          (df) => df.fileId === file.id
        );
        return {
          user_id: userId,
          google_drive_file_id: file.id,
          file_name: file.name,
          file_path: this.buildFilePath(file),
          mime_type: file.mimeType,
          file_size: file.size ? parseInt(file.size) : undefined,
          google_drive_web_view_link: file.webViewLink,
          last_modified_at: file.modifiedTime
            ? new Date(file.modifiedTime)
            : undefined,
          local_file_path: downloadedFile?.localInfo.localPath,
          downloaded_at: downloadedFile?.localInfo.downloadedAt,
        };
      });

      // Save all documents
      const savedDocuments = await this.saveDocuments(documentsToSave);

      console.log(
        `[GOOGLE-DRIVE-DOCUMENTS-SERVICE] Successfully synced ${savedDocuments.length} documents`
      );

      return {
        total: documents.length,
        new: savedDocuments.length,
        updated: 0, // We're using UPSERT, so all are either new or updated
        errors: [],
      };
    } catch (error: any) {
      console.error(
        "[GOOGLE-DRIVE-DOCUMENTS-SERVICE] Error syncing user documents:",
        error
      );
      throw new Error(`Failed to sync user documents: ${error.message}`);
    }
  }

  /**
   * Build file path from Google Drive file
   */
  private buildFilePath(file: any): string {
    // For now, just use the file name
    // In the future, you could build a full path based on folder structure
    return file.name;
  }
}

export const googleDriveDocumentsService =
  GoogleDriveDocumentsService.getInstance();
