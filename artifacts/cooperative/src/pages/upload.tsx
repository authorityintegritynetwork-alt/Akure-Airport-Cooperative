import { useMemo, useState } from "react";
import {
  useListExcelSheets,
  usePreviewExcelUpload,
  useProcessExcelUpload,
  useListUploadHistory,
  useListMembers,
  getListUploadHistoryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatCurrency } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { useStepUpAction } from "@/lib/step-up";
import {
  Upload,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  FileSpreadsheet,
  ChevronRight,
} from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type Org = "faan" | "nama";

const CATEGORY_COLUMNS_BY_ORG: Record<Org, { key: string; label: string }[]> = {
  faan: [
    { key: "savings", label: "Savings" },
    { key: "provident", label: "Provision" },
    { key: "christmas", label: "Christmas" },
    { key: "realLoan", label: "Real Loan" },
    { key: "emergencyLoan", label: "Emer. Loan" },
    { key: "electronics", label: "Electronics" },
    { key: "sElectronics", label: "S/Elect" },
    { key: "furniture", label: "Furniture" },
    { key: "commodity", label: "Commodity" },
    { key: "ghlForm", label: "Loan Form" },
    { key: "fire", label: "Fire" },
  ],
  nama: [
    { key: "savings", label: "Savings" },
    { key: "provident", label: "Provident" },
    { key: "realLoan", label: "Real Loan" },
    { key: "emergencyLoan", label: "Emer. Loan" },
    { key: "electronics", label: "Electronics (S/Elect)" },
    { key: "fuelVenture", label: "Fuel Venture" },
    { key: "landLoan", label: "Land Loan" },
    { key: "commodity", label: "Commodity" },
    { key: "ghlForm", label: "Loan Form" },
  ],
};

type Stage = "select" | "pickSheet" | "preview";

export function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [month, setMonth] = useState(MONTHS[new Date().getMonth()]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [organization, setOrganization] = useState<Org>("faan");
  const [stage, setStage] = useState<Stage>("select");
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [sheets, setSheets] = useState<{ name: string; rowCount: number; looksValid: boolean }[]>([]);
  const [chosenSheet, setChosenSheet] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [manualMatches, setManualMatches] = useState<Record<number, number>>({});
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const listSheets = useListExcelSheets();
  const preview = usePreviewExcelUpload();
  const process = useProcessExcelUpload();
  const processWithStepUp = useStepUpAction((data: any) => process.mutateAsync({ data }));
  const { data: members } = useListMembers({ status: "active" });

  const memberOptions = useMemo(
    () =>
      (members || [])
        .slice()
        .sort((a, b) => a.fullName.localeCompare(b.fullName))
        .map((m) => ({ id: m.id, label: `${m.fullName}${m.staffId ? ` (${m.staffId})` : ""}` })),
    [members],
  );

  function reset() {
    setFile(null);
    setStage("select");
    setUploadedPath(null);
    setSheets([]);
    setChosenSheet(null);
    setPreviewData(null);
    setManualMatches({});
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    try {
      const urlResp = await fetch(`${basePath}/api/storage/uploads/request-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlResp.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlResp.json();

      const uploadResp = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!uploadResp.ok) throw new Error("Failed to upload file");

      setUploadedPath(objectPath);

      const sheetResult = await listSheets.mutateAsync({
        data: { fileObjectPath: objectPath, organization },
      });
      setSheets(sheetResult.sheets);
      const firstValid = sheetResult.sheets.find((s) => s.looksValid);
      if (sheetResult.sheets.length === 1 && firstValid) {
        setChosenSheet(firstValid.name);
        await loadPreview(objectPath, firstValid.name, {});
      } else {
        setStage("pickSheet");
      }
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function loadPreview(
    path: string,
    sheetName: string,
    manual: Record<number, number>,
  ) {
    try {
      const data = await preview.mutateAsync({
        data: {
          fileObjectPath: path,
          sheetName,
          month,
          year,
          organization,
          manualMatches: Object.entries(manual).map(([rowNumber, memberId]) => ({
            rowNumber: Number(rowNumber),
            memberId,
          })),
        },
      });
      setPreviewData(data);
      setStage("preview");
    } catch (err: any) {
      toast({ title: "Preview failed", description: err.message, variant: "destructive" });
    }
  }

  function handlePickSheet(name: string) {
    if (!uploadedPath) return;
    setChosenSheet(name);
    void loadPreview(uploadedPath, name, {});
  }

  function handleAssignMember(rowNumber: number, memberId: number | null) {
    const next = { ...manualMatches };
    if (memberId == null) {
      delete next[rowNumber];
    } else {
      next[rowNumber] = memberId;
    }
    setManualMatches(next);
    if (uploadedPath && chosenSheet) {
      void loadPreview(uploadedPath, chosenSheet, next);
    }
  }

  async function handleProcess(skipErrors: boolean) {
    if (!uploadedPath || !chosenSheet) return;
    try {
      const result: any = await processWithStepUp({
        fileObjectPath: uploadedPath,
        sheetName: chosenSheet,
        month,
        year,
        organization,
        skipErrors,
        manualMatches: Object.entries(manualMatches).map(([rowNumber, memberId]) => ({
          rowNumber: Number(rowNumber),
          memberId,
        })),
      });
      toast({
        title: "Upload processed",
        description: `${result.processed ?? 0} members processed, ${result.skipped ?? 0} skipped.`,
      });
      queryClient.invalidateQueries({ queryKey: getListUploadHistoryQueryKey() });
      reset();
    } catch (err: any) {
      if (err?.cancelled) return;
      toast({ title: "Processing failed", description: err.message, variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Upload Monthly Deductions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload the monthly deduction Excel file ({organization.toUpperCase()}). Members are matched by full name.
          </p>
        </div>
        {stage !== "select" && (
          <Button variant="outline" size="sm" onClick={reset} data-testid="button-cancel-upload">
            Start Over
          </Button>
        )}
      </div>

      {stage === "select" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              Step 1 — Choose period & file
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Organization</label>
              <div className="flex gap-2 mt-1">
                {(["faan", "nama"] as Org[]).map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setOrganization(o)}
                    className={`flex-1 border rounded-md px-3 py-2 text-sm font-medium ${
                      organization === o
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted"
                    }`}
                    data-testid={`org-${o}`}
                  >
                    {o.toUpperCase()}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Pick the employer this spreadsheet is from. Matched members will be tagged
                to this organization automatically.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Month</label>
                <select
                  className="w-full mt-1 border border-input rounded-md px-3 py-2 text-sm bg-background"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  data-testid="select-upload-month"
                >
                  {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Year</label>
                <Input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(parseInt(e.target.value))}
                  data-testid="input-upload-year"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Excel File (.xlsx)</label>
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="mt-1"
                data-testid="input-upload-file"
              />
            </div>

            <Button
              onClick={handleUpload}
              disabled={!file || uploading || listSheets.isPending}
              data-testid="button-upload-preview"
            >
              <Upload className="w-4 h-4 mr-2" />
              {uploading || listSheets.isPending ? "Uploading..." : "Upload & Continue"}
            </Button>
          </CardContent>
        </Card>
      )}

      {stage === "pickSheet" && (
        <Card>
          <CardHeader>
            <CardTitle>Step 2 — Pick a sheet</CardTitle>
            <p className="text-sm text-muted-foreground">
              Workbook contains {sheets.length} sheet{sheets.length === 1 ? "" : "s"}.
              Choose the one with this month's deductions.
            </p>
          </CardHeader>
          <CardContent>
            <div className="divide-y border rounded-md">
              {sheets.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => handlePickSheet(s.name)}
                  disabled={preview.isPending}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 text-left disabled:opacity-50"
                  data-testid={`sheet-${s.name}`}
                >
                  <div>
                    <p className="font-medium text-sm">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.rowCount} data row{s.rowCount === 1 ? "" : "s"} detected
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {s.looksValid ? (
                      <Badge variant="secondary">Valid format</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">No deduction columns</Badge>
                    )}
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {stage === "preview" && previewData && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>Step 3 — Review & confirm</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Sheet: <span className="font-medium">{previewData.sheetName}</span> &middot; {previewData.totalRows} rows
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-end">
                <Badge variant="secondary" className="text-primary">
                  {previewData.matchedRows} matched
                </Badge>
                {previewData.unmatchedRows > 0 && (
                  <Badge variant="destructive">{previewData.unmatchedRows} unmatched</Badge>
                )}
                {previewData.errorRows > 0 && (
                  <Badge variant="destructive">{previewData.errorRows} errors</Badge>
                )}
              </div>
            </div>
            {previewData.duplicateMonth && (
              <div className="mt-3 flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                A processed upload already exists for {previewData.month} {previewData.year}.
                Continuing will record duplicate transactions.
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-auto max-h-[28rem] border rounded">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0 z-10">
                  <tr>
                    <th className="text-left p-2">Row</th>
                    <th className="text-left p-2 min-w-[140px]">Name in File</th>
                    <th className="text-left p-2 min-w-[200px]">Matched Member</th>
                    <th className="text-left p-2">Org</th>
                    {CATEGORY_COLUMNS_BY_ORG[organization].map((c) => (
                      <th key={c.key} className="text-right p-2">{c.label}</th>
                    ))}
                    <th className="text-right p-2">Total</th>
                    <th className="text-center p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.rows.map((row: any) => {
                    const isUnmatched = row.matchedMemberId == null;
                    const rowClass = isUnmatched
                      ? "bg-destructive/5"
                      : row.orgMismatch
                      ? "bg-amber-100"
                      : row.totalMismatch
                      ? "bg-amber-50"
                      : "";
                    return (
                      <tr
                        key={row.rowNumber}
                        className={rowClass}
                        data-testid={`preview-row-${row.rowNumber}`}
                      >
                        <td className="p-2 text-muted-foreground">{row.rowNumber}</td>
                        <td className="p-2 font-medium">{row.rawName}</td>
                        <td className="p-2">
                          {isUnmatched ? (
                            <select
                              className="w-full border border-input rounded px-1 py-1 text-xs bg-background"
                              value={manualMatches[row.rowNumber] ?? ""}
                              onChange={(e) =>
                                handleAssignMember(
                                  row.rowNumber,
                                  e.target.value ? parseInt(e.target.value) : null,
                                )
                              }
                              data-testid={`assign-row-${row.rowNumber}`}
                            >
                              <option value="">— Assign member —</option>
                              {memberOptions.map((m) => (
                                <option key={m.id} value={m.id}>{m.label}</option>
                              ))}
                            </select>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span>{row.matchedMemberName}</span>
                              {row.matchConfidence !== "exact" && (
                                <Badge variant="outline" className="text-[10px] py-0 px-1">
                                  {row.matchConfidence}
                                </Badge>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-2">
                          {row.memberOrganization ? (
                            <Badge
                              variant={row.orgMismatch ? "destructive" : "secondary"}
                              className="text-[10px] py-0 px-1 uppercase"
                              data-testid={`org-badge-${row.rowNumber}`}
                            >
                              {row.memberOrganization}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">—</span>
                          )}
                        </td>
                        {CATEGORY_COLUMNS_BY_ORG[organization].map((c) => {
                          const v = row[c.key] || 0;
                          return (
                            <td key={c.key} className="p-2 text-right tabular-nums">
                              {v > 0 ? formatCurrency(v) : <span className="text-muted-foreground">—</span>}
                            </td>
                          );
                        })}
                        <td className="p-2 text-right font-medium tabular-nums">
                          {formatCurrency(row.total)}
                          {row.totalMismatch && (
                            <div className="text-[10px] text-amber-700">
                              calc: {formatCurrency(row.computedTotal)}
                            </div>
                          )}
                        </td>
                        <td className="p-2 text-center">
                          {isUnmatched ? (
                            <AlertCircle className="w-4 h-4 text-destructive mx-auto" />
                          ) : (
                            <CheckCircle className="w-4 h-4 text-primary mx-auto" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => handleProcess(false)}
                disabled={process.isPending || previewData.unmatchedRows > 0}
                data-testid="button-process-upload"
              >
                {process.isPending ? "Processing..." : `Process ${previewData.matchedRows} Members`}
              </Button>
              {previewData.unmatchedRows > 0 && (
                <Button
                  variant="outline"
                  onClick={() => handleProcess(true)}
                  disabled={process.isPending}
                  data-testid="button-process-skip-errors"
                >
                  Skip {previewData.unmatchedRows} unmatched & process the rest
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function UploadHistoryPage() {
  const { data: history, isLoading } = useListUploadHistory();

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">Upload History</h1>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : !history || history.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No uploads yet.</div>
          ) : (
            <div className="divide-y">
              {[...history].reverse().map((record: any) => (
                <div key={record.id} className="flex items-center justify-between px-4 py-3" data-testid={`upload-row-${record.id}`}>
                  <div>
                    <p className="font-medium text-sm">{record.month} {record.year}</p>
                    <p className="text-xs text-muted-foreground">
                      By {record.uploaderName} &bull; {formatDate(record.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right text-xs text-muted-foreground">
                      <p>{record.rowsProcessed} processed</p>
                      {record.rowsSkipped > 0 && <p className="text-destructive">{record.rowsSkipped} skipped</p>}
                    </div>
                    <Badge variant={record.status === "processed" ? "default" : "secondary"}>{record.status}</Badge>
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
