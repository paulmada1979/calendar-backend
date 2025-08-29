import { googleDriveDocumentsService } from "./googleDriveDocuments";
import { logger } from "../utils/logger";

export interface LangflowFlowResult {
  success: boolean;
  result?: any;
  error?: string;
  documentId: string;
}

export class LangflowService {
  private apiUrl: string;
  private apiKey: string;
  private flowId: string;

  constructor() {
    this.apiUrl =
      process.env.LANGFLOW_API_URL || "https://editor.ai-did-it.com";
    this.apiKey =
      process.env.LANGFLOW_API_KEY ||
      "sk-ErkhYlPLOx9Kut2bodEsd1FjHZ2z_UydVZLW9M_Ofg8";

    if (!this.apiKey) {
      throw new Error("Langflow API Key is required");
    }

    this.flowId =
      process.env.LANGFLOW_FLOW_ID || "5942de6b-31fd-4f5b-aef5-45dce5e4d253";
  }

  /**
   * Process a single document by uploading it to Langflow and running the flow
   */
  async processDocument(documentId: string): Promise<LangflowFlowResult> {
    try {
      logger.info(
        `[LANGFLOW-SERVICE] Starting to process document: ${documentId}`
      );

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
        `[LANGFLOW-SERVICE] Read local file: ${document.local_file_path} (${fileBuffer.length} bytes)`
      );

      // Upload file to Langflow
      const uploadResult = await this.uploadFileToLangflow(
        fileBuffer,
        document.file_name
      );

      if (!uploadResult.success) {
        throw new Error(`File upload failed: ${uploadResult.error}`);
      }

      // Run the Langflow flow
      if (!uploadResult.fileId) {
        throw new Error("No file ID returned from upload");
      }

      const flowResult = await this.runLangflowFlow(uploadResult.fileId);

      if (!flowResult.success) {
        throw new Error(`Flow execution failed: ${flowResult.error}`);
      }

      // Mark document as processed
      await googleDriveDocumentsService.markAsProcessed(Number(documentId), {
        result: flowResult.result,
        processing_status: "completed",
      });

      // Delete local file after successful processing
      if (document.local_file_path) {
        const { fileManagerService } = await import("./fileManager");
        fileManagerService.deleteFile(document.local_file_path);
        logger.info(
          `[LANGFLOW-SERVICE] Deleted local file after processing: ${document.local_file_path}`
        );
      }

      logger.info(
        `[LANGFLOW-SERVICE] Successfully processed document: ${documentId}`
      );

      return {
        success: true,
        result: flowResult.result,
        documentId,
      };
    } catch (error: any) {
      logger.error(
        `[LANGFLOW-SERVICE] Error processing document ${documentId}:`,
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
   * Upload file to Langflow
   */
  private async uploadFileToLangflow(
    fileBuffer: Buffer,
    fileName: string
  ): Promise<{ success: boolean; fileId?: string; error?: string }> {
    try {
      logger.info(`[LANGFLOW-SERVICE] Uploading file to Langflow: ${fileName}`);

      // 1. Prepare the form data with the file to upload
      const data = new FormData();
      // Convert Buffer to Uint8Array for Blob constructor
      const uint8Array = new Uint8Array(fileBuffer);
      data.append("file", new Blob([uint8Array]), fileName);

      const headers = {
        "x-api-key": this.apiKey,
      };

      // 2. Upload the file to Langflow
      const uploadRes = await fetch(`${this.apiUrl}/api/v2/files/`, {
        method: "POST",
        headers,
        body: data,
      });

      if (!uploadRes.ok) {
        const errorText = await uploadRes.text();
        throw new Error(
          `File upload failed: ${uploadRes.status} ${uploadRes.statusText} - ${errorText}`
        );
      }

      const uploadData = await uploadRes.json();
      const uploadedPath = uploadData.path;

      logger.info(
        `[LANGFLOW-SERVICE] File uploaded successfully to Langflow: ${uploadedPath}`
      );

      return {
        success: true,
        fileId: uploadedPath,
      };
    } catch (error: any) {
      logger.error(
        `[LANGFLOW-SERVICE] Error uploading file to Langflow:`,
        error
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Run the Langflow flow with the uploaded file
   */
  private async runLangflowFlow(
    fileId: string
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    try {
      logger.info(`[LANGFLOW-SERVICE] Running Langflow flow: ${this.flowId}`);

      // 3. Call the Langflow run endpoint with the uploaded file path
      const payload = {
        input_value: "Analyze this file",
        output_type: "chat",
        input_type: "text",
        tweaks: {
          "DoclingInline-eltbj": {
            path: fileId,
          },
        },
      };

      const runRes = await fetch(`${this.apiUrl}/api/v1/run/${this.flowId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify(payload),
      });

      if (!runRes.ok) {
        const errorText = await runRes.text();
        throw new Error(
          `Flow execution failed: ${runRes.status} ${runRes.statusText} - ${errorText}`
        );
      }

      const langflowData = await runRes.json();

      // Extract the message from the response
      const message =
        langflowData.outputs?.[0]?.outputs?.[0]?.results?.message?.data?.text;

      const result = {
        flowId: this.flowId,
        fileId: fileId,
        status: "completed",
        message: message || "No message returned",
        fullResponse: langflowData,
      };

      logger.info(
        `[LANGFLOW-SERVICE] Flow executed successfully with message: ${message}`
      );

      return {
        success: true,
        result: result,
      };
    } catch (error: any) {
      logger.error(`[LANGFLOW-SERVICE] Error running Langflow flow:`, error);
      return {
        success: false,
        error: error.message,
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
        `[LANGFLOW-SERVICE] Starting to process all unprocessed documents`
      );

      // Get all unprocessed documents from all users
      // We need to query the database directly since we want to process documents from all users
      const { pgPool } = await import("../lib/pg");

      const query = `
        SELECT * FROM public.user_google_documents 
        WHERE processed = false 
        ORDER BY created_at ASC 
        LIMIT 100
      `;

      logger.info(`[LANGFLOW-SERVICE] Executing query: ${query}`);
      const result = await pgPool.query(query);
      const unprocessedDocs = result.rows;

      logger.info(
        `[LANGFLOW-SERVICE] Database query returned ${unprocessedDocs.length} rows`
      );

      // Log first few documents for debugging
      if (unprocessedDocs.length > 0) {
        logger.info(
          `[LANGFLOW-SERVICE] Sample documents:`,
          unprocessedDocs.slice(0, 3).map((doc) => ({
            id: doc.id,
            file_name: doc.file_name,
            processed: doc.processed,
            processing_status: doc.processing_status,
          }))
        );
      }

      if (unprocessedDocs.length === 0) {
        logger.info(`[LANGFLOW-SERVICE] No unprocessed documents found`);
        return { total: 0, processed: 0, failed: 0 };
      }

      logger.info(
        `[LANGFLOW-SERVICE] Found ${unprocessedDocs.length} unprocessed documents`
      );

      let processed = 0;
      let failed = 0;

      // Process documents one by one to avoid overwhelming the system
      for (const doc of unprocessedDocs) {
        try {
          logger.info(
            `[LANGFLOW-SERVICE] Processing document: ${doc.id} (${doc.file_name})`
          );

          const result = await this.processDocument(doc.id.toString());
          if (result.success) {
            processed++;
            logger.info(
              `[LANGFLOW-SERVICE] Document ${doc.id} processed successfully`
            );
          } else {
            failed++;
            logger.error(
              `[LANGFLOW-SERVICE] Document ${doc.id} failed: ${result.error}`
            );
          }

          // Add a small delay between processing to be respectful to APIs
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error: any) {
          logger.error(
            `[LANGFLOW-SERVICE] Error processing document ${doc.id}:`,
            error
          );
          failed++;
        }
      }

      logger.info(
        `[LANGFLOW-SERVICE] Processing completed. Processed: ${processed}, Failed: ${failed}`
      );

      return {
        total: unprocessedDocs.length,
        processed,
        failed,
      };
    } catch (error: any) {
      logger.error(
        `[LANGFLOW-SERVICE] Error processing unprocessed documents:`,
        error
      );
      throw error;
    }
  }
}

export const langflowService = new LangflowService();
