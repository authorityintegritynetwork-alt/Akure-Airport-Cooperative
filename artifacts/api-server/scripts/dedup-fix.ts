/**
 * Deduplication and cross-org false-positive fix.
 *
 * CATEGORY A — Cross-org false positives:
 *   upload.organization != member.organization → delete
 *
 * CATEGORY B — Within-org duplicates:
 *   Same (member, month, year, type) → keep lowest transaction id only
 *
 * Uses self-contained SQL CTEs so no JS arrays need to be passed to Postgres.
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

// CTE that identifies all bad transaction IDs — reused in every step
const BAD_TXNS_CTE = sql`
  cross_org AS (
    SELECT t.id, t.member_id, t.type, t.amount::numeric as amount
    FROM transactions t
    JOIN members m ON m.id = t.member_id
    JOIN upload_records ur ON ur.id = t.upload_record_id
    WHERE ur.organization != m.organization
      AND t.type != 'opening_balance'
  ),
  keepers AS (
    SELECT MIN(t.id) as keep_id
    FROM transactions t
    JOIN members m ON m.id = t.member_id
    JOIN upload_records ur ON ur.id = t.upload_record_id
    WHERE t.type != 'opening_balance'
      AND ur.organization = m.organization
    GROUP BY t.member_id, t.month, t.year, t.type
  ),
  within_dups AS (
    SELECT t.id, t.member_id, t.type, t.amount::numeric as amount
    FROM transactions t
    JOIN members m ON m.id = t.member_id
    JOIN upload_records ur ON ur.id = t.upload_record_id
    WHERE t.type != 'opening_balance'
      AND ur.organization = m.organization
      AND t.id NOT IN (SELECT keep_id FROM keepers)
  ),
  bad_txns AS (
    SELECT * FROM cross_org
    UNION ALL
    SELECT * FROM within_dups
  )
`;

async function main() {
  console.log("=== Dedup Fix ===\n");

  // ── Step 1: Preview scope ─────────────────────────────────────────────────
  const preview = await db.execute<{ category: string; cnt: number }>(sql`
    WITH ${BAD_TXNS_CTE}
    SELECT 'cross_org'   as category, COUNT(*)::int as cnt FROM cross_org
    UNION ALL
    SELECT 'within_dups' as category, COUNT(*)::int as cnt FROM within_dups
  `);
  let total = 0;
  for (const r of preview.rows) {
    console.log(`  ${r.category}: ${r.cnt}`);
    total += r.cnt;
  }
  console.log(`  Total to delete: ${total}\n`);

  if (total === 0) {
    console.log("Nothing to do."); process.exit(0);
  }

  // ── Step 2: Big transaction — reverse balances, delete, recompute ─────────
  await db.transaction(async (tx) => {

    // 2a. Apply balance reversals using CTEs
    const rev = await tx.execute(sql`
      WITH ${BAD_TXNS_CTE},
      deltas AS (
        SELECT
          b.member_id,
          SUM(CASE WHEN b.type = 'savings'                                     THEN -b.amount ELSE 0 END) as d_savings,
          SUM(CASE WHEN b.type = 'shares'                                      THEN -b.amount ELSE 0 END) as d_shares,
          SUM(CASE WHEN b.type = 'christmas'                                   THEN -b.amount ELSE 0 END) as d_christmas,
          SUM(CASE WHEN b.type = 'fire'                                        THEN -b.amount ELSE 0 END) as d_fire_fund,
          SUM(CASE WHEN b.type = 'real_loan_repayment'                         THEN  b.amount ELSE 0 END) as d_real_loan,
          SUM(CASE WHEN b.type = 'emergency_loan_repayment'                    THEN  b.amount ELSE 0 END) as d_emer_loan,
          SUM(CASE WHEN b.type = 'electronics_repayment'                       THEN  b.amount ELSE 0 END) as d_electronics,
          SUM(CASE WHEN b.type = 's_electronics_repayment'                     THEN  b.amount ELSE 0 END) as d_s_electronics,
          SUM(CASE WHEN b.type = 'commodity_repayment'                         THEN  b.amount ELSE 0 END) as d_commodity,
          SUM(CASE WHEN b.type = 'ghl_form_repayment'                          THEN  b.amount ELSE 0 END) as d_ghl,
          SUM(CASE WHEN b.type = 'fuel_venture_repayment'                      THEN  b.amount ELSE 0 END) as d_fuel_venture,
          SUM(CASE WHEN b.type IN ('provident_loan_repayment','provident')     THEN  b.amount ELSE 0 END) as d_provident,
          SUM(CASE WHEN b.type = 'land_loan_repayment'                         THEN  b.amount ELSE 0 END) as d_land_loan
        FROM bad_txns b
        GROUP BY b.member_id
      )
      UPDATE members m SET
        savings_balance        = GREATEST(0, m.savings_balance::numeric        + d.d_savings),
        shares_balance         = GREATEST(0, m.shares_balance::numeric         + d.d_shares),
        christmas_balance      = GREATEST(0, m.christmas_balance::numeric      + d.d_christmas),
        fire_fund_balance      = GREATEST(0, m.fire_fund_balance::numeric      + d.d_fire_fund),
        real_loan_balance      = m.real_loan_balance::numeric                  + d.d_real_loan,
        emergency_loan_balance = GREATEST(0, m.emergency_loan_balance::numeric + d.d_emer_loan),
        electronics_debt       = GREATEST(0, m.electronics_debt::numeric       + d.d_electronics),
        s_electronics_debt     = GREATEST(0, m.s_electronics_debt::numeric     + d.d_s_electronics),
        commodity_debt         = GREATEST(0, m.commodity_debt::numeric         + d.d_commodity),
        ghl_form_debt          = GREATEST(0, m.ghl_form_debt::numeric          + d.d_ghl),
        fuel_venture_balance   = GREATEST(0, m.fuel_venture_balance::numeric   + d.d_fuel_venture),
        provident_balance      = m.provident_balance::numeric                  + d.d_provident,
        land_loan_balance      = GREATEST(0, m.land_loan_balance::numeric      + d.d_land_loan),
        total_loan_balance     = GREATEST(0,
          (m.real_loan_balance::numeric + d.d_real_loan) +
          GREATEST(0, m.emergency_loan_balance::numeric + d.d_emer_loan)),
        total_store_debt       = GREATEST(0,
          GREATEST(0, m.electronics_debt::numeric + d.d_electronics) +
          GREATEST(0, m.s_electronics_debt::numeric + d.d_s_electronics) +
          GREATEST(0, m.commodity_debt::numeric + d.d_commodity) +
          GREATEST(0, m.ghl_form_debt::numeric + d.d_ghl))
      FROM deltas d
      WHERE m.id = d.member_id
    `);
    console.log(`  Balance reversals applied (${(rev as any).rowCount} members updated)`);

    // 2b. Restore outstanding_balance on loans for reversed loan repayments (LIFO per member)
    //     We use a cursor-style approach: fetch affected members, iterate loans
    const loanRestorations = await tx.execute<{
      member_id: number; loan_type: string; restore_amount: string;
    }>(sql`
      WITH ${BAD_TXNS_CTE}
      SELECT
        b.member_id,
        CASE WHEN b.type = 'real_loan_repayment' THEN 'real' ELSE 'emergency' END as loan_type,
        SUM(b.amount)::text as restore_amount
      FROM bad_txns b
      WHERE b.type IN ('real_loan_repayment', 'emergency_loan_repayment')
      GROUP BY b.member_id, loan_type
    `);

    for (const lr of loanRestorations.rows) {
      // Get disbursed loans LIFO
      const loans = await tx.execute<{
        id: number; outstanding_balance: string; total_repayable: string;
      }>(sql`
        SELECT id, outstanding_balance, total_repayable
        FROM loans
        WHERE member_id = ${lr.member_id}
          AND status = 'disbursed'
          AND loan_type = ${lr.loan_type}
        ORDER BY disbursed_at DESC NULLS LAST, id DESC
      `);
      let remaining = parseFloat(lr.restore_amount);
      for (const loan of loans.rows) {
        if (remaining <= 0) break;
        const maxRestore = Math.max(
          0,
          parseFloat(loan.total_repayable) - parseFloat(loan.outstanding_balance),
        );
        const restore = Math.min(maxRestore, remaining);
        if (restore > 0) {
          await tx.execute(sql`
            UPDATE loans SET outstanding_balance = LEAST(
              ${loan.total_repayable}::numeric,
              outstanding_balance::numeric + ${restore.toString()}::numeric
            ) WHERE id = ${loan.id}
          `);
          remaining -= restore;
        }
      }
    }
    console.log(`  Loan records restored for ${loanRestorations.rows.length} member-loantype pairs`);

    // 2c. Delete bad transactions
    const del = await tx.execute(sql`
      WITH ${BAD_TXNS_CTE}
      DELETE FROM transactions WHERE id IN (SELECT id FROM bad_txns)
    `);
    console.log(`  Deleted ${(del as any).rowCount} transactions`);

    // 2d. Recompute derived fields for all members (catch any edge cases)
    await tx.execute(sql`
      UPDATE members SET
        total_loan_balance = GREATEST(0, real_loan_balance::numeric + emergency_loan_balance::numeric),
        total_store_debt   = GREATEST(0,
          electronics_debt::numeric + s_electronics_debt::numeric +
          commodity_debt::numeric   + ghl_form_debt::numeric)
    `);
    console.log("  Derived fields recomputed (all members)");
  });

  // ── Step 3: Refresh upload record member counts ───────────────────────────
  await db.execute(sql`
    UPDATE upload_records ur SET
      rows_processed = (
        SELECT COUNT(DISTINCT t.member_id)
        FROM transactions t
        WHERE t.upload_record_id = ur.id
      )
    WHERE ur.status = 'processed'
  `);
  console.log("  Upload record counts refreshed");

  // ── Step 4: Final verification ───────────────────────────────────────────
  console.log("\n=== Verification ===");
  const checks = await db.execute<{ label: string; count: number }>(sql`
    SELECT 'negative_savings'      as label, COUNT(*)::int FROM members WHERE savings_balance::numeric      < -0.01
    UNION ALL
    SELECT 'negative_christmas',           COUNT(*)::int FROM members WHERE christmas_balance::numeric     < -0.01
    UNION ALL
    SELECT 'total_loan_mismatch',          COUNT(*)::int FROM members
      WHERE ABS(total_loan_balance::numeric - real_loan_balance::numeric - emergency_loan_balance::numeric) > 0.01
    UNION ALL
    SELECT 'total_store_mismatch',         COUNT(*)::int FROM members
      WHERE ABS(total_store_debt::numeric - electronics_debt::numeric - s_electronics_debt::numeric - commodity_debt::numeric - ghl_form_debt::numeric) > 0.01
    UNION ALL
    SELECT 'remaining_dup_groups',         COUNT(*)::int FROM (
      SELECT member_id, month, year, type FROM transactions
      WHERE type != 'opening_balance'
      GROUP BY member_id, month, year, type HAVING COUNT(*) > 1
    ) d
  `);
  for (const c of checks.rows) {
    const ok = c.count === 0;
    console.log(`  ${ok ? "✓" : "✗"} ${c.label}: ${c.count}`);
  }

  // Final upload record summary
  console.log("\n=== Upload records ===");
  const records = await db.execute<{ id: number; org: string; month: string; year: number; processed: number; status: string }>(sql`
    SELECT id, organization as org, month, year, rows_processed as processed, status
    FROM upload_records
    ORDER BY year,
      CASE month WHEN 'November' THEN 11 WHEN 'December' THEN 12
        WHEN 'January' THEN 1 WHEN 'February' THEN 2
        WHEN 'March' THEN 3 WHEN 'April' THEN 4 ELSE 0 END,
      organization
  `);
  records.rows.forEach(r =>
    console.log(`  #${r.id} ${r.org} ${r.month} ${r.year}: ${r.processed} members [${r.status}]`),
  );

  console.log("\n=== Done ===");
  process.exit(0);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
