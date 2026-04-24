import { db, organizationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const SEED = [
  {
    code: "FAAN",
    name: "Federal Airports Authority of Nigeria",
    description: "Federal Airports Authority of Nigeria staff.",
    excelFormat: "faan" as const,
  },
  {
    code: "NAMA",
    name: "Nigerian Airspace Management Agency",
    description: "Nigerian Airspace Management Agency staff.",
    excelFormat: "nama" as const,
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
