import { defineConfig } from "drizzle-kit";
import path from "path";

const url =
  process.env.NODE_ENV === "production"
    ? process.env.PRODUCTION_DATABASE_URL
    : process.env.DATABASE_URL;

if (!url) {
  throw new Error("No database URL found. Set DATABASE_URL (dev) or PRODUCTION_DATABASE_URL (prod).");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: { url },
});
