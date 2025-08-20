import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";

import { authRouter } from "./routes/auth";
import { calendarRouter } from "./routes/calendar";
import userPreferencesRouter from "./routes/userPreferences";

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

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Test logging endpoint
app.get("/test-logging", (_req, res) => {
  console.log(
    `[TEST] ${new Date().toISOString()} - Test logging endpoint called`
  );
  console.log(
    `[TEST] ${new Date().toISOString()} - Environment: ${
      process.env.NODE_ENV || "development"
    }`
  );
  console.log(
    `[TEST] ${new Date().toISOString()} - Log level: ${
      process.env.LOG_LEVEL || "INFO"
    }`
  );

  res.json({
    message: "Logging test completed",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    logLevel: process.env.LOG_LEVEL || "INFO",
  });
});

// Log all requests to console
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use("/auth", authRouter);
app.use("/calendar", calendarRouter);
app.use("/user", userPreferencesRouter);

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
  console.log(
    `[404] ${new Date().toISOString()} - ${req.method} ${req.url} - Not Found`
  );
  res.status(404).json({ error: "Not Found" });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(
    `[INFO] ${new Date().toISOString()} - Calendar backend listening on http://localhost:${port}`
  );
  console.log(`[INFO] Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(
    `[INFO] Morgan logging enabled with ${
      process.env.NODE_ENV === "development" ? "custom" : "combined"
    } format`
  );
  console.log(
    `[INFO] Test logging endpoint available at: http://localhost:${port}/test-logging`
  );
});
