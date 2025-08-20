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
pgPool.on("error", (err, client) => {
  console.error(`Database error: ${err.message}`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  await pgPool.end();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await pgPool.end();
  process.exit(0);
});
