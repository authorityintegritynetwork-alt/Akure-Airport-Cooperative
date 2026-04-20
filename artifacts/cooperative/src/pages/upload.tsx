import { useState } from "react";
import {
  usePreviewExcelUpload,
  useProcessExcelUpload,
  useListUploadHistory,
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
import { Upload, CheckCircle, AlertCircle, FileSpreadsheet } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [month, setMonth] = useState(MONTHS[new Date().getMonth()]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [uploading, setUploading] = useState(false);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const preview = usePreviewExcelUpload();
  const process = useProcessExcelUpload();

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

      preview.mutate(
        { data: { fileObjectPath: objectPath, month, year } },
        {
          onSuccess: (data) => {
            setPreviewData(data);
          },
          onError: (err: any) => {
            toast({ title: "Preview failed", description: err.message, variant: "destructive" });
          },
        },
      );
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  function handleProcess(skipErrors = false) {
    if (!uploadedPath) return;
    process.mutate(
      { data: { fileObjectPath: uploadedPath, month, year, skipErrors } },
      {
        onSuccess: (result) => {
          toast({
            title: "Upload processed",
            description: `${result.rowsProcessed} rows processed, ${result.rowsSkipped} skipped.`,
          });
          queryClient.invalidateQueries({ queryKey: getListUploadHistoryQueryKey() });
          setPreviewData(null);
          setUploadedPath(null);
          setFile(null);
        },
        onError: (err: any) => {
          toast({ title: "Processing failed", description: err.message, variant: "destructive" });
        },
      },
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold">Upload Monthly Deductions</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Upload Excel File
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
            disabled={!file || uploading || preview.isPending}
            data-testid="button-upload-preview"
          >
            <Upload className="w-4 h-4 mr-2" />
            {uploading || preview.isPending ? "Processing..." : "Upload & Preview"}
          </Button>
        </CardContent>
      </Card>

      {previewData && (
        <Card>
          <CardHeader>
            <CardTitle>Preview: {previewData.summary.totalRows} rows found</CardTitle>
            <div className="flex gap-2 text-sm text-muted-foreground">
              <span className="text-primary font-medium">{previewData.summary.matched} matched</span>
              {previewData.summary.unmatched > 0 && (
                <span className="text-destructive font-medium">{previewData.summary.unmatched} unmatched</span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-auto max-h-80 border rounded">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left p-2">Row</th>
                    <th className="text-left p-2">Name in File</th>
                    <th className="text-left p-2">Matched Member</th>
                    <th className="text-right p-2">Savings</th>
                    <th className="text-right p-2">Loan Repayment</th>
                    <th className="text-center p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.rows.map((row: any) => (
                    <tr
                      key={row.rowIndex}
                      className={row.matched ? "" : "bg-destructive/5"}
                      data-testid={`preview-row-${row.rowIndex}`}
                    >
                      <td className="p-2 text-muted-foreground">{row.rowIndex}</td>
                      <td className="p-2 font-medium">{row.name}</td>
                      <td className="p-2">{row.memberName || <span className="text-destructive text-xs">{row.errors[0]}</span>}</td>
                      <td className="p-2 text-right">{row.savings > 0 ? formatCurrency(row.savings) : "-"}</td>
                      <td className="p-2 text-right">{row.loanRepayment > 0 ? formatCurrency(row.loanRepayment) : "-"}</td>
                      <td className="p-2 text-center">
                        {row.matched ? (
                          <CheckCircle className="w-4 h-4 text-primary mx-auto" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-destructive mx-auto" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => handleProcess(false)}
                disabled={process.isPending || previewData.summary.unmatched > 0}
                data-testid="button-process-upload"
              >
                Process All Matched Rows
              </Button>
              {previewData.summary.unmatched > 0 && (
                <Button
                  variant="outline"
                  onClick={() => handleProcess(true)}
                  disabled={process.isPending}
                  data-testid="button-process-skip-errors"
                >
                  Process & Skip {previewData.summary.unmatched} Unmatched
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
                      By {record.uploadedByName} &bull; {formatDate(record.createdAt)}
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
