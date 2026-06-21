import { useMemo } from "react";
import { useListUploadHistory } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { CalendarRange, FileSpreadsheet, CheckCircle2, Circle } from "lucide-react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function UploadedMonthsPage() {
  const { data: history, isLoading } = useListUploadHistory();

  const { coverage, years, sorted } = useMemo(() => {
    const records = history ?? [];
    const covered = new Set<string>();
    for (const r of records) {
      covered.add(`${r.year}-${r.month.toLowerCase()}`);
    }
    const yearSet = new Set<number>(records.map((r) => r.year));
    const yrs = Array.from(yearSet).sort((a, b) => b - a);
    const srt = [...records].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return (
        MONTHS.indexOf(b.month) - MONTHS.indexOf(a.month)
      );
    });
    return { coverage: covered, years: yrs, sorted: srt };
  }, [history]);

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-3xl p-5 sm:p-6 text-white shadow-xl shadow-primary/20"
        style={{
          background:
            "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(220 80% 35%) 45%, hsl(200 85% 45%) 100%)",
        }}
        data-testid="uploaded-months-hero"
      >
        <div className="absolute -top-12 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 -left-8 w-56 h-56 rounded-full bg-white/5 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="rounded-2xl bg-white/15 p-2.5 backdrop-blur-sm border border-white/20">
            <CalendarRange className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs sm:text-sm text-white/80 font-medium uppercase tracking-wider">
              Deduction Uploads
            </p>
            <h1 className="text-xl sm:text-2xl font-bold mt-0.5 leading-tight">
              Uploaded Months Overview
            </h1>
            <p className="text-xs text-white/80 mt-1">
              See every uploaded month at a glance and spot any that are missing.
            </p>
          </div>
        </div>
      </div>

      {/* Coverage grid */}
      <Card className="rounded-2xl shadow-sm border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarRange className="w-4 h-4" />
            Coverage
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Filled cells were uploaded; faint cells are missing for that year.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full rounded-xl" />
          ) : years.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              No deduction uploads yet.
            </div>
          ) : (
            <div className="space-y-4 overflow-x-auto">
              {years.map((yr) => (
                <div key={yr} data-testid={`coverage-year-${yr}`}>
                  <p className="text-sm font-semibold mb-2">{yr}</p>
                  <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5 min-w-[420px]">
                    {MONTHS.map((m) => {
                      const has = coverage.has(`${yr}-${m.toLowerCase()}`);
                      return (
                        <div
                          key={m}
                          title={`${m} ${yr}${has ? " — uploaded" : " — missing"}`}
                          className={`rounded-lg px-1 py-2 text-center text-[10px] font-semibold border ${
                            has
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                              : "bg-muted/40 text-muted-foreground/50 border-dashed border-border"
                          }`}
                          data-testid={`coverage-cell-${yr}-${m.toLowerCase()}`}
                        >
                          {m.slice(0, 3)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detailed list */}
      <Card className="rounded-2xl shadow-sm border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            All Uploads ({sorted.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2.5">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              No deduction uploads recorded.
            </div>
          ) : (
            <div className="space-y-2.5">
              {sorted.map((record) => (
                <div
                  key={record.id}
                  className="rounded-xl border border-border/70 p-4 flex items-start gap-3"
                  data-testid={`uploaded-month-row-${record.id}`}
                >
                  <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                    {record.status === "processed" ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <Circle className="w-5 h-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">
                          {record.month} {record.year}
                        </p>
                        {record.organization && (
                          <Badge variant="outline" className="rounded-full text-[10px]">
                            {record.organization}
                          </Badge>
                        )}
                      </div>
                      <Badge
                        variant="outline"
                        className={`rounded-full text-[10px] shrink-0 ${
                          record.status === "processed"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {record.status}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      By {record.uploaderName} · {formatDate(record.createdAt)}
                    </p>
                    <div className="flex gap-3 mt-2 text-[11px]">
                      <span className="text-muted-foreground">
                        <span className="font-bold text-foreground tabular-nums">
                          {record.rowsProcessed}
                        </span>{" "}
                        processed
                      </span>
                      {record.rowsSkipped > 0 && (
                        <span className="text-destructive">
                          <span className="font-bold tabular-nums">
                            {record.rowsSkipped}
                          </span>{" "}
                          skipped
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
