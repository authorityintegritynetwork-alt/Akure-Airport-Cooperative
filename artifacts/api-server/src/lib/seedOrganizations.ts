import { db, organizationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const SEED = [
  {
    code: "FAAN",
    name: "Federal Airports Authority of Nigeria",
    description: "Federal Airports Authority of Nigeria staff.",
    excelFormat: "faan",
  },
  {
    code: "NAMA",
    name: "Nigerian Airspace Management Agency",
    description: "Nigerian Airspace Management Agency staff.",
    excelFormat: "nama",
  },
  {
    code: "NIMET",
    name: "Nigerian Meteorological Agency",
    description: "Nigerian Meteorological Agency staff.",
    excelFormat: "faan",
  },
  {
    code: "NCAA",
    name: "Nigerian Civil Aviation Authority",
    description: "Nigerian Civil Aviation Authority staff.",
    excelFormat: "faan",
  },
  {
    code: "PENSIONERS",
    name: "Pensioners",
    description: "Retired members on the pension payroll (code 005511 CTAKR).",
    excelFormat: "faan",
  },
  {
    code: "NON_STAFF",
    name: "Non-Staff",
    description: "Members outside payroll; payments recorded manually by the admin.",
    excelFormat: "faan",
  },
  {
    code: "COOPERATIVE_STAFF",
    name: "Cooperative Staff",
    description: "Employees of the cooperative itself (secretary, accountant, etc.) who are members but do not appear on any employer's payroll sheet. Deductions are recorded manually by the admin.",
    excelFormat: "none",
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
