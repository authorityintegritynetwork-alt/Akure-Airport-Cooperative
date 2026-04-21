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
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";
import { Shield, Download, Search, X, AlertTriangle } from "lucide-react";

const ENTITY_OPTIONS = [
  "member",
  "loan",
  "transaction",
  "upload",
  "store_purchase",
  "settings",
];

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function AuditLogsPage() {
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const [search, setSearch] = useState("");
  const [actionQuery, setActionQuery] = useState("");
  const [entity, setEntity] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [exporting, setExporting] = useState(false);
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

  const hasFilters = search || actionQuery || entity || dateFrom || dateTo;

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
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Audit Logs</h1>
        </div>
        <Card>
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
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Audit Logs</h1>
        </div>
        <Button
          variant="outline"
          onClick={exportCsv}
          disabled={exporting}
          data-testid="button-export-audit-csv"
        >
          <Download className="w-4 h-4 mr-2" />
          {exporting ? "Exporting..." : "Export CSV"}
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search actor or details..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
                className="pl-9"
                data-testid="input-audit-search"
              />
            </div>
            <Input
              placeholder="Action (e.g. DELETE_MEMBER)"
              value={actionQuery}
              onChange={(e) => { setActionQuery(e.target.value); setOffset(0); }}
              data-testid="input-audit-action"
            />
            <Select value={entity || "all"} onValueChange={(v) => { setEntity(v === "all" ? "" : v); setOffset(0); }}>
              <SelectTrigger data-testid="select-audit-entity">
                <SelectValue placeholder="Entity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All entities</SelectItem>
                {ENTITY_OPTIONS.map((e) => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setOffset(0); }}
                data-testid="input-audit-from"
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setOffset(0); }}
                data-testid="input-audit-to"
              />
            </div>
          </div>
          {hasFilters && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Filters active</span>
              <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-audit-filters">
                <X className="w-3 h-3 mr-1" />
                Clear all
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : !logs || logs.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Shield className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No audit logs found</p>
              <p className="text-sm mt-1">
                {hasFilters ? "Try adjusting or clearing your filters." : "Activity will appear here as members and admins use the system."}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted border-b">
                    <tr>
                      <th className="text-left p-3">Timestamp</th>
                      <th className="text-left p-3">Actor</th>
                      <th className="text-left p-3">Action</th>
                      <th className="text-left p-3">Entity</th>
                      <th className="text-left p-3">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log: any) => (
                      <tr key={log.id} className="border-b last:border-0 hover:bg-muted/30" data-testid={`audit-row-${log.id}`}>
                        <td className="p-3 text-muted-foreground whitespace-nowrap">{formatDate(log.createdAt)}</td>
                        <td className="p-3">{log.actorName || <span className="text-muted-foreground italic">System</span>}</td>
                        <td className="p-3">
                          <Badge variant={log.action.includes("FAILED") || log.action.includes("DELETE") ? "destructive" : "secondary"} className="font-mono text-xs">
                            {log.action}
                          </Badge>
                        </td>
                        <td className="p-3 text-muted-foreground">{log.entity}{log.entityId ? ` #${log.entityId}` : ""}</td>
                        <td className="p-3 text-muted-foreground text-xs max-w-md break-words">{log.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between items-center p-3 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  data-testid="button-audit-prev"
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Showing {offset + 1} – {offset + logs.length}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={logs.length < limit}
                  onClick={() => setOffset(offset + limit)}
                  data-testid="button-audit-next"
                >
                  Next
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
