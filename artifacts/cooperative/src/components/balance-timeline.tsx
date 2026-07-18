import React, { useState } from "react";
import type {
  MemberBalanceTimeline,
  BalanceTimelineDetail,
  TimelineLoanEvent,
  BalanceTimelinePeriod,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import {
  Flag,
  CircleDot,
  CreditCard,
  ChevronDown,
  ChevronUp,
  Printer,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(v: number) {
  return formatCurrency(v);
}

function DetailRow({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "credit" | "debit" | "neutral";
}) {
  if (value === 0) return null;
  return (
    <div className="flex justify-between text-xs py-[3px]">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-mono tabular-nums",
          tone === "credit" && "text-emerald-700 dark:text-emerald-400",
          tone === "debit" && "text-amber-700 dark:text-amber-400",
        )}
      >
        {fmt(value)}
      </span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 pt-2 pb-0.5">
      {children}
    </p>
  );
}

function DetailBreakdown({ detail }: { detail: BalanceTimelineDetail }) {
  const hasLoans =
    detail.realLoan > 0 ||
    detail.emergencyLoan > 0 ||
    detail.provident > 0 ||
    detail.fuelVenture > 0 ||
    detail.landLoan > 0;
  const hasStore =
    detail.electronics > 0 ||
    detail.sElectronics > 0 ||
    detail.furniture > 0 ||
    detail.commodity > 0 ||
    detail.ghlForm > 0;

  return (
    <div className="mt-1.5 border-t border-border/50 pt-1">
      <SectionLabel>Savings &amp; Contributions</SectionLabel>
      <DetailRow label="Savings" value={detail.savings} tone="credit" />
      <DetailRow label="Share Capital" value={detail.shares} tone="credit" />
      <DetailRow label="Christmas Savings" value={detail.christmas} tone="credit" />
      <DetailRow label="Fire Fund" value={detail.fire} tone="credit" />

      {hasLoans && (
        <>
          <SectionLabel>Outstanding Loans</SectionLabel>
          <DetailRow label="Real Loan" value={detail.realLoan} tone="debit" />
          <DetailRow label="Emergency Loan" value={detail.emergencyLoan} tone="debit" />
          <DetailRow label="Provident Loan" value={detail.provident} tone="debit" />
          <DetailRow label="Fuel Venture" value={detail.fuelVenture} tone="debit" />
          <DetailRow label="Land Loan" value={detail.landLoan} tone="debit" />
        </>
      )}

      {hasStore && (
        <>
          <SectionLabel>Store Debt</SectionLabel>
          <DetailRow label="Electronics" value={detail.electronics} tone="debit" />
          <DetailRow label="Staff Electronics" value={detail.sElectronics} tone="debit" />
          <DetailRow label="Furniture" value={detail.furniture} tone="debit" />
          <DetailRow label="Commodity" value={detail.commodity} tone="debit" />
          <DetailRow label="GHL Form" value={detail.ghlForm} tone="debit" />
        </>
      )}
    </div>
  );
}

function SnapshotSummary({
  savings,
  loan,
  store,
}: {
  savings: number;
  loan: number;
  store: number;
}) {
  return (
    <div className="flex gap-4 flex-wrap mt-1.5 text-xs">
      <span>
        <span className="text-muted-foreground">Savings: </span>
        <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
          {fmt(savings)}
        </span>
      </span>
      {loan > 0 && (
        <span>
          <span className="text-muted-foreground">Loans: </span>
          <span className="font-mono font-semibold text-amber-700 dark:text-amber-400">
            {fmt(loan)}
          </span>
        </span>
      )}
      {store > 0 && (
        <span>
          <span className="text-muted-foreground">Store: </span>
          <span className="font-mono font-semibold text-sky-700 dark:text-sky-400">
            {fmt(store)}
          </span>
        </span>
      )}
    </div>
  );
}

// ── timeline dot ──────────────────────────────────────────────────────────────

function TimelineDot({
  icon,
  color,
}: {
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div
      className={cn(
        "absolute -left-6 top-0.5 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center",
        color,
      )}
    >
      {icon}
    </div>
  );
}

// ── node components ───────────────────────────────────────────────────────────

function OpeningNode({
  opening,
  openingDetail,
  hasOb,
}: {
  opening: { savings: number; loan: number; store: number };
  openingDetail: BalanceTimelineDetail;
  hasOb: boolean;
}) {
  return (
    <div className="relative mb-6" data-testid="timeline-opening">
      <TimelineDot
        icon={<Flag className="w-2 h-2 text-primary" />}
        color="bg-primary/15 border-primary"
      />
      <p className="text-sm font-semibold">Opening Balance</p>
      {!hasOb && (
        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-amber-700 dark:text-amber-400">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          No opening balance on file — values below are ₦0
        </div>
      )}
      <SnapshotSummary {...opening} />
      <DetailBreakdown detail={openingDetail} />
    </div>
  );
}

function LoanEventNode({ event }: { event: TimelineLoanEvent }) {
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
        : event.productName ?? "Real Loan";

  return (
    <div className="relative mb-6" data-testid={`timeline-loan-${event.id}`}>
      <TimelineDot
        icon={<CreditCard className="w-2 h-2 text-violet-600" />}
        color="bg-violet-500/15 border-violet-500"
      />
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm font-semibold">{typeLabel} Disbursed</p>
        {dateStr && (
          <span className="text-xs text-muted-foreground">{dateStr}</span>
        )}
      </div>
      <div className="mt-2 border border-border/50 rounded-xl p-3 bg-violet-500/5 text-xs space-y-1.5">
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
        <div className="flex justify-between border-t border-border/40 pt-1.5 mt-1">
          <span className="text-muted-foreground">Outstanding Balance</span>
          <span className="font-mono font-semibold text-amber-700 dark:text-amber-400">
            {fmt(event.outstandingBalance)}
          </span>
        </div>
      </div>
    </div>
  );
}

function PeriodNode({
  period,
  expanded,
  onToggle,
}: {
  period: BalanceTimelinePeriod;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="relative mb-5"
      data-testid={`timeline-period-${period.year}-${period.month}`}
    >
      <TimelineDot icon={null} color="bg-muted border-muted-foreground/40" />

      <button
        className="w-full text-left"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold">{period.label}</p>
          <span className="text-muted-foreground mt-0.5 print:hidden shrink-0">
            {expanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </span>
        </div>

        <div className="flex gap-1.5 flex-wrap mt-1">
          {period.savingsAdded > 0 && (
            <Badge
              variant="outline"
              className="rounded-full text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
            >
              +{fmt(period.savingsAdded)} saved
            </Badge>
          )}
          {period.loanRepaid > 0 && (
            <Badge
              variant="outline"
              className="rounded-full text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20"
            >
              −{fmt(period.loanRepaid)} loan
            </Badge>
          )}
          {period.storeRepaid > 0 && (
            <Badge
              variant="outline"
              className="rounded-full text-[10px] bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20"
            >
              −{fmt(period.storeRepaid)} store
            </Badge>
          )}
        </div>
      </button>

      {/* Detail — visible when expanded on screen; always visible when printing */}
      <div className={cn("mt-2 print:block", expanded ? "block" : "hidden")}>
        <div className="border border-border/50 rounded-xl overflow-hidden">
          {period.items.map((item) => (
            <div
              key={item.label}
              className="flex justify-between text-xs px-3 py-1.5 odd:bg-muted/30"
            >
              <span className="text-muted-foreground">{item.label}</span>
              <span
                className={cn(
                  "font-mono tabular-nums",
                  item.direction === "credit"
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-amber-700 dark:text-amber-400",
                )}
              >
                {item.direction === "credit" ? "+" : "−"}
                {fmt(item.amount)}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          After this month:{" "}
          <span className="text-emerald-700 dark:text-emerald-400 font-mono">
            {fmt(period.running.savings)}
          </span>{" "}
          savings
          {period.running.loan > 0 && (
            <>
              {" · "}
              <span className="text-amber-700 dark:text-amber-400 font-mono">
                {fmt(period.running.loan)}
              </span>{" "}
              loans
            </>
          )}
          {period.running.store > 0 && (
            <>
              {" · "}
              <span className="text-sky-700 dark:text-sky-400 font-mono">
                {fmt(period.running.store)}
              </span>{" "}
              store
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function CurrentNode({
  current,
  currentDetail,
}: {
  current: { savings: number; loan: number; store: number };
  currentDetail: BalanceTimelineDetail;
}) {
  return (
    <div className="relative" data-testid="timeline-current">
      <TimelineDot
        icon={<CircleDot className="w-2 h-2 text-emerald-600" />}
        color="bg-emerald-500/15 border-emerald-500"
      />
      <p className="text-sm font-semibold">Current Balance</p>
      <SnapshotSummary {...current} />
      <DetailBreakdown detail={currentDetail} />
    </div>
  );
}

// ── main exported component ───────────────────────────────────────────────────

interface BalanceTimelineProps {
  timeline: MemberBalanceTimeline;
  className?: string;
}

export function BalanceTimeline({ timeline, className }: BalanceTimelineProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (label: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });

  const allExpanded =
    timeline.periods.length > 0 &&
    timeline.periods.every((p) => expanded.has(p.label));

  const expandAll = () =>
    setExpanded(new Set(timeline.periods.map((p) => p.label)));
  const collapseAll = () => setExpanded(new Set());

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

      {/* Controls (hidden when printing) */}
      {timeline.periods.length > 0 && (
        <div className="flex items-center justify-between gap-2 mb-4 print:hidden">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7 px-2 gap-1"
            onClick={allExpanded ? collapseAll : expandAll}
          >
            {allExpanded ? (
              <><ChevronUp className="w-3 h-3" /> Collapse all months</>
            ) : (
              <><ChevronDown className="w-3 h-3" /> Expand all months</>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7 gap-1.5"
            onClick={() => {
              expandAll();
              // small delay so React re-renders before the print dialog opens
              setTimeout(() => window.print(), 120);
            }}
          >
            <Printer className="w-3 h-3" />
            Print / Save PDF
          </Button>
        </div>
      )}

      {/* Timeline track */}
      <div className="relative pl-6">
        {/* vertical connector line */}
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

        <OpeningNode
          opening={timeline.opening}
          openingDetail={timeline.openingDetail}
          hasOb={timeline.hasOb}
        />

        {timeline.loanEvents.map((event) => (
          <LoanEventNode key={event.id} event={event} />
        ))}

        {timeline.periods.length === 0 ? (
          <div className="relative mb-5 text-xs text-muted-foreground">
            No monthly deduction uploads recorded yet.
          </div>
        ) : (
          timeline.periods.map((p) => (
            <PeriodNode
              key={p.label}
              period={p}
              expanded={expanded.has(p.label)}
              onToggle={() => toggle(p.label)}
            />
          ))
        )}

        <CurrentNode
          current={timeline.current}
          currentDetail={timeline.currentDetail}
        />
      </div>
    </div>
  );
}
