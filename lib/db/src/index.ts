import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString =
  process.env.PRODUCTION_DATABASE_URL ||
  process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "No database URL found. Set DATABASE_URL (dev) or PRODUCTION_DATABASE_URL (prod).",
  );
}

export const pool = new Pool({
  connectionString,
  // Fail fast when the DB is unreachable instead of hanging forever.
  connectionTimeoutMillis: 5_000,   // give up acquiring a connection after 5s
  idleTimeoutMillis: 30_000,        // release idle connections after 30s
  max: 10,                          // cap pool size (Koyeb free tier limits)
  // Kill runaway queries server-side after 30 s.
  // Passed as a per-session SET on every new connection.
  statement_timeout: 30_000,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
