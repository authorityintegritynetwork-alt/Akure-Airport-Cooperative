import { db, loanProductsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const SEED = [
  {
    code: "regular",
    name: "Regular Loan",
    description: "Long-term general-purpose loan.",
    interestRate: "10",
    defaultTenureMonths: 18,
    maxTenureMonths: 24,
    sortOrder: 1,
  },
  {
    code: "electronics",
    name: "Electronics Loan",
    description: "For electronics and household appliances.",
    interestRate: "10",
    defaultTenureMonths: 8,
    maxTenureMonths: 8,
    sortOrder: 2,
  },
  {
    code: "commercial",
    name: "Commercial Loan",
    description: "Short-term commercial / business loan.",
    interestRate: "5",
    defaultTenureMonths: 3,
    maxTenureMonths: 3,
    sortOrder: 3,
  },
  {
    code: "emergency",
    name: "Emergency Loan",
    description: "Quick relief for urgent personal needs.",
    interestRate: "5",
    defaultTenureMonths: 4,
    maxTenureMonths: 4,
    sortOrder: 4,
  },
  {
    code: "fuel_venture",
    name: "Fuel Venture",
    description: "One-month fuel advance.",
    interestRate: "5",
    defaultTenureMonths: 1,
    maxTenureMonths: 1,
    sortOrder: 5,
  },
  {
    code: "provision",
    name: "Provision",
    description: "Interest-free food provision advance, repaid in the next salary.",
    interestRate: "0",
    defaultTenureMonths: 1,
    maxTenureMonths: 1,
    sortOrder: 6,
  },
];

export async function seedLoanProducts(): Promise<void> {
  for (const p of SEED) {
    const [existing] = await db
      .select()
      .from(loanProductsTable)
      .where(eq(loanProductsTable.code, p.code));
    if (!existing) {
      await db.insert(loanProductsTable).values(p);
    }
  }
}
