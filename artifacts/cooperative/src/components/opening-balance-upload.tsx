import { useRef, useState } from "react";
import {
  usePreviewOpeningBalanceUpload,
  useProcessOpeningBalanceUpload,
  type ObUploadPreviewRow,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useStepUpAction } from "@/lib/step-up";
import { formatCurrency } from "@/lib/format";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

type Stage = "select" | "pickSheet" | "preview";

const BALANCE_COLS: { key: keyof ObUploadPreviewRow; label: string }[] = [
  { key: "savings", label: "Savings" },
  { key: "provident", label: "Provident" },
  { key: "christmas", label: "Christmas" },
  { key: "fire", label: "Fire Fund" },
  { key: "realLoan", label: "Real Loan" },
  { key: "emergencyLoan", label: "Emer. Loan" },
  { key: "fuelVenture", label: "Fuel Venture" },
  { key: "landLoan", label: "Land Loan" },
  { key: "electronics", label: "Electronics" },
  { key: "sElectronics", label: "S/Elect." },
  { key: "commodity", label: "Commodity" },
  { key: "ghlForm", label: "Loan Form" },
];

export function OpeningBalanceUpload({ onImported }: { onImported?: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("select");
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [sheets, setSheets] = useState<{ name: string; rowCount: number; looksValid: boolean }[]>([]);
  const [chosenSheet, setChosenSheet] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<{
    totalRows: number;
    rows: ObUploadPreviewRow[];
  } | null>(null);
  const [uploading, setUploading] = useState(false);

  const previewMutation = usePreviewOpeningBalanceUpload();
  const processMutation = useProcessOpeningBalanceUpload();
  const processWithStepUp = useStepUpAction((body: Parameters<typeof processMutation.mutateAsync>[0]) =>
    processMutation.mutateAsync(body),
  );

  function reset() {
    setStage("select");
    setUploadedPath(null);
    setSheets([]);
    setChosenSheet(null);
    setPreviewData(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadResp = await fetch(`${basePath}/api/storage/uploads/file`, {
        method: "POST",
        body: formData,
      });
      if (!uploadResp.ok) throw new Error("Failed to upload file");
      const { objectPath } = await uploadResp.json();

      setUploadedPath(objectPath);

      const result = await previewMutation.mutateAsync({ fileObjectPath: objectPath });

      setSheets(result.sheets);

      if (result.sheets.length === 1 && result.sheets[0].looksValid) {
        setChosenSheet(result.sheets[0].name);
        setPreviewData({ totalRows: result.totalRows, rows: result.rows });
        setStage("preview");
      } else {
        setStage("pickSheet");
      }
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.data?.error ?? err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function handlePickSheet(sheetName: string) {
    if (!uploadedPath) return;
    setChosenSheet(sheetName);
    try {
      const result = await previewMutation.mutateAsync({ fileObjectPath: uploadedPath, sheetName });
      setPreviewData({ totalRows: result.totalRows, rows: result.rows });
      setStage("preview");
    } catch (err: any) {
      toast({ title: "Preview failed", description: err?.data?.error ?? err.message, variant: "destructive" });
    }
  }

  async function handleImport() {
    if (!uploadedPath || !chosenSheet) return;
    try {
      const result = await processWithStepUp({
        fileObjectPath: uploadedPath,
        sheetName: chosenSheet,
      });
      toast({
        title: "Opening balances imported",
        description: `${result.inserted} records added, ${result.skipped} skipped (already exist).`,
      });
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/opening-balances",
      });
      onImported?.();
      reset();
    } catch (err: any) {
      if (err?.cancelled) return;
      toast({
        title: "Import failed",
        description: err?.data?.error ?? err.message,
        variant: "destructive",
      });
    }
  }

  if (stage === "select") {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Import Opening Balances (October 2025)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload your Excel sheet containing the October 2025 opening balances. Each row
            should have a member name and balance columns (Savings, Provident, Christmas,
            Real Loan, Emergency Loan, store debts, etc.). These will be held as unclaimed
            records until each member registers — matched by name.
          </p>

          <Button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="gap-2"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {uploading ? "Uploading & reading…" : "Choose Excel file"}
          </Button>

          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileChange}
          />

          <p className="text-xs text-muted-foreground">
            Accepted formats: .xlsx, .xls — Use the same column headers as the monthly
            deduction sheet (Name, Savings, Prov, etc.).
          </p>
        </CardContent>
      </Card>
    );
  }

  if (stage === "pickSheet") {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Select Sheet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Multiple sheets were found. Pick the one that contains the opening balances.
          </p>
          {sheets.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => handlePickSheet(s.name)}
              disabled={previewMutation.isPending}
              className="w-full flex items-center justify-between rounded-lg border p-3 text-left hover:bg-muted/50 transition-colors disabled:opacity-50"
            >
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{s.name}</span>
                {s.looksValid ? (
                  <Badge variant="secondary">{s.rowCount} rows</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">No data headers</Badge>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          ))}
          <Button variant="outline" size="sm" onClick={reset}>
            Cancel
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (stage === "preview" && previewData) {
    const errorRows = previewData.rows.filter((r) => r.errors.length > 0);
    const warnRows = previewData.rows.filter((r) => r.warnings.length > 0 && r.errors.length === 0);

    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base">Preview — {previewData.totalRows} rows</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              {errorRows.length > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errorRows.length} errors
                </Badge>
              )}
              {warnRows.length > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {warnRows.length} warnings
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Name</th>
                  {BALANCE_COLS.map((c) => (
                    <th key={c.key} className="text-right px-2 py-2 font-medium whitespace-nowrap text-xs">
                      {c.label}
                    </th>
                  ))}
                  <th className="text-right px-3 py-2 font-medium whitespace-nowrap">Total</th>
                </tr>
              </thead>
              <tbody>
                {previewData.rows.map((row) => (
                  <tr
                    key={row.rowNumber}
                    className={`border-b last:border-0 ${
                      row.errors.length > 0
                        ? "bg-destructive/5"
                        : row.warnings.length > 0
                        ? "bg-amber-50 dark:bg-amber-950/20"
                        : ""
                    }`}
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {row.errors.length > 0 && (
                          <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                        )}
                        {row.warnings.length > 0 && row.errors.length === 0 && (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        )}
                        <span className="font-medium">{row.rawName}</span>
                      </div>
                      {row.errors.map((e, i) => (
                        <p key={i} className="text-xs text-destructive mt-0.5">{e}</p>
                      ))}
                      {row.warnings.map((w, i) => (
                        <p key={i} className="text-xs text-amber-600 mt-0.5">{w}</p>
                      ))}
                    </td>
                    {BALANCE_COLS.map((c) => {
                      const val = Number(row[c.key] ?? 0);
                      return (
                        <td key={c.key} className="px-2 py-2 text-right tabular-nums text-xs whitespace-nowrap">
                          {val > 0 ? formatCurrency(val) : <span className="text-muted-foreground">—</span>}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right tabular-nums font-medium whitespace-nowrap">
                      {formatCurrency(row.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {errorRows.length > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <strong>{errorRows.length} row(s) have errors</strong> and will be skipped on import.
              Review them above before proceeding.
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={handleImport}
              disabled={processMutation.isPending}
              className="gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              {processMutation.isPending ? "Importing…" : `Import ${previewData.totalRows} records`}
            </Button>
            <Button variant="outline" onClick={reset}>
              Cancel
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Rows that already exist (same name, unclaimed) will be skipped automatically.
            You will be asked to confirm with a security code before the import is saved.
          </p>
        </CardContent>
      </Card>
    );
  }

  return null;
}
