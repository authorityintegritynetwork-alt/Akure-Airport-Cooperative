import { db, organizationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const SEED = [
  {
    code: "FAAN",
    name: "Federal Airports Authority of Nigeria",
    description: "Federal Airports Authority of Nigeria staff.",
  },
  {
    code: "NAMA",
    name: "Nigerian Airspace Management Agency",
    description: "Nigerian Airspace Management Agency staff.",
  },
  {
    code: "NIMET",
    name: "Nigerian Meteorological Agency",
    description: "Nigerian Meteorological Agency staff.",
  },
  {
    code: "NCAA",
    name: "Nigerian Civil Aviation Authority",
    description: "Nigerian Civil Aviation Authority staff.",
  },
];

export async function seedOrganizations(): Promise<void> {
  for (const o of SEED) {
    const [existing] = await db
      .select()
      .from(organizationsTable)
      .where(eq(organizationsTable.code, o.code));
    if (!existing) {
      await db.insert(organizationsTable).values(o);
    }
  }
}
