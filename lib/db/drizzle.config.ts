import { defineConfig } from "drizzle-kit";
import path from "path";

const url =
  process.env.PRODUCTION_DATABASE_URL ||
  process.env.DATABASE_URL;

if (!url) {
  throw new Error("No database URL found. Set DATABASE_URL (dev) or PRODUCTION_DATABASE_URL (prod).");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  out: path.join(__dirname, "./migrations"),
  dialect: "postgresql",
  dbCredentials: { url },
});
