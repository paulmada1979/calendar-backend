import { googleDriveDocumentsService } from "./googleDriveDocuments";
import { logger } from "../utils/logger";

export interface LangExtractResult {
  success: boolean;
  result?: any;
  error?: string;
  documentId: string;
}

export class LangExtractService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.LANGEXTRACT_BASE_URL || "";

    if (!this.baseUrl) {
      throw new Error("LANGEXTRACT_BASE_URL is required");
    }
  }

  /**
   * Test connectivity to LangExtract API
   */
  async testConnectivity(): Promise<{ success: boolean; error?: string }> {
    try {
      logger.info(
        `[LANGEXTRACT-SERVICE] Testing connectivity to: ${this.baseUrl}`
      );

      const response = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(10000), // 10 second timeout for health check
      });

      if (response.ok) {
        logger.info(`[LANGEXTRACT-SERVICE] Connectivity test successful`);
        return { success: true };
      } else {
        logger.warn(
          `[LANGEXTRACT-SERVICE] Health check returned status: ${response.status}`
        );
        return {
          success: false,
          error: `Health check failed with status: ${response.status}`,
        };
      }
    } catch (error: any) {
      logger.error(`[LANGEXTRACT-SERVICE] Connectivity test failed:`, error);

      let errorMessage = error.message;
      if (error.name === "AbortError") {
        errorMessage =
          "Health check timeout - LangExtract API did not respond within 10 seconds";
      } else if (error.message.includes("fetch failed")) {
        errorMessage = `Network error - Cannot connect to LangExtract API at ${this.baseUrl}`;
      } else if (
        error.message.includes("ENOTFOUND") ||
        error.message.includes("ECONNREFUSED")
      ) {
        errorMessage = `Connection error - LangExtract API at ${this.baseUrl} is not reachable`;
      }

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Process a single document by uploading it to LangExtract API
   */
  async processDocument(documentId: string): Promise<LangExtractResult> {
    try {
      logger.info(
        `[LANGEXTRACT-SERVICE] Starting to process document: ${documentId}`
      );

      // Test connectivity before processing
      const connectivityTest = await this.testConnectivity();
      if (!connectivityTest.success) {
        throw new Error(
          `LangExtract API connectivity test failed: ${connectivityTest.error}`
        );
      }

      // Get document details from database
      const document = await googleDriveDocumentsService.getDocumentById(
        documentId
      );
      if (!document) {
        throw new Error(`Document not found: ${documentId}`);
      }

      // Update status to processing
      await googleDriveDocumentsService.updateProcessingStatus(
        Number(documentId),
        "processing"
      );

      // Check if local file exists
      if (!document.local_file_path) {
        throw new Error("No local file path found for document");
      }

      const { fileManagerService } = await import("./fileManager");

      if (!fileManagerService.fileExists(document.local_file_path)) {
        throw new Error(`Local file not found: ${document.local_file_path}`);
      }

      // Read file from local storage
      const { readFileSync } = await import("fs");
      const fileBuffer = readFileSync(document.local_file_path);

      logger.info(
        `[LANGEXTRACT-SERVICE] Read local file: ${document.local_file_path} (${fileBuffer.length} bytes)`
      );

      // Upload file to LangExtract API
      const uploadResult = await this.uploadFileToLangExtract(
        fileBuffer,
        document.file_name,
        document.user_id
      );

      if (!uploadResult.success) {
        throw new Error(`File upload failed: ${uploadResult.error}`);
      }

      // Mark document as processed
      await googleDriveDocumentsService.markAsProcessed(Number(documentId), {
        result: uploadResult.result,
        processing_status: "completed",
      });

      // Delete local file after successful processing
      if (document.local_file_path) {
        const { fileManagerService } = await import("./fileManager");
        fileManagerService.deleteFile(document.local_file_path);
        logger.info(
          `[LANGEXTRACT-SERVICE] Deleted local file after processing: ${document.local_file_path}`
        );
      }

      logger.info(
        `[LANGEXTRACT-SERVICE] Successfully processed document: ${documentId}`
      );

      return {
        success: true,
        result: uploadResult.result,
        documentId,
      };
    } catch (error: any) {
      logger.error(
        `[LANGEXTRACT-SERVICE] Error processing document ${documentId}:`,
        error
      );

      // Mark document as failed
      await googleDriveDocumentsService.markAsFailed(
        Number(documentId),
        error.message
      );

      return {
        success: false,
        error: error.message,
        documentId,
      };
    }
  }

  /**
   * Upload file to LangExtract API
   */
  private async uploadFileToLangExtract(
    fileBuffer: Buffer,
    fileName: string,
    userId: string
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    try {
      logger.info(
        `[LANGEXTRACT-SERVICE] Uploading file to LangExtract: ${fileName} (${fileBuffer.length} bytes)`
      );

      // Prepare the form data with the file to upload
      const data = new FormData();
      // Convert Buffer to Uint8Array for Blob constructor
      const uint8Array = new Uint8Array(fileBuffer);
      data.append("file", new Blob([uint8Array]), fileName);
      data.append("userId", userId);

      // Add additional parameters for better PDF processing
      data.append("enable_docling", "true"); // Enable Docling for PDF processing

      // Get file extension to determine processing options
      const fileExtension = fileName.split(".").pop()?.toLowerCase();
      const isPdf = fileExtension === "pdf";

      data.append(
        "processing_options",
        JSON.stringify({
          extractText: true,
          analyzeStructure: true,
          enableDocling: isPdf, // Only enable Docling for PDFs
          schemaValidation: false, // Disable strict schema validation for now
          fileType: fileExtension,
          autoDetectSchema: true, // Let the system auto-detect the schema
          skipSchemaValidation: true, // Skip schema validation to avoid refund_case errors
        })
      );

      // Log the processing options being sent
      logger.info(
        `[LANGEXTRACT-SERVICE] Processing options for ${fileName}: enableDocling=${isPdf}, fileType=${fileExtension}`
      );

      // Upload the file to LangExtract API
      const uploadUrl = `${this.baseUrl}/api/document/documents/upload/`;
      logger.info(`[LANGEXTRACT-SERVICE] Uploading to URL: ${uploadUrl}`);

      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        body: data,
        // Add timeout and better error handling
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      if (!uploadRes.ok) {
        const errorText = await uploadRes.text();
        throw new Error(
          `File upload failed: ${uploadRes.status} ${uploadRes.statusText} - ${errorText}`
        );
      }

      const uploadData = await uploadRes.json();

      logger.info(
        `[LANGEXTRACT-SERVICE] File uploaded successfully to LangExtract: ${fileName}`
      );

      return {
        success: true,
        result: uploadData,
      };
    } catch (error: any) {
      logger.error(
        `[LANGEXTRACT-SERVICE] Error uploading file to LangExtract:`,
        error
      );

      // Provide more specific error messages
      let errorMessage = error.message;
      if (error.name === "AbortError") {
        errorMessage =
          "Upload timeout - LangExtract API did not respond within 30 seconds";
      } else if (error.message.includes("fetch failed")) {
        errorMessage = `Network error - Cannot connect to LangExtract API at ${this.baseUrl}. Please check if the service is running and accessible.`;
      } else if (
        error.message.includes("ENOTFOUND") ||
        error.message.includes("ECONNREFUSED")
      ) {
        errorMessage = `Connection error - LangExtract API at ${this.baseUrl} is not reachable. Please verify the LANGEXTRACT_BASE_URL environment variable.`;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Process all unprocessed documents
   */
  async processAllUnprocessedDocuments(): Promise<{
    total: number;
    processed: number;
    failed: number;
  }> {
    try {
      logger.info(
        `[LANGEXTRACT-SERVICE] Starting to process all unprocessed documents`
      );

      // Get all unprocessed documents from all users
      // We need to query the database directly since we want to process documents from all users
      const { pgPool } = await import("../lib/pg");

      const query = `
        SELECT * FROM public.user_google_documents 
        WHERE processed = false AND processing_status = 'pending'
        ORDER BY created_at ASC 
        LIMIT 1
      `;

      logger.info(`[LANGEXTRACT-SERVICE] Executing query: ${query}`);
      const result = await pgPool.query(query);
      const unprocessedDocs = result.rows;

      logger.info(
        `[LANGEXTRACT-SERVICE] Database query returned ${unprocessedDocs.length} rows`
      );

      // Log first few documents for debugging
      if (unprocessedDocs.length > 0) {
        logger.info(
          `[LANGEXTRACT-SERVICE] Sample documents:`,
          unprocessedDocs.slice(0, 3).map((doc) => ({
            id: doc.id,
            file_name: doc.file_name,
            processed: doc.processed,
            processing_status: doc.processing_status,
          }))
        );
      }

      if (unprocessedDocs.length === 0) {
        logger.info(`[LANGEXTRACT-SERVICE] No unprocessed documents found`);
        return { total: 0, processed: 0, failed: 0 };
      }

      logger.info(
        `[LANGEXTRACT-SERVICE] Found ${unprocessedDocs.length} unprocessed documents`
      );

      let processed = 0;
      let failed = 0;

      // Process documents one by one to avoid overwhelming the system
      for (const doc of unprocessedDocs) {
        try {
          logger.info(
            `[LANGEXTRACT-SERVICE] Processing document: ${doc.id} (${doc.file_name})`
          );

          const result = await this.processDocument(doc.id.toString());
          if (result.success) {
            processed++;
            logger.info(
              `[LANGEXTRACT-SERVICE] Document ${doc.id} processed successfully`
            );
          } else {
            failed++;
            logger.error(
              `[LANGEXTRACT-SERVICE] Document ${doc.id} failed: ${result.error}`
            );
          }

          // Add a small delay between processing to be respectful to APIs
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error: any) {
          logger.error(
            `[LANGEXTRACT-SERVICE] Error processing document ${doc.id}:`,
            error
          );
          failed++;
        }
      }

      logger.info(
        `[LANGEXTRACT-SERVICE] Processing completed. Processed: ${processed}, Failed: ${failed}`
      );

      return {
        total: unprocessedDocs.length,
        processed,
        failed,
      };
    } catch (error: any) {
      logger.error(
        `[LANGEXTRACT-SERVICE] Error processing unprocessed documents:`,
        error
      );
      throw error;
    }
  }
}

export const langExtractService = new LangExtractService();
