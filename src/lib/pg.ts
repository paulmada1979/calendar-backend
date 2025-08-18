import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // For local dev you can leave this undefined and rely on Docker compose env
  console.warn(
    "DATABASE_URL is not set. Ensure it is provided via environment variables."
  );
}

export const pgPool = new Pool({ connectionString });

// Add event listeners for connection logging
pgPool.on("connect", (client) => {
  console.log(
    `[DATABASE] ${new Date().toISOString()} - New client connected to database`
  );
});

pgPool.on("acquire", (client) => {
  console.log(
    `[DATABASE] ${new Date().toISOString()} - Client acquired from pool`
  );
});

pgPool.on("release", (client) => {
  console.log(
    `[DATABASE] ${new Date().toISOString()} - Client released back to pool`
  );
});

pgPool.on("error", (err, client) => {
  console.error(
    `[DATABASE] ${new Date().toISOString()} - Unexpected error on idle client - Error: ${
      err.message
    }`
  );
});

// Log when the pool is ready
pgPool.on("connect", () => {
  console.log(
    `[DATABASE] ${new Date().toISOString()} - Database connection pool ready`
  );
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log(
    `[DATABASE] ${new Date().toISOString()} - Shutting down database connection pool`
  );
  await pgPool.end();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log(
    `[DATABASE] ${new Date().toISOString()} - Shutting down database connection pool`
  );
  await pgPool.end();
  process.exit(0);
});
