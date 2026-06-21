import { useEffect, useMemo, useState } from "react";
import {
  useListExcelSheets,
  usePreviewExcelUpload,
  useProcessExcelUpload,
  useListUploadHistory,
  useListMembers,
  useListOrganizations,
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

// Unified column list — same template for every organisation. Columns the
// uploaded sheet does not carry are simply skipped (parser tolerates absent
// headers). The org dropdown is kept for audit/duplicate-guard purposes only.
const CATEGORY_COLUMNS: { key: string; label: string }[] = [
  { key: "savings", label: "Savings" },
  { key: "provident", label: "Provision" },
  { key: "christmas", label: "Christmas" },
  { key: "fire", label: "Fire Fund" },
  { key: "realLoan", label: "Real Loan" },
  { key: "emergencyLoan", label: "Emer. Loan" },
  { key: "fuelVenture", label: "Fuel Venture" },
  { key: "landLoan", label: "Land Loan" },
  { key: "electronics", label: "Electronics" },
  { key: "sElectronics", label: "S/Elect" },
  { key: "commodity", label: "Commodity" },
  { key: "ghlForm", label: "Loan Form" },
];

type Stage = "select" | "pickSheet" | "preview";

export function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [month, setMonth] = useState(MONTHS[new Date().getMonth()]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedOrgCode, setSelectedOrgCode] = useState<string>("");
  const [organization, setOrganization] = useState<string>("");
  const [stage, setStage] = useState<Stage>("select");
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [sheets, setSheets] = useState<{ name: string; rowCount: number; looksValid: boolean; detectedMonth?: string; detectedYear?: number }[]>([]);
  const [chosenSheet, setChosenSheet] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [manualMatches, setManualMatches] = useState<Record<number, number>>({});
  const [acknowledgeMismatch, setAcknowledgeMismatch] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showAllSheets, setShowAllSheets] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const listSheets = useListExcelSheets();
  const preview = usePreviewExcelUpload();
  const process = useProcessExcelUpload();
  const processWithStepUp = useStepUpAction((data: any) => process.mutateAsync({ data }));
  const { data: members } = useListMembers({ status: "active" });
  const { data: orgList } = useListOrganizations();
  useEffect(() => {
    if (!selectedOrgCode && orgList?.length) {
      setSelectedOrgCode(orgList[0].code);
      setOrganization(orgList[0].excelFormat);
    }
  }, [orgList, selectedOrgCode]);

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
    setAcknowledgeMismatch(false);
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadResp = await fetch(`${basePath}/api/storage/uploads/file`, {
        method: "POST",
        body: formData,
      });
      if (!uploadResp.ok) {
        let detail = `Server returned ${uploadResp.status}`;
        try { const d = await uploadResp.json(); if (d?.error) detail = d.error; } catch {}
        throw new Error(`Failed to upload file: ${detail}`);
      }
      const { objectPath } = await uploadResp.json();

      setUploadedPath(objectPath);

      const sheetResult = await listSheets.mutateAsync({
        data: { fileObjectPath: objectPath, organization },
      });
      setSheets(sheetResult.sheets);
      // Prefer the sheet whose detected month+year matches the selected period.
      // Fall back to the last valid sheet if none match; show the picker if none are valid.
      const validSheets = sheetResult.sheets.filter((s) => s.looksValid);
      const matchingSheet = validSheets.find(
        (s) =>
          s.detectedMonth?.toLowerCase() === month.toLowerCase() &&
          s.detectedYear === year,
      );
      const targetSheet = matchingSheet ?? validSheets[validSheets.length - 1];
      if (targetSheet) {
        setChosenSheet(targetSheet.name);
        await loadPreview(objectPath, targetSheet.name, {});
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

  async function handleProcess() {
    if (!uploadedPath || !chosenSheet) return;
    try {
      const result: any = await processWithStepUp({
        fileObjectPath: uploadedPath,
        sheetName: chosenSheet,
        month,
        year,
        organization,
        acknowledgeMismatch: acknowledgeMismatch || undefined,
        manualMatches: Object.entries(manualMatches).map(([rowNumber, memberId]) => ({
          rowNumber: Number(rowNumber),
          memberId,
        })),
      });
      const parts: string[] = [];
      if ((result.processed ?? 0) > 0) parts.push(`${result.processed} matched`);
      if ((result.autoCreated ?? 0) > 0) parts.push(`${result.autoCreated} auto-created`);
      if ((result.skipped ?? 0) > 0) parts.push(`${result.skipped} skipped`);
      toast({
        title: "Upload processed",
        description: parts.join(", ") + " members.",
      });
      queryClient.invalidateQueries({ queryKey: getListUploadHistoryQueryKey() });
      reset();
    } catch (err: any) {
      if (err?.cancelled) return;
      toast({ title: "Processing failed", description: err.message, variant: "destructive" });
    }
  }

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Hero gradient card */}
      <div
        className="relative overflow-hidden rounded-3xl p-5 sm:p-6 text-white shadow-xl shadow-primary/20"
        style={{
          background:
            "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(220 80% 35%) 45%, hsl(200 85% 45%) 100%)",
        }}
        data-testid="upload-hero-card"
      >
        <div className="absolute -top-12 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 -left-8 w-56 h-56 rounded-full bg-white/5 blur-3xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs sm:text-sm text-white/80 font-medium uppercase tracking-wider">
              Monthly Deductions
            </p>
            <h1 className="text-xl sm:text-2xl font-bold mt-0.5 leading-tight">
              Upload {selectedOrgCode || "—"} sheet
            </h1>
            <p className="text-xs text-white/80 mt-1">
              Members are matched by full name and tagged automatically.
            </p>
          </div>
          {stage !== "select" && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full bg-white/15 border-white/30 text-white hover:bg-white/25 backdrop-blur-sm shrink-0"
              onClick={reset}
              data-testid="button-cancel-upload"
            >
              Start Over
            </Button>
          )}
        </div>

        {/* Stepper */}
        <div className="relative mt-5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
          {(["select", "pickSheet", "preview"] as Stage[]).map((s, i) => {
            const labels = ["File", "Sheet", "Review"];
            const isActive = stage === s;
            const idx = ["select", "pickSheet", "preview"].indexOf(stage);
            const isPast = i < idx;
            return (
              <div
                key={s}
                className={`flex-1 rounded-full px-2 py-1.5 text-center backdrop-blur-sm border ${
                  isActive
                    ? "bg-white text-primary border-white"
                    : isPast
                    ? "bg-white/30 text-white border-white/40"
                    : "bg-white/10 text-white/70 border-white/20"
                }`}
              >
                {i + 1}. {labels[i]}
              </div>
            );
          })}
        </div>
      </div>

      {stage === "select" && (
        <Card className="rounded-2xl shadow-sm border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="w-5 h-5" />
              Step 1 — Choose period & file
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Organization</label>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {(orgList ?? []).map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => { setSelectedOrgCode(o.code); setOrganization(o.excelFormat); }}
                    className={`border rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                      selectedOrgCode === o.code
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-background hover:bg-muted border-border/60"
                    }`}
                    data-testid={`org-${o.code.toLowerCase()}`}
                  >
                    {o.code}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Pick the employer this spreadsheet is from.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Month</label>
                <select
                  className="w-full mt-1.5 border border-input rounded-xl px-3 py-2 text-sm bg-background h-10"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  data-testid="select-upload-month"
                >
                  {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Year</label>
                <Input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(parseInt(e.target.value))}
                  className="mt-1.5 rounded-xl"
                  data-testid="input-upload-year"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Excel File (.xlsx)</label>
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="mt-1.5 rounded-xl file:bg-primary/10 file:text-primary file:border-0 file:rounded-lg file:px-3 file:py-1.5 file:mr-3 file:font-semibold cursor-pointer"
                data-testid="input-upload-file"
              />
            </div>

            <Button
              onClick={handleUpload}
              disabled={!file || !organization || uploading || listSheets.isPending}
              className="w-full rounded-xl h-11"
              data-testid="button-upload-preview"
            >
              <Upload className="w-4 h-4 mr-2" />
              {uploading || listSheets.isPending ? "Uploading..." : "Upload & Continue"}
            </Button>
          </CardContent>
        </Card>
      )}

      {stage === "pickSheet" && (
        <Card className="rounded-2xl shadow-sm border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Step 2 — Pick a sheet</CardTitle>
            <p className="text-xs text-muted-foreground">
              Workbook has {sheets.length} sheet{sheets.length === 1 ? "" : "s"}.
              {sheets.length > 15 && " Showing the most recent ones — "}
              {sheets.length > 15 && (
                <button
                  type="button"
                  className="underline text-primary"
                  onClick={() => setShowAllSheets((v) => !v)}
                >
                  {showAllSheets ? "show recent only" : `show all ${sheets.length}`}
                </button>
              )}
            </p>
          </CardHeader>
          <CardContent>
            {(() => {
              const validSheets = sheets.filter((s) => s.looksValid);
              const matchingSheet = validSheets.find(
                (s) =>
                  s.detectedMonth?.toLowerCase() === month.toLowerCase() &&
                  s.detectedYear === year,
              );
              const lastValidName = validSheets[validSheets.length - 1]?.name;
              const displayed = showAllSheets
                ? sheets
                : sheets.length > 15
                ? sheets.slice(-15)
                : sheets;
              return (
                <div className="space-y-2">
                  {displayed.map((s) => {
                    const isMonthMatch = !!matchingSheet && s.name === matchingSheet.name;
                    const isFallback = !matchingSheet && s.name === lastValidName;
                    const highlighted = isMonthMatch || isFallback;
                    return (
                      <button
                        key={s.name}
                        type="button"
                        onClick={() => handlePickSheet(s.name)}
                        disabled={preview.isPending}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border text-left disabled:opacity-50 transition-colors ${
                          highlighted
                            ? "border-primary/50 bg-primary/5 hover:bg-primary/10"
                            : "border-border/70 hover:bg-muted/40 hover:border-primary/40"
                        }`}
                        data-testid={`sheet-${s.name}`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm truncate">{s.name}</p>
                            {isMonthMatch && (
                              <Badge variant="default" className="rounded-full text-[10px] py-0 px-1.5 shrink-0">
                                {month} {year}
                              </Badge>
                            )}
                            {isFallback && (
                              <Badge variant="default" className="rounded-full text-[10px] py-0 px-1.5 shrink-0">
                                Most recent
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {s.detectedMonth && s.detectedYear
                              ? `${s.detectedMonth} ${s.detectedYear} · `
                              : ""}
                            {s.rowCount} data row{s.rowCount === 1 ? "" : "s"} detected
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {s.looksValid ? (
                            <Badge variant="secondary" className="rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px]">Valid</Badge>
                          ) : (
                            <Badge variant="outline" className="rounded-full text-[10px] text-muted-foreground">No data</Badge>
                          )}
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {stage === "preview" && previewData && (
        <Card className="rounded-2xl shadow-sm border-border/70">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <CardTitle className="text-base">Step 3 — Review & confirm</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Sheet: <span className="font-medium">{previewData.sheetName}</span> · {previewData.totalRows} rows
                  {sheets.length > 1 && (
                    <button
                      type="button"
                      className="ml-2 underline text-primary"
                      onClick={() => setStage("pickSheet")}
                    >
                      Switch sheet
                    </button>
                  )}
                </p>
                {(() => {
                  const current = sheets.find((s) => s.name === previewData.sheetName);
                  const monthMismatch =
                    current?.detectedMonth &&
                    current?.detectedYear &&
                    (current.detectedMonth.toLowerCase() !== month.toLowerCase() ||
                      current.detectedYear !== year);
                  if (!monthMismatch) return null;
                  return (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      This sheet contains <span className="font-medium">{current!.detectedMonth} {current!.detectedYear}</span> data,
                      but you selected <span className="font-medium">{month} {year}</span>.
                      {sheets.length > 1 && (
                        <button
                          type="button"
                          className="underline text-primary ml-0.5"
                          onClick={() => setStage("pickSheet")}
                        >
                          Switch sheet
                        </button>
                      )}
                    </p>
                  );
                })()}
              </div>
              <div className="flex flex-wrap gap-1.5 justify-end">
                <Badge className="rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20" variant="outline">
                  {previewData.matchedRows} matched
                </Badge>
                {previewData.unmatchedRows > 0 && (
                  <Badge className="rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20" variant="outline">
                    {previewData.unmatchedRows} unmatched
                  </Badge>
                )}
                {previewData.errorRows > 0 && (
                  <Badge className="rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20" variant="outline">
                    {previewData.errorRows} errors
                  </Badge>
                )}
              </div>
            </div>
            {previewData.duplicateMonth && (
              <div className="mt-3 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-3">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  A processed upload already exists for {previewData.month} {previewData.year}.
                  Continuing will record duplicate transactions.
                </span>
              </div>
            )}
            {previewData.hasDuplicateNames && (
              <div className="mt-3 flex items-start gap-2 text-xs text-red-800 dark:text-red-200 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-3">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  <strong>Upload blocked:</strong> the sheet contains duplicate member names (highlighted in red below).
                  Fix the spreadsheet and re-upload before you can process.
                </span>
              </div>
            )}
            {previewData.hasMismatchedTotals && !previewData.hasDuplicateNames && (
              <div className="mt-3 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-3">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium">Some rows have a mismatch between the sheet's Total column and the sum of individual columns.</p>
                  <p className="mt-1 text-amber-700 dark:text-amber-300">We will use the calculated column sum. Review the highlighted rows below, then tick the box to proceed.</p>
                  <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={acknowledgeMismatch}
                      onChange={(e) => setAcknowledgeMismatch(e.target.checked)}
                      className="rounded"
                      data-testid="checkbox-acknowledge-mismatch"
                    />
                    <span className="font-medium">I have reviewed the mismatches and agree to use the calculated totals</span>
                  </label>
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-auto max-h-[28rem] rounded-xl border border-border/60">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0 z-10">
                  <tr>
                    <th className="text-left p-2">Row</th>
                    <th className="text-left p-2 min-w-[140px] sticky left-0 bg-muted z-10">Name in File</th>
                    <th className="text-left p-2 min-w-[200px]">Matched Member</th>
                    <th className="text-left p-2">Org</th>
                    {CATEGORY_COLUMNS.map((c) => (
                      <th key={c.key} className="text-right p-2">{c.label}</th>
                    ))}
                    <th className="text-right p-2">Total</th>
                    <th className="text-center p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.rows.map((row: any) => {
                    const isUnmatched = row.matchedMemberId == null;
                    const rowClass = row.isDuplicateName
                      ? "bg-red-50 dark:bg-red-500/10"
                      : isUnmatched
                      ? "bg-amber-50 dark:bg-amber-500/5"
                      : row.orgMismatch
                      ? "bg-amber-100 dark:bg-amber-500/10"
                      : row.totalMismatch
                      ? "bg-amber-50 dark:bg-amber-500/5"
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
                            <div className="space-y-1">
                              <Badge
                                variant="outline"
                                className={`text-[10px] py-0 px-1.5 rounded-full ${
                                  row.hasOpeningBalance
                                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                                    : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20"
                                }`}
                                data-testid={`auto-create-badge-${row.rowNumber}`}
                              >
                                {row.hasOpeningBalance ? "Will auto-create (OB linked)" : "Will auto-create (no OB)"}
                              </Badge>
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
                                <option value="">— Or assign existing member —</option>
                                {memberOptions.map((m) => (
                                  <option key={m.id} value={m.id}>{m.label}</option>
                                ))}
                              </select>
                            </div>
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
                        {CATEGORY_COLUMNS.map((c) => {
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
                            <AlertTriangle className="w-4 h-4 text-amber-500 mx-auto" />
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

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => handleProcess()}
                disabled={
                  process.isPending ||
                  previewData.hasDuplicateNames ||
                  (previewData.hasMismatchedTotals && !acknowledgeMismatch)
                }
                className="rounded-xl flex-1 min-w-[200px] h-11"
                data-testid="button-process-upload"
              >
                {process.isPending
                  ? "Processing..."
                  : previewData.hasDuplicateNames
                  ? "Fix duplicate names to continue"
                  : previewData.hasMismatchedTotals && !acknowledgeMismatch
                  ? "Acknowledge mismatches to continue"
                  : previewData.unmatchedRows > 0
                  ? `Process ${previewData.matchedRows} matched + ${previewData.unmatchedRows} auto-create`
                  : `Process ${previewData.matchedRows} Members`}
              </Button>
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
    <div className="space-y-5 max-w-4xl">
      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-3xl p-5 sm:p-6 text-white shadow-xl shadow-primary/20"
        style={{
          background:
            "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(220 80% 35%) 45%, hsl(200 85% 45%) 100%)",
        }}
        data-testid="upload-history-hero"
      >
        <div className="absolute -top-12 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 -left-8 w-56 h-56 rounded-full bg-white/5 blur-3xl" />
        <div className="relative">
          <p className="text-xs sm:text-sm text-white/80 font-medium uppercase tracking-wider">
            Upload History
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold mt-0.5 tabular-nums">
            {history?.length ?? 0}
          </h1>
          <p className="text-xs text-white/80 mt-1">Past deduction uploads</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
        </div>
      ) : !history || history.length === 0 ? (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="text-center py-16 text-muted-foreground">
            <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No uploads yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {[...history].reverse().map((record: any) => (
            <div
              key={record.id}
              className="rounded-2xl border border-border/70 bg-card shadow-sm p-4 flex items-start gap-3"
              data-testid={`upload-row-${record.id}`}
            >
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-sm truncate">{record.month} {record.year}</p>
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
                    <span className="font-bold text-foreground tabular-nums">{record.rowsProcessed}</span> processed
                  </span>
                  {record.rowsSkipped > 0 && (
                    <span className="text-destructive">
                      <span className="font-bold tabular-nums">{record.rowsSkipped}</span> skipped
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
