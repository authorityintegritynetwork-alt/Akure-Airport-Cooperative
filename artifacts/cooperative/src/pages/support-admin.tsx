import { useState } from "react";
import {
  useListSupportTickets,
  useGetSupportStats,
  useUpdateSupportTicket,
  useGetProfile,
  getListSupportTicketsQueryKey,
  getGetSupportStatsQueryKey,
  getGetSupportTicketQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";
import {
  HeadphonesIcon,
  Inbox,
  ChevronRight,
  AlertTriangle,
  Clock,
  UserCheck,
  CheckCircle2,
  UserPlus,
} from "lucide-react";
import { TicketThreadDialog } from "./support";

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  open: {
    label: "Open",
    cls: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  },
  in_progress: {
    label: "In progress",
    cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  },
  waiting_member: {
    label: "Waiting member",
    cls: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  },
  resolved: {
    label: "Resolved",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  closed: {
    label: "Closed",
    cls: "bg-muted text-muted-foreground",
  },
};

const STATUS_ORDER: ReadonlyArray<keyof typeof STATUS_LABEL> = [
  "open",
  "in_progress",
  "waiting_member",
  "resolved",
  "closed",
];

const ASSIGNEE_OPTIONS = [
  { value: "any", label: "All tickets" },
  { value: "me", label: "Assigned to me" },
  { value: "unassigned", label: "Unassigned" },
] as const;

const CATEGORY_OPTIONS = [
  { value: "all", label: "All categories" },
  { value: "loan", label: "Loans" },
  { value: "deduction", label: "Deductions" },
  { value: "account", label: "Account" },
  { value: "store", label: "Store" },
  { value: "general", label: "General" },
] as const;

export function SupportAdminPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: profile } = useGetProfile();

  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("any");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [openId, setOpenId] = useState<number | null>(null);

  const queryParams: any = {};
  if (statusFilter !== "all") queryParams.status = statusFilter;
  if (assigneeFilter !== "any") queryParams.assignee = assigneeFilter;
  if (categoryFilter !== "all") queryParams.category = categoryFilter;

  const { data: tickets, isLoading } = useListSupportTickets(queryParams);
  const { data: stats } = useGetSupportStats();
  const updateTicket = useUpdateSupportTicket();

  function invalidateAll() {
    queryClient.invalidateQueries({
      queryKey: getListSupportTicketsQueryKey(),
    });
    queryClient.invalidateQueries({ queryKey: getGetSupportStatsQueryKey() });
  }

  function changeStatus(id: number, status: string) {
    const listPrefix = getListSupportTicketsQueryKey()[0];
    const detailKey = getGetSupportTicketQueryKey(id);
    // Snapshot every active list-query variant (filtered by status/assignee/category)
    // so we can roll back precisely on error.
    const prevLists = queryClient.getQueriesData<any[]>({ queryKey: [listPrefix] });
    const prevDetail = queryClient.getQueryData<any>(detailKey);

    queryClient.setQueriesData<any[]>({ queryKey: [listPrefix] }, (old) =>
      old?.map((t) => (t.id === id ? { ...t, status } : t)),
    );
    if (prevDetail) {
      queryClient.setQueryData(detailKey, { ...prevDetail, status });
    }

    updateTicket.mutate(
      { id, data: { status: status as any } },
      {
        onSuccess: () => {
          toast({ title: `Marked ${STATUS_LABEL[status]?.label ?? status}` });
          invalidateAll();
          queryClient.invalidateQueries({ queryKey: detailKey });
        },
        onError: (err: any) => {
          for (const [k, v] of prevLists) queryClient.setQueryData(k, v);
          if (prevDetail) queryClient.setQueryData(detailKey, prevDetail);
          toast({
            title: "Update failed",
            description: err?.message,
            variant: "destructive",
          });
        },
      },
    );
  }

  function assignToMe(id: number) {
    if (!profile) return;
    updateTicket.mutate(
      { id, data: { assignedToMemberId: profile.id } },
      {
        onSuccess: () => {
          toast({ title: "Assigned to you" });
          invalidateAll();
          queryClient.invalidateQueries({
            queryKey: getGetSupportTicketQueryKey(id),
          });
        },
      },
    );
  }

  const openTicket = tickets?.find((t: any) => t.id === openId) as any;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary to-blue-500 text-primary-foreground flex items-center justify-center shadow-md shadow-primary/25 shrink-0">
          <HeadphonesIcon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold leading-tight">
            Support queue
          </h1>
          <p className="text-xs text-muted-foreground">
            Triage and respond to member tickets.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <StatTile
          icon={<Inbox className="w-4 h-4" />}
          label="Open"
          value={stats?.open ?? 0}
          tone="blue"
        />
        <StatTile
          icon={<Clock className="w-4 h-4" />}
          label="In progress"
          value={stats?.inProgress ?? 0}
          tone="amber"
        />
        <StatTile
          icon={<UserCheck className="w-4 h-4" />}
          label="Waiting member"
          value={stats?.waitingMember ?? 0}
          tone="violet"
        />
        <StatTile
          icon={<CheckCircle2 className="w-4 h-4" />}
          label="Resolved"
          value={stats?.resolved ?? 0}
          tone="emerald"
        />
        <StatTile
          icon={<UserPlus className="w-4 h-4" />}
          label="Unassigned"
          value={stats?.unassigned ?? 0}
          tone="slate"
        />
        <StatTile
          icon={<AlertTriangle className="w-4 h-4" />}
          label="Urgent"
          value={stats?.urgent ?? 0}
          tone="rose"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger
            className="w-[170px]"
            data-testid="filter-support-status"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_ORDER.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
          <SelectTrigger
            className="w-[180px]"
            data-testid="filter-support-assignee"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ASSIGNEE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger
            className="w-[180px]"
            data-testid="filter-support-category"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : !tickets || tickets.length === 0 ? (
        <Card className="rounded-2xl border-border/60">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No tickets match the current filters.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl border-border/60 shadow-sm overflow-hidden">
          <ul className="divide-y">
            {tickets.map((t: any) => {
              const status = STATUS_LABEL[t.status] ?? STATUS_LABEL.open;
              const isMine = t.assignedToMemberId === profile?.id;
              return (
                <li
                  key={t.id}
                  className="px-4 py-3 hover-elevate active-elevate-2 cursor-pointer transition flex items-center gap-3"
                  onClick={() => setOpenId(t.id)}
                  data-testid={`admin-ticket-row-${t.id}`}
                >
                  <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <HeadphonesIcon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm truncate">
                        {t.subject}
                      </p>
                      {t.unreadForViewer && (
                        <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                      )}
                      {t.priority === "urgent" && (
                        <Badge
                          variant="outline"
                          className="border-rose-300 text-rose-700 text-[10px]"
                        >
                          urgent
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {t.memberName} · {t.category} ·{" "}
                      {formatDate(t.lastMessageAt)}
                      {t.assignedToName && (
                        <>
                          {" · "}
                          assigned to {isMine ? "you" : t.assignedToName}
                        </>
                      )}
                      {!t.assignedToMemberId && " · unassigned"}
                    </p>
                  </div>
                  <Badge
                    className={`${status.cls} border-0 shrink-0 text-[10px]`}
                  >
                    {status.label}
                  </Badge>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <TicketThreadDialog
        id={openId}
        viewerMemberId={profile?.id ?? null}
        viewerIsAdmin={true}
        onClose={() => setOpenId(null)}
        showStatusControl={
          openTicket && (
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Select
                value={openTicket.status}
                onValueChange={(v) => changeStatus(openTicket.id, v)}
              >
                <SelectTrigger
                  className="w-[160px] h-8"
                  data-testid="admin-ticket-status-select"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABEL[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {openTicket.assignedToMemberId !== profile?.id && (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full h-8 gap-1.5"
                  onClick={() => assignToMe(openTicket.id)}
                  disabled={updateTicket.isPending}
                  data-testid="admin-ticket-assign-me"
                >
                  <UserPlus className="w-3.5 h-3.5" /> Assign to me
                </Button>
              )}
            </div>
          )
        }
      />
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "blue" | "amber" | "violet" | "emerald" | "slate" | "rose";
}) {
  const toneCls: Record<typeof tone, string> = {
    blue: "from-blue-500/15 to-blue-500/5 text-blue-700 dark:text-blue-300",
    amber:
      "from-amber-500/15 to-amber-500/5 text-amber-700 dark:text-amber-300",
    violet:
      "from-violet-500/15 to-violet-500/5 text-violet-700 dark:text-violet-300",
    emerald:
      "from-emerald-500/15 to-emerald-500/5 text-emerald-700 dark:text-emerald-300",
    slate:
      "from-slate-500/15 to-slate-500/5 text-slate-700 dark:text-slate-300",
    rose: "from-rose-500/15 to-rose-500/5 text-rose-700 dark:text-rose-300",
  } as any;
  return (
    <div
      className={`rounded-2xl border border-border/60 bg-gradient-to-br ${toneCls[tone]} p-3 flex flex-col gap-1`}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider opacity-90">
        {icon}
        <span className="font-semibold">{label}</span>
      </div>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}
