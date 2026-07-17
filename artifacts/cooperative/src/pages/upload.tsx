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
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Check,
  Pencil,
  Undo2,
  UserX,
  ListChecks,
  Link2,
  Ban,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

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

interface MatchSuggestion {
  memberId: number;
  memberName: string;
}

function MatchCorrector({
  rowNumber,
  matchedMemberId,
  suggestions,
  memberOptions,
  onPick,
  onReject,
}: {
  rowNumber: number;
  matchedMemberId: number | null;
  suggestions: MatchSuggestion[];
  memberOptions: { id: number; label: string }[];
  onPick: (memberId: number) => void;
  onReject: () => void;
}) {
  const [open, setOpen] = useState(false);
  const suggestionIds = new Set(suggestions.map((s) => s.memberId));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-1.5 text-[10px] gap-1"
          data-testid={`correct-match-${rowNumber}`}
        >
          <Pencil className="h-3 w-3" /> Change
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search members…" />
          <CommandList>
            <CommandEmpty>No member found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="not a match create new member"
                onSelect={() => {
                  onReject();
                  setOpen(false);
                }}
                className="text-destructive"
                data-testid={`reject-match-${rowNumber}`}
              >
                <UserX className="h-3.5 w-3.5 mr-2" />
                Not a match — create new member
              </CommandItem>
            </CommandGroup>
            {suggestions.length > 0 && (
              <CommandGroup heading="Closest matches">
                {suggestions.map((s) => (
                  <CommandItem
                    key={`s-${s.memberId}`}
                    value={`${s.memberName} #${s.memberId}`}
                    onSelect={() => {
                      onPick(s.memberId);
                      setOpen(false);
                    }}
                    data-testid={`suggestion-${rowNumber}-${s.memberId}`}
                  >
                    {s.memberName}
                    {s.memberId === matchedMemberId && (
                      <Check className="ml-auto h-3.5 w-3.5 text-primary" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading="All members">
              {memberOptions
                .filter((m) => !suggestionIds.has(m.id))
                .map((m) => (
                  <CommandItem
                    key={m.id}
                    value={`${m.label} #${m.id}`}
                    onSelect={() => {
                      onPick(m.id);
                      setOpen(false);
                    }}
                  >
                    {m.label}
                    {m.id === matchedMemberId && (
                      <Check className="ml-auto h-3.5 w-3.5 text-primary" />
                    )}
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [month, setMonth] = useState(MONTHS[new Date().getMonth()]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedOrgCode, setSelectedOrgCode] = useState<string>("");
  const [organization, setOrganization] = useState<string>("");
  const [uploadType, setUploadType] = useState<"standalone" | "payroll_summary" | "category_breakdown">("standalone");
  const [linkedPayrollUploadId, setLinkedPayrollUploadId] = useState<number | null>(null);
  const [stage, setStage] = useState<Stage>("select");
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [sheets, setSheets] = useState<{ name: string; rowCount: number; looksValid: boolean; detectedMonth?: string; detectedYear?: number }[]>([]);
  const [chosenSheet, setChosenSheet] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [manualMatches, setManualMatches] = useState<Record<number, number>>({});
  const [rejectedRows, setRejectedRows] = useState<Record<number, true>>({});
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

  // Reset upload type when org changes — "none" orgs are always standalone.
  const selectedOrg = (orgList ?? []).find((o) => o.code === selectedOrgCode);
  const isDualUploadOrg = selectedOrg != null && selectedOrg.excelFormat !== "none";
  useEffect(() => {
    if (!isDualUploadOrg) {
      setUploadType("standalone");
      setLinkedPayrollUploadId(null);
    }
  }, [isDualUploadOrg]);

  // Fetch available payroll-summary rosters when Cooperative Archive is selected.
  const { data: rostersData } = useQuery({
    queryKey: ["payroll-rosters", selectedOrgCode, month, year],
    queryFn: async () => {
      const res = await fetch(
        `${basePath}/api/uploads/payroll-rosters?month=${encodeURIComponent(month)}&year=${year}&organization=${encodeURIComponent(selectedOrgCode)}`,
      );
      if (!res.ok) throw new Error("Failed to fetch rosters");
      return res.json() as Promise<{ rosters: { id: number; month: string; year: number; organization: string; rosterSize: number; createdAt: string }[] }>;
    },
    enabled: uploadType === "category_breakdown" && !!selectedOrgCode,
  });

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
    setRejectedRows({});
    setAcknowledgeMismatch(false);
    setUploadType("standalone");
    setLinkedPayrollUploadId(null);
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
    rejected: Record<number, true> = {},
  ) {
    try {
      const data = await preview.mutateAsync({
        data: {
          fileObjectPath: path,
          sheetName,
          month,
          year,
          organization,
          uploadType,
          manualMatches: Object.entries(manual).map(([rowNumber, memberId]) => ({
            rowNumber: Number(rowNumber),
            memberId,
          })),
          rejectedRows: Object.keys(rejected).map(Number),
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
    // Overrides are per-sheet — clear them so process cannot submit stale
    // corrections from a previously previewed sheet.
    setManualMatches({});
    setRejectedRows({});
    void loadPreview(uploadedPath, name, {}, {});
  }

  function handleAssignMember(rowNumber: number, memberId: number | null) {
    const next = { ...manualMatches };
    if (memberId == null) {
      delete next[rowNumber];
    } else {
      next[rowNumber] = memberId;
    }
    // Picking a member supersedes any earlier rejection of this row.
    const nextRejected = { ...rejectedRows };
    delete nextRejected[rowNumber];
    setManualMatches(next);
    setRejectedRows(nextRejected);
    if (uploadedPath && chosenSheet) {
      void loadPreview(uploadedPath, chosenSheet, next, nextRejected);
    }
  }

  function handleRejectMatch(rowNumber: number) {
    const nextManual = { ...manualMatches };
    delete nextManual[rowNumber];
    const nextRejected = { ...rejectedRows, [rowNumber]: true as const };
    setManualMatches(nextManual);
    setRejectedRows(nextRejected);
    if (uploadedPath && chosenSheet) {
      void loadPreview(uploadedPath, chosenSheet, nextManual, nextRejected);
    }
  }

  function handleRestoreMatch(rowNumber: number) {
    const nextManual = { ...manualMatches };
    delete nextManual[rowNumber];
    const nextRejected = { ...rejectedRows };
    delete nextRejected[rowNumber];
    setManualMatches(nextManual);
    setRejectedRows(nextRejected);
    if (uploadedPath && chosenSheet) {
      void loadPreview(uploadedPath, chosenSheet, nextManual, nextRejected);
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
        uploadType,
        linkedPayrollUploadId: linkedPayrollUploadId ?? undefined,
        acknowledgeMismatch: acknowledgeMismatch || undefined,
        manualMatches: Object.entries(manualMatches).map(([rowNumber, memberId]) => ({
          rowNumber: Number(rowNumber),
          memberId,
        })),
        rejectedRows: Object.keys(rejectedRows).map(Number),
      });

      if (result.uploadType === "payroll_summary") {
        toast({
          title: "Payroll roster saved",
          description: `Active member roster for ${month} ${year} captured — ${result.processed ?? 0} members. No transactions created. Upload the cooperative archive next.`,
        });
      } else {
        const parts: string[] = [];
        if ((result.processed ?? 0) > 0) parts.push(`${result.processed} matched`);
        if ((result.autoCreated ?? 0) > 0) parts.push(`${result.autoCreated} auto-created`);
        if ((result.skipped ?? 0) > 0) parts.push(`${result.skipped} skipped`);
        if ((result.rosterSkipped ?? 0) > 0) parts.push(`${result.rosterSkipped} roster-skipped`);
        toast({
          title: "Upload processed",
          description: parts.join(", ") + " members.",
        });
      }
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

            {/* Upload type — only shown for orgs that have a payroll sheet */}
            {isDualUploadOrg && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Upload Type</label>
                <div className="flex flex-col sm:flex-row gap-2 mt-1.5">
                  {([
                    { value: "standalone", label: "Standalone", icon: <Upload className="w-3.5 h-3.5" />, desc: "Direct upload — processes transactions immediately." },
                    { value: "payroll_summary", label: "Payroll Roster", icon: <ListChecks className="w-3.5 h-3.5" />, desc: "Head-office payroll sheet — saves active member list, no transactions." },
                    { value: "category_breakdown", label: "Cooperative Archive", icon: <Link2 className="w-3.5 h-3.5" />, desc: "Cooperative deduction sheet — linked to a payroll roster; absent members are skipped." },
                  ] as const).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => { setUploadType(opt.value); setLinkedPayrollUploadId(null); }}
                      className={`flex-1 text-left border rounded-xl px-3 py-2.5 text-sm transition-colors ${
                        uploadType === opt.value
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-background hover:bg-muted border-border/60"
                      }`}
                      data-testid={`upload-type-${opt.value}`}
                    >
                      <div className="flex items-center gap-1.5 font-semibold">{opt.icon}{opt.label}</div>
                      <p className={`text-[11px] mt-0.5 leading-snug ${uploadType === opt.value ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                        {opt.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Roster picker — only for Cooperative Archive mode */}
            {uploadType === "category_breakdown" && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Link to Payroll Roster *
                </label>
                {(rostersData?.rosters ?? []).length === 0 ? (
                  <div className="mt-1.5 flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      No payroll roster found for <strong>{selectedOrgCode} — {month} {year}</strong>.
                      Upload a <strong>Payroll Roster</strong> for this period first, then come back to upload the cooperative archive.
                    </span>
                  </div>
                ) : (
                  <select
                    className="w-full mt-1.5 border border-input rounded-xl px-3 py-2 text-sm bg-background h-10"
                    value={linkedPayrollUploadId ?? ""}
                    onChange={(e) => setLinkedPayrollUploadId(e.target.value ? Number(e.target.value) : null)}
                    data-testid="select-linked-roster"
                  >
                    <option value="">— Select a payroll roster —</option>
                    {(rostersData?.rosters ?? []).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.month} {r.year} · {r.rosterSize} active members · uploaded {new Date(r.createdAt).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

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
              disabled={
                !file || !organization || uploading || listSheets.isPending ||
                (uploadType === "category_breakdown" && !linkedPayrollUploadId)
              }
              className="w-full rounded-xl h-11"
              data-testid="button-upload-preview"
            >
              <Upload className="w-4 h-4 mr-2" />
              {uploading || listSheets.isPending
                ? "Uploading..."
                : uploadType === "category_breakdown" && !linkedPayrollUploadId
                ? "Select a payroll roster to continue"
                : "Upload & Continue"}
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
                {uploadType === "payroll_summary" ? (
                  <Badge className="rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20" variant="outline">
                    {previewData.totalRows} roster members
                  </Badge>
                ) : (
                  <>
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
                    {(previewData.rows ?? []).filter((r: any) => r.rosterStatus === "absent").length > 0 && (
                      <Badge className="rounded-full bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20" variant="outline">
                        {previewData.rows.filter((r: any) => r.rosterStatus === "absent").length} roster-skipped
                      </Badge>
                    )}
                  </>
                )}
              </div>
            </div>
            {/* Payroll roster mode — no transactions, just roster capture */}
            {uploadType === "payroll_summary" && (
              <div className="mt-3 flex items-start gap-2 text-xs text-sky-800 dark:text-sky-200 bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/30 rounded-xl p-3" data-testid="payroll-roster-banner">
                <ListChecks className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  <strong>Payroll Roster mode.</strong> This upload will save the active member list for {month} {year} — no transactions will be created.
                  Upload the cooperative archive sheet next and link it to this roster to process deductions.
                </span>
              </div>
            )}
            {/* Cooperative Archive mode — roster-gated */}
            {uploadType === "category_breakdown" && previewData.rosterGated && (
              <div className="mt-3 flex items-start gap-2 text-xs text-sky-800 dark:text-sky-200 bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/30 rounded-xl p-3" data-testid="roster-gated-banner">
                <Link2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  <strong>Cooperative Archive — roster gate active.</strong> Members not on the linked payroll roster will be skipped automatically
                  (shown as <span className="font-medium">Roster skip</span> below).
                </span>
              </div>
            )}
            {previewData.format === "payroll" && uploadType !== "payroll_summary" && (
              <div className="mt-3 flex items-start gap-2 text-xs text-sky-800 dark:text-sky-200 bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/30 rounded-xl p-3" data-testid="payroll-format-banner">
                <FileSpreadsheet className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  <strong>Payroll deduction file detected.</strong> Each member's single amount is split
                  automatically: outstanding loans and debts are repaid first, and the remainder goes to savings.
                  {typeof previewData.totalAmount === "number" && (
                    <> Sheet total: <span className="font-semibold tabular-nums">{formatCurrency(previewData.totalAmount)}</span>.</>
                  )}
                </span>
              </div>
            )}
            {previewData.format === "payroll" && (previewData.skippedRows?.length ?? 0) > 0 && (
              <div className="mt-3 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-3" data-testid="payroll-skipped-banner">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">
                    {previewData.skippedRows.length} row{previewData.skippedRows.length > 1 ? "s" : ""} in the sheet will NOT be processed:
                  </p>
                  <ul className="mt-1 list-disc list-inside space-y-0.5">
                    {previewData.skippedRows.map((s: any) => (
                      <li key={s.row}>
                        Row {s.row} — {s.name}: {s.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
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
                    {previewData.format === "payroll" && (
                      <th className="text-left p-2">Emp. No</th>
                    )}
                    <th className="text-left p-2 min-w-[140px] sticky left-0 bg-muted z-10">Name in File</th>
                    <th className="text-left p-2 min-w-[200px]">Matched Member</th>
                    <th className="text-left p-2">Org</th>
                    {previewData.format === "payroll" ? (
                      <>
                        <th className="text-right p-2">Amount</th>
                        <th className="text-right p-2">→ Loans/Debts</th>
                        <th className="text-right p-2">→ Savings</th>
                      </>
                    ) : (
                      <>
                        {CATEGORY_COLUMNS.map((c) => (
                          <th key={c.key} className="text-right p-2">{c.label}</th>
                        ))}
                        <th className="text-right p-2">Total</th>
                      </>
                    )}
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
                        {previewData.format === "payroll" && (
                          <td className="p-2 font-mono text-[11px]">{row.employeeNo ?? "—"}</td>
                        )}
                        <td className="p-2 font-medium">{row.rawName}</td>
                        <td className="p-2">
                          {isUnmatched ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1 flex-wrap">
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
                                {rejectedRows[row.rowNumber] && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 px-1 text-[10px] gap-0.5"
                                    onClick={() => handleRestoreMatch(row.rowNumber)}
                                    data-testid={`undo-reject-${row.rowNumber}`}
                                  >
                                    <Undo2 className="h-3 w-3" /> Undo
                                  </Button>
                                )}
                              </div>
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
                            <div className="flex items-center gap-1 flex-wrap">
                              <span>{row.matchedMemberName}</span>
                              {row.matchConfidence !== "exact" && (
                                <Badge variant="outline" className="text-[10px] py-0 px-1">
                                  {row.matchConfidence === "employeeNo" ? "emp. no" : row.matchConfidence}
                                </Badge>
                              )}
                              {(row.matchConfidence === "fuzzy" || row.matchConfidence === "manual") && (
                                <MatchCorrector
                                  rowNumber={row.rowNumber}
                                  matchedMemberId={row.matchedMemberId}
                                  suggestions={row.suggestions ?? []}
                                  memberOptions={memberOptions}
                                  onPick={(memberId) => handleAssignMember(row.rowNumber, memberId)}
                                  onReject={() => handleRejectMatch(row.rowNumber)}
                                />
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
                        {previewData.format === "payroll" ? (
                          <>
                            <td className="p-2 text-right font-medium tabular-nums">
                              {formatCurrency(row.amount ?? 0)}
                            </td>
                            <td className="p-2 text-right tabular-nums">
                              {(row.amount ?? 0) - (row.savings ?? 0) > 0
                                ? formatCurrency((row.amount ?? 0) - (row.savings ?? 0))
                                : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="p-2 text-right tabular-nums">
                              {(row.savings ?? 0) > 0
                                ? formatCurrency(row.savings)
                                : <span className="text-muted-foreground">—</span>}
                            </td>
                          </>
                        ) : (
                          <>
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
                          </>
                        )}
                        <td className="p-2 text-center">
                          {row.rosterStatus === "absent" ? (
                            <span title="Not on active payroll roster — will be skipped">
                              <Ban className="w-4 h-4 text-slate-400 mx-auto" />
                            </span>
                          ) : isUnmatched ? (
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
                  (previewData.format === "payroll" && previewData.errorRows > 0 && uploadType !== "payroll_summary") ||
                  (previewData.hasMismatchedTotals && !acknowledgeMismatch)
                }
                className="rounded-xl flex-1 min-w-[200px] h-11"
                data-testid="button-process-upload"
              >
                {process.isPending
                  ? "Processing..."
                  : previewData.hasDuplicateNames
                  ? "Fix duplicate names to continue"
                  : previewData.format === "payroll" && previewData.errorRows > 0 && uploadType !== "payroll_summary"
                  ? "Fix errors in the sheet to continue"
                  : previewData.hasMismatchedTotals && !acknowledgeMismatch
                  ? "Acknowledge mismatches to continue"
                  : uploadType === "payroll_summary"
                  ? `Save Roster — ${previewData.totalRows} Members`
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
                  <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                    <p className="font-semibold text-sm truncate">{record.month} {record.year}</p>
                    {record.uploadType === "payroll_summary" && (
                      <Badge variant="outline" className="rounded-full text-[10px] shrink-0 bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20">
                        Payroll Roster
                      </Badge>
                    )}
                    {record.uploadType === "category_breakdown" && (
                      <Badge variant="outline" className="rounded-full text-[10px] shrink-0 bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20">
                        Coop Archive
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
                  {record.organization} · By {record.uploaderName} · {formatDate(record.createdAt)}
                </p>
                <div className="flex gap-3 mt-2 text-[11px]">
                  {record.uploadType === "payroll_summary" ? (
                    <span className="text-muted-foreground">
                      <span className="font-bold text-foreground tabular-nums">{record.rowsProcessed}</span> roster members
                    </span>
                  ) : (
                    <>
                      <span className="text-muted-foreground">
                        <span className="font-bold text-foreground tabular-nums">{record.rowsProcessed}</span> processed
                      </span>
                      {record.rowsSkipped > 0 && (
                        <span className="text-destructive">
                          <span className="font-bold tabular-nums">{record.rowsSkipped}</span> skipped
                        </span>
                      )}
                    </>
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
