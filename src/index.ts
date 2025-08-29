import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import { authRouter } from "./routes/auth";
import { calendarRouter } from "./routes/calendar";
import userPreferencesRouter from "./routes/userPreferences";
import socialMediaRouter from "./routes/socialMedia";
import { cronjobService } from "./services/cronjob";

const app = express();

// Morgan logging middleware
// Use combined format for production-like logging
app.use(morgan("combined"));

// Custom format for detailed logging in development
if (process.env.NODE_ENV === "development") {
  // Create a custom token for request body size
  morgan.token("req-body-size", (req: any) => {
    if (req.body) {
      return JSON.stringify(req.body).length.toString();
    }
    return "0";
  });

  // Create a custom token for response body size
  morgan.token("res-body-size", (res: any) => {
    if (res.body) {
      return JSON.stringify(res.body).length.toString();
    }
    return "0";
  });

  // Use custom format for development
  app.use(
    morgan(
      ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time ms :req-body-size :res-body-size'
    )
  );
}

app.use(
  cors({ origin: process.env.APP_URL?.split(",") || "*", credentials: true })
);
app.use(express.json());
app.use(cookieParser());

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Test authentication endpoint
app.get("/test-auth", (req, res) => {
  const authHeader = req.headers.authorization;
  const cookies = req.cookies;
  const userId = req.headers["x-user-id"];

  res.json({
    message: "Authentication test endpoint",
    authHeader: authHeader ? "Present" : "Missing",
    cookies: cookies ? Object.keys(cookies) : "No cookies",
    xUserId: userId || "Missing",
    timestamp: new Date().toISOString(),
  });
});

// Test Composio configuration endpoint
app.get("/test-composio", async (req, res) => {
  const composioApiKey = process.env.COMPOSIO_API_KEY;
  const composioBaseUrl = process.env.COMPOSIO_BASE_URL;

  // Import the service to get status
  const { composioService } = await import("./services/composio");

  res.json({
    message: "Composio configuration test",
    hasApiKey: !!composioApiKey,
    apiKeyLength: composioApiKey ? composioApiKey.length : 0,
    baseUrl: composioBaseUrl || "Not set",
    nodeEnv: process.env.NODE_ENV || "Not set",
    sdkStatus: composioService.getStatus(),
    timestamp: new Date().toISOString(),
  });
});

// Test database connection and table existence
app.get("/test-db", async (req, res) => {
  try {
    const { pgPool } = await import("./lib/pg");

    // Test basic connection
    const result = await pgPool.query("SELECT NOW() as current_time");

    // Test if connected_accounts table exists
    let tableExists = false;
    try {
      await pgPool.query("SELECT 1 FROM connected_accounts LIMIT 1");
      tableExists = true;
    } catch (tableError) {
      tableExists = false;
    }

    res.json({
      message: "Database connection test",
      database: {
        connected: true,
        currentTime: result.rows[0]?.current_time,
        connectedAccountsTable: tableExists ? "Exists" : "Missing",
      },
    });
  } catch (error: any) {
    res.status(500).json({
      message: "Database connection test failed",
      error: error.message,
    });
  }
});

// Test logging endpoint
app.get("/test-logging", (_req, res) => {
  res.json({
    message: "Logging test completed",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    logLevel: process.env.LOG_LEVEL || "INFO",
  });
});

app.use("/auth", authRouter);
app.use("/calendar", calendarRouter);
app.use("/user", userPreferencesRouter);
app.use("/social", socialMediaRouter);

// Error handling middleware
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error(`[ERROR] ${new Date().toISOString()} - ${err.message}`);
    console.error(err.stack);
    res.status(500).json({ error: "Internal Server Error" });
  }
);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not Found" });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  // Server started successfully
  console.log(`Server is running on port ${port}`);

  // Start the cronjob service for processing Google Drive documents
  try {
    cronjobService.start();
    console.log("✅ Cronjob service started successfully");
  } catch (error: any) {
    console.error("❌ Failed to start cronjob service:", error.message);
  }
});
