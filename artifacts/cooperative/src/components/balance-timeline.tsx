import React from "react";
import type {
  MemberBalanceTimeline,
  MemberBalanceColumns,
  ColumnHistory,
  TimelineLoanEvent,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import {
  ChevronDown,
  ChevronUp,
  Printer,
  AlertTriangle,
  CreditCard,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(v: number) {
  return formatCurrency(v);
}

type ColKey = keyof MemberBalanceColumns;

const SAVINGS_COLS: ColKey[] = ["savings", "christmas", "shares", "fire"];

const LOAN_COLS: ColKey[] = [
  "realLoan",
  "provident",
  "emergencyLoan",
  "electronics",
  "sElectronics",
  "furniture",
  "fuelVenture",
  "commodity",
  "ghlForm",
  "landLoan",
];

const COL_LABELS: Record<ColKey, string> = {
  savings:      "Savings",
  christmas:    "Christmas Savings",
  shares:       "Share Capital",
  realLoan:     "Real Loan",
  provident:    "Provident Loan",
  emergencyLoan:"Emergency Loan",
  electronics:  "Electronics Loan",
  sElectronics: "Land / Electronics",
  furniture:    "Furniture Loan",
  fuelVenture:  "Fuel & Venture",
  commodity:    "Commodity Loan",
  fire:         "Fire Fund",
  ghlForm:      "GHL Form",
  landLoan:     "Land Loan",
};

// ── ColumnCard ─────────────────────────────────────────────────────────────

function ColumnCard({
  colKey,
  history,
  isSavings,
  forceExpand,
}: {
  colKey: ColKey;
  history: ColumnHistory;
  isSavings: boolean;
  forceExpand: boolean;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const show = expanded || forceExpand;

  const totalRepaid = history.months.reduce((s, m) => s + m.amount, 0);
  // For savings: show live balance from members table.
  // For loans: show cumulative total repaid from monthly uploads.
  const displayBalance = isSavings ? history.current : totalRepaid;

  const hasData = history.ob > 0 || history.months.length > 0;
  if (!hasData) return null;

  return (
    <div className="border border-border rounded-xl p-4 flex flex-col gap-2 print:break-inside-avoid">
      {/* header row */}
      <div className="flex items-start justify-between gap-1">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide leading-tight">
          {COL_LABELS[colKey]}
        </p>
        <button
          className="print:hidden text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={show}
          aria-label={show ? "Hide history" : "Show history"}
        >
          {show ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* main figure */}
      <div>
        <p
          className={cn(
            "text-xl font-bold font-mono tabular-nums",
            isSavings
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-amber-700 dark:text-amber-400",
          )}
        >
          {fmt(displayBalance)}
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {isSavings ? "Current Balance" : "Total Repaid"}
        </p>
      </div>

      {/* history — controlled on screen, always shown when printing */}
      <div className={cn("mt-0.5 print:block", show ? "block" : "hidden")}>
        {history.ob > 0 && (
          <div className="flex justify-between items-baseline text-xs py-1 border-t border-border/40">
            <span className="text-muted-foreground">
              {isSavings ? "Opening Balance" : "Opening (owed)"}
            </span>
            <span className="font-mono text-muted-foreground">{fmt(history.ob)}</span>
          </div>
        )}

        {history.months.map((m) => (
          <div
            key={`${m.year}-${m.month}`}
            className="flex justify-between items-baseline text-xs py-1 border-t border-border/30"
          >
            <span className="text-muted-foreground">{m.label}</span>
            <span
              className={cn(
                "font-mono tabular-nums",
                isSavings
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-amber-700 dark:text-amber-400",
              )}
            >
              {isSavings ? "+" : "−"}
              {fmt(m.amount)}
            </span>
          </div>
        ))}

        {history.months.length === 0 && (
          <p className="text-[11px] text-muted-foreground pt-1.5">
            No monthly uploads recorded yet.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Loan disbursement card ─────────────────────────────────────────────────

function LoanEventCard({ event }: { event: TimelineLoanEvent }) {
  const dateStr = event.disbursedAt
    ? new Date(event.disbursedAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  const typeLabel =
    event.loanType === "emergency"
      ? "Emergency Loan"
      : event.loanType === "provident"
        ? "Provident Loan"
        : "Real Loan";

  return (
    <div className="border border-violet-200 dark:border-violet-800 rounded-xl p-4 bg-violet-500/5 print:break-inside-avoid">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-[11px] font-semibold text-violet-700 dark:text-violet-300 uppercase tracking-wide">
            {typeLabel} Disbursed
          </p>
          {dateStr && (
            <p className="text-xs text-muted-foreground mt-0.5">{dateStr}</p>
          )}
        </div>
        <CreditCard className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
      </div>

      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Principal</span>
          <span className="font-mono font-semibold">{fmt(event.amount)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total Repayable</span>
          <span className="font-mono">{fmt(event.totalRepayable)}</span>
        </div>
        {event.monthlyRepayment > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Monthly Payment</span>
            <span className="font-mono">{fmt(event.monthlyRepayment)}</span>
          </div>
        )}
        {event.tenureMonths > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tenure</span>
            <span>{event.tenureMonths} months</span>
          </div>
        )}
        {event.purpose && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground shrink-0">Purpose</span>
            <span className="text-right">{event.purpose}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-violet-200/50 dark:border-violet-800/50 pt-1.5 mt-0.5">
          <span className="text-muted-foreground">Outstanding</span>
          <span className="font-mono font-semibold text-amber-700 dark:text-amber-400">
            {fmt(event.outstandingBalance)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Section header ─────────────────────────────────────────────────────────

function SectionHeader({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mt-6 mb-3 first:mt-0">
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <h3 className="text-sm font-semibold text-foreground shrink-0">{children}</h3>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────

interface BalanceTimelineProps {
  timeline: MemberBalanceTimeline;
  className?: string;
}

export function BalanceTimeline({ timeline, className }: BalanceTimelineProps) {
  const [forceExpand, setForceExpand] = React.useState(false);

  const activeSavings = SAVINGS_COLS.filter(
    (k) => timeline.columns[k].ob > 0 || timeline.columns[k].months.length > 0,
  );
  const activeLoans = LOAN_COLS.filter(
    (k) => timeline.columns[k].ob > 0 || timeline.columns[k].months.length > 0,
  );
  const isEmpty = activeSavings.length === 0 && activeLoans.length === 0;

  const handlePrint = () => {
    setForceExpand(true);
    setTimeout(() => window.print(), 150);
  };

  return (
    <div className={className}>
      {/* Print-only header */}
      <div className="hidden print:block mb-6 pb-4 border-b border-border">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
          Akure Airport Staff Cooperative Multipurpose Society Limited
        </p>
        <h2 className="text-lg font-bold">Account Statement</h2>
        <p className="text-sm font-medium mt-0.5">{timeline.fullName}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Generated:{" "}
          {new Date().toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-2 mb-5 print:hidden">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-7 px-2 gap-1"
          onClick={() => setForceExpand((v) => !v)}
        >
          {forceExpand ? (
            <>
              <ChevronUp className="w-3 h-3" /> Collapse all
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" /> Expand all
            </>
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7 gap-1.5"
          onClick={handlePrint}
        >
          <Printer className="w-3 h-3" />
          Print / Save PDF
        </Button>
      </div>

      {/* No OB warning */}
      {!timeline.hasOb && (
        <div className="flex items-center gap-2 mb-4 text-sm text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 bg-amber-500/5">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          No opening balance on file — historical values start from ₦0.
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="text-sm text-muted-foreground text-center py-10">
          No balance data on record for this member yet.
        </div>
      )}

      {/* Loan disbursement events */}
      {timeline.loanEvents.length > 0 && (
        <>
          <SectionHeader icon={<CreditCard className="w-4 h-4" />}>
            Loan Disbursements
          </SectionHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
            {timeline.loanEvents.map((e) => (
              <LoanEventCard key={e.id} event={e} />
            ))}
          </div>
        </>
      )}

      {/* Savings accounts */}
      {activeSavings.length > 0 && (
        <>
          <SectionHeader icon={<TrendingUp className="w-4 h-4" />}>
            Savings Accounts
          </SectionHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {activeSavings.map((k) => (
              <ColumnCard
                key={k}
                colKey={k}
                history={timeline.columns[k]}
                isSavings={true}
                forceExpand={forceExpand}
              />
            ))}
          </div>
        </>
      )}

      {/* Loan repayments */}
      {activeLoans.length > 0 && (
        <>
          <SectionHeader icon={<CreditCard className="w-4 h-4" />}>
            Loan Repayments
          </SectionHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {activeLoans.map((k) => (
              <ColumnCard
                key={k}
                colKey={k}
                history={timeline.columns[k]}
                isSavings={false}
                forceExpand={forceExpand}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
