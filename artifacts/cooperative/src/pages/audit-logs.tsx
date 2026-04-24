import { useMemo, useState } from "react";
import { useListAuditLogs, getListAuditLogsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@clerk/react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";
import {
  Shield,
  Download,
  Search,
  X,
  AlertTriangle,
  SlidersHorizontal,
  Activity,
} from "lucide-react";

const ENTITY_OPTIONS = [
  "member",
  "loan",
  "transaction",
  "upload",
  "store_purchase",
  "settings",
];

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function actionTone(action: string): string {
  if (action.includes("FAILED") || action.includes("DELETE") || action.includes("REJECT"))
    return "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20";
  if (action.includes("APPROVE") || action.includes("CREATE"))
    return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20";
  if (action.includes("UPDATE") || action.includes("ACTIVATE"))
    return "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20";
  return "bg-muted text-muted-foreground border-border";
}

export function AuditLogsPage() {
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const [search, setSearch] = useState("");
  const [actionQuery, setActionQuery] = useState("");
  const [entity, setEntity] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [exporting, setExporting] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const { getToken } = useAuth();
  const { toast } = useToast();

  const params = useMemo(() => {
    const p: any = { limit, offset };
    if (search.trim()) p.search = search.trim();
    if (actionQuery.trim()) p.action = actionQuery.trim();
    if (entity) p.entity = entity;
    if (dateFrom) p.dateFrom = new Date(dateFrom).toISOString();
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      p.dateTo = end.toISOString();
    }
    return p;
  }, [search, actionQuery, entity, dateFrom, dateTo, offset]);

  const { data: logs, isLoading, error } = useListAuditLogs(params, {
    query: { queryKey: getListAuditLogsQueryKey(params), retry: false },
  });

  const errStatus = (error as any)?.response?.status;
  const isForbidden = errStatus === 403;

  function clearFilters() {
    setSearch("");
    setActionQuery("");
    setEntity("");
    setDateFrom("");
    setDateTo("");
    setOffset(0);
  }

  const activeFilterCount =
    (search ? 1 : 0) +
    (actionQuery ? 1 : 0) +
    (entity ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0);
  const hasFilters = activeFilterCount > 0;

  async function exportCsv() {
    setExporting(true);
    try {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (k === "limit" || k === "offset") return;
        if (v != null && v !== "") qs.append(k, String(v));
      });
      qs.append("format", "csv");
      const token = await getToken();
      const res = await fetch(`${basePath}/api/audit-logs?${qs.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Export complete" });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  if (isForbidden) {
    return (
      <div className="space-y-5 max-w-3xl">
        <div
          className="relative overflow-hidden rounded-3xl p-5 sm:p-6 text-white shadow-xl shadow-primary/20"
          style={{
            background:
              "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(220 80% 35%) 45%, hsl(200 85% 45%) 100%)",
          }}
        >
          <div className="absolute -top-12 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
          <div className="relative">
            <p className="text-xs text-white/80 uppercase tracking-wider font-medium">Audit Logs</p>
            <h1 className="text-xl sm:text-2xl font-bold mt-0.5">Restricted</h1>
          </div>
        </div>
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <AlertTriangle className="w-10 h-10 text-amber-500 mb-3" />
            <p className="font-medium">You don't have permission to view audit logs.</p>
            <p className="text-sm text-muted-foreground mt-1">
              This page is restricted to Financial Auditor and Super Admin roles.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-3xl p-5 sm:p-6 text-white shadow-xl shadow-primary/20"
        style={{
          background:
            "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(220 80% 35%) 45%, hsl(200 85% 45%) 100%)",
        }}
        data-testid="audit-logs-hero"
      >
        <div className="absolute -top-12 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 -left-8 w-56 h-56 rounded-full bg-white/5 blur-3xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs sm:text-sm text-white/80 font-medium uppercase tracking-wider">
              Audit Logs
            </p>
            <h1 className="text-xl sm:text-2xl font-bold mt-0.5 leading-tight">
              System activity
            </h1>
            <p className="text-xs text-white/80 mt-1">
              Every sensitive action is recorded here
            </p>
          </div>
          <Button
            size="sm"
            onClick={exportCsv}
            disabled={exporting}
            className="rounded-full bg-white text-primary hover:bg-white/90 shrink-0 font-semibold shadow-lg"
            data-testid="button-export-audit-csv"
          >
            <Download className="w-4 h-4 mr-1.5" />
            {exporting ? "..." : "CSV"}
          </Button>
        </div>

        {/* Search + filter trigger inside hero */}
        <div className="relative mt-5 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/70" />
            <Input
              placeholder="Search actor or details..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
              className="pl-9 rounded-full bg-white/15 backdrop-blur-sm border-white/20 text-white placeholder:text-white/60 h-10 focus-visible:ring-white/40"
              data-testid="input-audit-search"
            />
          </div>
          <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
            <SheetTrigger asChild>
              <Button
                size="sm"
                className="rounded-full bg-white/15 backdrop-blur-sm border border-white/20 text-white hover:bg-white/25 shrink-0 h-10 px-4"
                data-testid="button-open-audit-filters"
              >
                <SlidersHorizontal className="w-4 h-4 mr-1.5" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-white text-primary text-[10px] font-bold w-5 h-5 inline-flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Filter audit logs</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 py-4">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Action</label>
                  <Input
                    placeholder="e.g. DELETE_MEMBER"
                    value={actionQuery}
                    onChange={(e) => { setActionQuery(e.target.value); setOffset(0); }}
                    className="mt-1.5 rounded-xl"
                    data-testid="input-audit-action"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Entity</label>
                  <Select value={entity || "all"} onValueChange={(v) => { setEntity(v === "all" ? "" : v); setOffset(0); }}>
                    <SelectTrigger className="mt-1.5 rounded-xl" data-testid="select-audit-entity">
                      <SelectValue placeholder="All entities" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All entities</SelectItem>
                      {ENTITY_OPTIONS.map((e) => (
                        <SelectItem key={e} value={e}>{e}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">From</label>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => { setDateFrom(e.target.value); setOffset(0); }}
                      className="mt-1.5 rounded-xl"
                      data-testid="input-audit-from"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">To</label>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => { setDateTo(e.target.value); setOffset(0); }}
                      className="mt-1.5 rounded-xl"
                      data-testid="input-audit-to"
                    />
                  </div>
                </div>
              </div>
              <SheetFooter className="flex-row gap-2 sm:flex-row sm:justify-between">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl"
                  onClick={clearFilters}
                  data-testid="button-clear-audit-filters"
                >
                  <X className="w-4 h-4 mr-1.5" /> Clear all
                </Button>
                <SheetClose asChild>
                  <Button className="flex-1 rounded-xl">Apply</Button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {hasFilters && (
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <span className="text-muted-foreground font-medium">Active filters:</span>
          {search && (
            <button
              onClick={() => { setSearch(""); setOffset(0); }}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-[11px] font-medium hover:bg-primary/15"
            >
              Search: {search}
              <X className="w-3 h-3" />
            </button>
          )}
          {actionQuery && (
            <button
              onClick={() => { setActionQuery(""); setOffset(0); }}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-[11px] font-medium hover:bg-primary/15"
            >
              Action: {actionQuery}
              <X className="w-3 h-3" />
            </button>
          )}
          {entity && (
            <button
              onClick={() => { setEntity(""); setOffset(0); }}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-[11px] font-medium hover:bg-primary/15"
            >
              {entity}
              <X className="w-3 h-3" />
            </button>
          )}
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(""); setDateTo(""); setOffset(0); }}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-[11px] font-medium hover:bg-primary/15"
            >
              {dateFrom || "…"} → {dateTo || "…"}
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
        </div>
      ) : !logs || logs.length === 0 ? (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="text-center py-16 text-muted-foreground">
            <Shield className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No audit logs found</p>
            <p className="text-sm mt-1">
              {hasFilters ? "Try adjusting or clearing your filters." : "Activity will appear here as members and admins use the system."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-2.5">
            {logs.map((log: any) => {
              const actor = log.actorName || "System";
              const initial = actor.charAt(0).toUpperCase();
              return (
                <div
                  key={log.id}
                  className="rounded-2xl border border-border/70 bg-card shadow-sm p-3 sm:p-4 flex items-start gap-3"
                  data-testid={`audit-row-${log.id}`}
                >
                  <div className="w-9 h-9 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                    {log.actorName ? initial : <Activity className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {log.actorName || (
                            <span className="italic text-muted-foreground">System</span>
                          )}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatDate(log.createdAt)}
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono font-semibold border shrink-0 ${actionTone(log.action)}`}
                      >
                        {log.action}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      <span className="font-medium text-foreground">{log.entity}</span>
                      {log.entityId ? ` #${log.entityId}` : ""}
                    </p>
                    {log.details && (
                      <p className="text-[11px] text-muted-foreground mt-1 break-words">
                        {log.details}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
              data-testid="button-audit-prev"
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums">
              {offset + 1} – {offset + logs.length}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              disabled={logs.length < limit}
              onClick={() => setOffset(offset + limit)}
              data-testid="button-audit-next"
            >
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
