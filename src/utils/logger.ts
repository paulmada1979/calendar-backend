// Simple logger utility for consistent logging across the application
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

class Logger {
  private level: LogLevel;

  constructor() {
    // Set log level from environment variable, default to INFO
    const envLevel = process.env.LOG_LEVEL?.toUpperCase();
    this.level = envLevel
      ? LogLevel[envLevel as keyof typeof LogLevel] || LogLevel.INFO
      : LogLevel.INFO;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const baseMessage = `[${level}] ${timestamp} - ${message}`;

    if (data) {
      return `${baseMessage} - ${
        typeof data === "object" ? JSON.stringify(data) : data
      }`;
    }

    return baseMessage;
  }

  debug(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.formatMessage("DEBUG", message, data));
    }
  }

  info(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.formatMessage("INFO", message, data));
    }
  }

  warn(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage("WARN", message, data));
    }
  }

  error(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage("ERROR", message, data));
    }
  }

  // Method to log HTTP requests with timing
  logRequest(
    method: string,
    url: string,
    statusCode: number,
    responseTime: number,
    userAgent?: string
  ): void {
    this.info(`HTTP ${method} ${url} - ${statusCode} - ${responseTime}ms`, {
      userAgent,
    });
  }

  // Method to log authentication events
  logAuth(
    userId: string,
    action: string,
    success: boolean,
    details?: any
  ): void {
    const level = success ? LogLevel.INFO : LogLevel.WARN;
    const message = `Authentication ${action} for user: ${userId} - ${
      success ? "SUCCESS" : "FAILED"
    }`;

    if (level === LogLevel.INFO) {
      this.info(message, details);
    } else {
      this.warn(message, details);
    }
  }

  // Method to log database operations
  logDatabase(
    operation: string,
    table: string,
    duration: number,
    success: boolean,
    details?: any
  ): void {
    const level = success ? LogLevel.INFO : LogLevel.ERROR;
    const message = `Database ${operation} on ${table} - ${
      success ? "SUCCESS" : "FAILED"
    } - ${duration}ms`;

    if (level === LogLevel.INFO) {
      this.info(message, details);
    } else {
      this.error(message, details);
    }
  }

  // Method to log Google API calls
  logGoogleAPI(
    operation: string,
    duration: number,
    success: boolean,
    details?: any
  ): void {
    const level = success ? LogLevel.INFO : LogLevel.ERROR;
    const message = `Google API ${operation} - ${
      success ? "SUCCESS" : "FAILED"
    } - ${duration}ms`;

    if (level === LogLevel.INFO) {
      this.info(message, details);
    } else {
      this.error(message, details);
    }
  }
}

export const logger = new Logger();
