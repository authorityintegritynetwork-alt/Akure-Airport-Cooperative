import { useState } from "react";
import {
  useListOpeningBalanceImports,
  type OpeningBalanceImport,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import {
  History,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

function ImportRow({ imp }: { imp: OpeningBalanceImport }) {
  const [open, setOpen] = useState(false);
  const hasSkips = imp.skipped > 0 && imp.skippedDetails.length > 0;

  return (
    <div className="rounded-lg border p-4" data-testid={`row-ob-import-${imp.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium truncate">{imp.sheetName}</span>
          {imp.organization && (
            <Badge variant="outline">{imp.organization}</Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          By {imp.uploaderName} · {formatDate(imp.createdAt)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Total rows" value={imp.totalRows} />
        <Stat label="Imported" value={imp.inserted} tone="success" />
        <Stat
          label="Skipped"
          value={imp.skipped}
          tone={imp.skipped > 0 ? "danger" : "muted"}
        />
        <Stat label="Members synced" value={imp.membersSynced} />
      </div>

      {hasSkips && (
        <div className="mt-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
            onClick={() => setOpen((v) => !v)}
            data-testid={`button-toggle-skips-${imp.id}`}
          >
            <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
            {imp.skipped} skipped row{imp.skipped === 1 ? "" : "s"} — see reasons
            {open ? (
              <ChevronUp className="w-3.5 h-3.5 ml-1" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 ml-1" />
            )}
          </Button>
          {open && (
            <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-destructive/20 text-left">
                    <th className="px-3 py-1.5 font-medium">Row</th>
                    <th className="px-3 py-1.5 font-medium">Name</th>
                    <th className="px-3 py-1.5 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {imp.skippedDetails.map((s, i) => (
                    <tr
                      key={i}
                      className="border-b border-destructive/10 last:border-0"
                    >
                      <td className="px-3 py-1.5 tabular-nums">{s.row}</td>
                      <td className="px-3 py-1.5">{s.name}</td>
                      <td className="px-3 py-1.5 text-destructive">{s.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "danger" | "muted";
}) {
  const toneClass = {
    default: "text-foreground",
    success: "text-emerald-600 dark:text-emerald-400",
    danger: "text-destructive",
    muted: "text-muted-foreground",
  }[tone];
  return (
    <div className="rounded-md bg-muted/40 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`text-lg font-bold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

export function OpeningBalanceImportStats() {
  const { data: imports, isLoading } = useListOpeningBalanceImports();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="w-4 h-4" />
          Import History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : !imports || imports.length === 0 ? (
          <div
            className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground"
            data-testid="text-empty-ob-imports"
          >
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
            No opening-balance imports yet. Stats appear here after your first
            import.
          </div>
        ) : (
          <div className="space-y-3">
            {imports.map((imp) => (
              <ImportRow key={imp.id} imp={imp} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
