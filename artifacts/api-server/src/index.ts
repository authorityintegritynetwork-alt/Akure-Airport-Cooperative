import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import app from "./app";
import { logger } from "./lib/logger";
import { seedOrganizations } from "./lib/seedOrganizations";
import { seedLoanProducts } from "./lib/seedLoanProducts";
import { db } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/**
 * If the database was previously set up via `drizzle-kit push` (no migration
 * tracking table exists), create the `__drizzle_migrations` table and record
 * all existing migration files as already applied.  This lets future schema
 * changes be applied incrementally without re-running the baseline.
 */
async function seedMigrationBaseline(migrationsFolder: string) {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id serial PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `));

  const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));

  for (const entry of journal.entries) {
    const filePath = path.join(migrationsFolder, `${entry.tag}.sql`);
    const content = fs.readFileSync(filePath, "utf-8");
    const hash = crypto.createHash("sha256").update(content).digest("hex");

    await db.execute(
      sql`INSERT INTO "__drizzle_migrations" (hash, created_at)
          SELECT ${hash}, ${entry.when}
          WHERE NOT EXISTS (
            SELECT 1 FROM "__drizzle_migrations" WHERE hash = ${hash}
          )`
    );
  }
}

async function bootstrap() {
  // __dirname is injected by the esbuild banner (resolves to dist/ at runtime).
  // Migration files live at lib/db/migrations/ in the workspace root.
  const migrationsFolder = path.resolve(__dirname, "../../../lib/db/migrations");

  // Apply pending SQL migrations on every startup. Safe to run repeatedly —
  // Drizzle tracks applied files in __drizzle_migrations and skips them.
  try {
    await migrate(db, { migrationsFolder });
    logger.info("Database migrations applied");
  } catch (err: any) {
    // Drizzle wraps the pg error: the "42P07 already exists" code/message
    // may be on err, err.cause, or err.cause.cause — walk the chain.
    function hasAlreadyExists(e: any, depth = 0): boolean {
      if (!e || depth > 5) return false;
      if (e?.code === "42P07") return true;
      if (String(e?.message ?? "").includes("already exists")) return true;
      return hasAlreadyExists(e?.cause, depth + 1);
    }

    if (hasAlreadyExists(err)) {
      // Database was set up via drizzle-kit push — no migration history yet.
      // Record the baseline so future incremental migrations work correctly.
      logger.warn(
        "Schema already present (push-based setup) — recording migration baseline"
      );
      try {
        await seedMigrationBaseline(migrationsFolder);
        logger.info("Migration baseline recorded successfully");
      } catch (seedErr) {
        logger.error({ err: seedErr }, "Failed to record migration baseline");
        process.exit(1);
      }
    } else {
      logger.error({ err }, "Database migration failed — check DATABASE_URL");
      process.exit(1);
    }
  }

  try {
    await seedOrganizations();
    await seedLoanProducts();
  } catch (err) {
    logger.error({ err }, "Failed to seed on startup");
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

void bootstrap();
