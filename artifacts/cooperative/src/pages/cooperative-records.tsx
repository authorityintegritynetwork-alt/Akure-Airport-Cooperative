import { useState } from "react";
import {
  useListCooperativeRecords,
  useListOrganizations,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { Search, FileSpreadsheet } from "lucide-react";
import { Link } from "wouter";

export function CooperativeRecordsPage() {
  const [search, setSearch] = useState("");
  const [orgFilter, setOrgFilter] = useState<string>("");

  const { data: organizations } = useListOrganizations();
  const activeOrgs = (organizations ?? []).filter((o: any) => o.isActive);

  const params: any = {};
  if (search) params.search = search;
  if (orgFilter) params.organization = orgFilter;

  const { data: records, isLoading } = useListCooperativeRecords(params, {
    query: { queryKey: ["listCooperativeRecords", search, orgFilter] },
  });

  const totalCount = records?.length ?? 0;

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div data-testid="coop-records-hero-card">
        <div className="flex items-center gap-2 mb-1">
          <FileSpreadsheet className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-bold">Cooperative Records</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold tabular-nums">{totalCount}</span>{" "}
          {totalCount === 1 ? "person" : "people"} with balances on file who haven't created an app account yet.
          They appear in Members once they sign up and are approved.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search records..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 rounded-xl"
            data-testid="input-coop-records-search"
          />
        </div>
        <Select value={orgFilter || "all"} onValueChange={(v) => setOrgFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-36 rounded-xl" data-testid="select-coop-org-filter">
            <SelectValue placeholder="Organization" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Orgs</SelectItem>
            {activeOrgs.map((o: any) => (
              <SelectItem key={o.code} value={o.code}>
                {o.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
        </div>
      ) : !records || records.length === 0 ? (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="text-center py-16 text-muted-foreground">
            <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">
              {search || orgFilter ? "No records match your filters" : "No cooperative records"}
            </p>
            <p className="text-sm mt-1">
              Records are created from opening balances and deduction uploads.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {records.map((r: any) => (
            <Link key={r.id} href={`/members/${r.id}`}>
              <div
                className="rounded-2xl border border-border/70 bg-card p-3 sm:p-4 shadow-sm hover:border-primary/40 hover:shadow-md transition-all cursor-pointer"
                data-testid={`coop-record-${r.id}`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-400 to-slate-600 text-white flex items-center justify-center font-bold shrink-0 shadow-sm">
                    {r.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate hover:text-primary transition-colors">{r.fullName}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <Badge variant="outline" className="text-[10px] uppercase rounded-full px-2">
                        {r.organization || "—"}
                      </Badge>
                      {r.staffId && (
                        <Badge variant="outline" className="text-[10px] rounded-full px-2">
                          ID {r.staffId}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-[10px] rounded-full px-2">
                        No app account
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                      Savings
                    </p>
                    <p className="text-sm font-bold tabular-nums">
                      {formatCurrency(r.savingsBalance)}
                    </p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
