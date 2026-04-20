import { useState } from "react";
import { useListAuditLogs, getListAuditLogsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { Shield } from "lucide-react";

export function AuditLogsPage() {
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const params = { limit, offset };
  const { data: logs, isLoading } = useListAuditLogs(params, {
    query: { queryKey: getListAuditLogsQueryKey(params) },
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-2">
        <Shield className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">Audit Logs</h1>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : !logs || logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No audit logs yet.</div>
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
                    {[...logs].reverse().map((log: any) => (
                      <tr key={log.id} className="border-b last:border-0 hover:bg-muted/30" data-testid={`audit-row-${log.id}`}>
                        <td className="p-3 text-muted-foreground whitespace-nowrap">{formatDate(log.createdAt)}</td>
                        <td className="p-3">{log.actorName || "System"}</td>
                        <td className="p-3 font-mono text-xs">{log.action}</td>
                        <td className="p-3 text-muted-foreground">{log.entity}{log.entityId ? ` #${log.entityId}` : ""}</td>
                        <td className="p-3 text-muted-foreground text-xs">{log.details}</td>
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
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">Showing {offset + 1} - {offset + logs.length}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={logs.length < limit}
                  onClick={() => setOffset(offset + limit)}
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
