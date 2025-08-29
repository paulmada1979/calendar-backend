import * as cron from "node-cron";
import { langflowService } from "./langflow";
import { logger } from "../utils/logger";

export class CronjobService {
  private isRunning: boolean = false;
  private cronJob: cron.ScheduledTask | null = null;
  private cronPattern: string;

  constructor() {
    // Get cron pattern from environment variable, fallback to every 5 minutes
    this.cronPattern = process.env.CRONJOB_PATTERN || "*/5 * * * *";
  }

  /**
   * Start the cronjob service
   */
  start(): void {
    if (this.isRunning) {
      logger.info("[CRONJOB-SERVICE] Service is already running");
      return;
    }

    try {
      // Schedule job using pattern from environment variable
      this.cronJob = cron.schedule(
        this.cronPattern,
        async () => {
          await this.processUnprocessedDocuments();
        },
        {
          timezone: "UTC",
        }
      );

      // Start the cronjob
      this.cronJob.start();
      this.isRunning = true;

      logger.info("[CRONJOB-SERVICE] Cronjob service started successfully");
      logger.info(
        `[CRONJOB-SERVICE] Will process unprocessed documents using pattern: ${this.cronPattern}`
      );
    } catch (error: any) {
      logger.error("[CRONJOB-SERVICE] Failed to start cronjob service:", error);
      throw error;
    }
  }

  /**
   * Stop the cronjob service
   */
  stop(): void {
    if (!this.isRunning || !this.cronJob) {
      logger.info("[CRONJOB-SERVICE] Service is not running");
      return;
    }

    try {
      this.cronJob.stop();
      this.cronJob = null;
      this.isRunning = false;

      logger.info("[CRONJOB-SERVICE] Cronjob service stopped successfully");
    } catch (error: any) {
      logger.error("[CRONJOB-SERVICE] Failed to stop cronjob service:", error);
      throw error;
    }
  }

  /**
   * Process all unprocessed documents
   */
  private async processUnprocessedDocuments(): Promise<void> {
    try {
      logger.info(
        "[CRONJOB-SERVICE] Starting scheduled processing of unprocessed documents..."
      );

      const result = await langflowService.processAllUnprocessedDocuments();

      logger.info(
        `[CRONJOB-SERVICE] Processing completed. Total: ${result.total}, Processed: ${result.processed}, Failed: ${result.failed}`
      );
    } catch (error: any) {
      logger.error(
        "[CRONJOB-SERVICE] Error during scheduled processing:",
        error
      );
    }
  }

  /**
   * Get service status
   */
  getStatus(): { isRunning: boolean; nextRun?: Date; cronPattern: string } {
    if (!this.cronJob || !this.isRunning) {
      return { isRunning: false, cronPattern: this.cronPattern };
    }

    // Get next run time (this is approximate since node-cron doesn't expose this directly)
    // For now, we'll return a placeholder since we can't easily calculate next run from cron pattern
    const now = new Date();
    let nextRun: Date | undefined;

    // Simple calculation for common patterns
    if (this.cronPattern === "*/5 * * * *") {
      nextRun = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes from now
    } else if (this.cronPattern === "*/10 * * * *") {
      nextRun = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes from now
    } else if (this.cronPattern === "0 * * * *") {
      nextRun = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
    } else if (this.cronPattern === "0 0 * * *") {
      nextRun = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 1 day from now
    }

    return {
      isRunning: true,
      nextRun,
      cronPattern: this.cronPattern,
    };
  }

  /**
   * Manually trigger processing (useful for testing)
   */
  async triggerProcessing(): Promise<void> {
    try {
      logger.info("[CRONJOB-SERVICE] Manual processing triggered");
      await this.processUnprocessedDocuments();
    } catch (error: any) {
      logger.error("[CRONJOB-SERVICE] Error during manual processing:", error);
      throw error;
    }
  }
}

export const cronjobService = new CronjobService();
