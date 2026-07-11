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

// Walk the error cause chain looking for a Postgres "relation already exists" (42P07).
function hasAlreadyExists(e: any, depth = 0): boolean {
  if (!e || depth > 5) return false;
  if (e?.code === "42P07") return true;
  if (String(e?.message ?? "").includes("already exists")) return true;
  return hasAlreadyExists(e?.cause, depth + 1);
}

/**
 * Records ONLY migration 0000 (the initial schema) in the Drizzle tracking
 * table when the database was set up via `drizzle-kit push` with no tracking
 * table. Incremental migrations (0001+) are left un-recorded so that the
 * subsequent `migrate()` call actually executes their SQL.
 */
async function seedInitialBaseline(migrationsFolder: string) {
  // Drizzle tracks migrations in the "drizzle" schema, NOT "public".
  // We must create the schema and table there, or migrate() will never find them.
  await db.execute(sql.raw(`CREATE SCHEMA IF NOT EXISTS "drizzle"`));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id serial PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `));

  const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));

  // Only record the very first migration (idx 0). Later migrations will be
  // applied by the migrate() retry below so their SQL actually runs.
  const first = journal.entries.find((e: any) => e.idx === 0);
  if (!first) return;

  const filePath = path.join(migrationsFolder, `${first.tag}.sql`);
  const content = fs.readFileSync(filePath, "utf-8");
  const hash = crypto.createHash("sha256").update(content).digest("hex");

  await db.execute(
    sql`INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at)
        SELECT ${hash}, ${first.when}
        WHERE NOT EXISTS (
          SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE hash = ${hash}
        )`
  );
}

async function runMigrations(migrationsFolder: string) {
  try {
    await migrate(db, { migrationsFolder });
    logger.info("Database migrations applied");
  } catch (err: any) {
    if (!hasAlreadyExists(err)) {
      logger.error({ err }, "Database migration failed — check DATABASE_URL");
      process.exit(1);
    }

    // Tables already exist from a previous drizzle-kit push with no tracking.
    // Seed only the baseline (0000) then retry so incremental migrations run.
    logger.warn(
      "Schema already present — recording baseline and applying incremental migrations"
    );

    try {
      await seedInitialBaseline(migrationsFolder);
    } catch (seedErr) {
      logger.error({ err: seedErr }, "Failed to record migration baseline");
      process.exit(1);
    }

    // Retry: 0000 is now marked applied; any pending migrations (0001+) will run.
    try {
      await migrate(db, { migrationsFolder });
      logger.info("Incremental migrations applied");
    } catch (retryErr: any) {
      logger.error({ err: retryErr }, "Incremental migration failed");
      process.exit(1);
    }
  }
}

async function bootstrap() {
  // __dirname is injected by the esbuild banner (resolves to dist/ at runtime).
  // Migration files live at lib/db/migrations/ relative to the workspace root.
  const migrationsFolder = path.resolve(__dirname, "../../../lib/db/migrations");

  await runMigrations(migrationsFolder);

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
