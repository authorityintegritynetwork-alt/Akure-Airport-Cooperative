import { useState } from "react";
import {
  useListBroadcasts,
  useCreateBroadcast,
  useGetBroadcast,
  getListBroadcastsQueryKey,
  getGetBroadcastQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";
import {
  Megaphone,
  Users,
  Mail,
  AlertTriangle,
  Wrench,
  ScrollText,
  Send,
  Eye,
} from "lucide-react";

const CATEGORIES = [
  { value: "announcement", label: "Announcement", icon: Megaphone },
  { value: "policy", label: "Policy", icon: ScrollText },
  { value: "maintenance", label: "Maintenance", icon: Wrench },
  { value: "urgent", label: "Urgent", icon: AlertTriangle },
] as const;

const ROLES = [
  { value: "member", label: "Members" },
  { value: "admin", label: "Admins" },
  { value: "financial_auditor", label: "Auditors" },
  { value: "treasurer", label: "Treasurers" },
  { value: "super_admin", label: "Super Admins" },
] as const;

function categoryStyles(category: string) {
  switch (category) {
    case "urgent":
      return {
        chip: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
        icon: AlertTriangle,
      };
    case "maintenance":
      return {
        chip: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
        icon: Wrench,
      };
    case "policy":
      return {
        chip: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900",
        icon: ScrollText,
      };
    default:
      return {
        chip: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
        icon: Megaphone,
      };
  }
}

function describeAudience(audience: any): string {
  if (!audience) return "—";
  if (audience.kind === "all") return "All users";
  if (audience.kind === "role") {
    const role = ROLES.find((r) => r.value === audience.role);
    return role ? role.label : audience.role;
  }
  if (audience.kind === "members")
    return `${audience.memberIds?.length ?? 0} member${
      audience.memberIds?.length === 1 ? "" : "s"
    }`;
  return "—";
}

export function AnnouncementsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: broadcasts, isLoading } = useListBroadcasts();
  const createBroadcast = useCreateBroadcast();

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<
    "announcement" | "policy" | "maintenance" | "urgent"
  >("announcement");
  const [audienceKind, setAudienceKind] = useState<"all" | "role">("all");
  const [audienceRole, setAudienceRole] = useState<string>("member");
  const [sendEmail, setSendEmail] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  function reset() {
    setTitle("");
    setMessage("");
    setCategory("announcement");
    setAudienceKind("all");
    setAudienceRole("member");
    setSendEmail(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      toast({
        title: "Missing details",
        description: "Title and message are required.",
        variant: "destructive",
      });
      return;
    }
    setConfirmOpen(true);
  }

  function doSend() {
    const audience: any =
      audienceKind === "all"
        ? { kind: "all" }
        : { kind: "role", role: audienceRole };

    createBroadcast.mutate(
      {
        data: {
          title: title.trim(),
          message: message.trim(),
          category,
          audience,
          sendEmail,
        },
      },
      {
        onSuccess: (resp: any) => {
          toast({
            title: "Broadcast sent",
            description: `${resp.recipientCount} recipient${
              resp.recipientCount === 1 ? "" : "s"
            } notified.`,
          });
          reset();
          setConfirmOpen(false);
          queryClient.invalidateQueries({
            queryKey: getListBroadcastsQueryKey(),
          });
        },
        onError: (err: any) => {
          toast({
            title: "Send failed",
            description: err?.message ?? "Could not send the broadcast.",
            variant: "destructive",
          });
          setConfirmOpen(false);
        },
      },
    );
  }

  const audienceLabel =
    audienceKind === "all"
      ? "Everyone"
      : ROLES.find((r) => r.value === audienceRole)?.label ?? audienceRole;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary to-blue-500 text-primary-foreground flex items-center justify-center shadow-md shadow-primary/25 shrink-0">
          <Megaphone className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold leading-tight">
            Announcements
          </h1>
          <p className="text-sm text-muted-foreground">
            Send broadcast messages to members and staff.
          </p>
        </div>
      </div>

      <Card className="rounded-2xl border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">New broadcast</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-1.5">
                <Label htmlFor="bc-title">Title</Label>
                <Input
                  id="bc-title"
                  value={title}
                  maxLength={200}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. New loan rates effective May 1"
                  data-testid="input-broadcast-title"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={category}
                  onValueChange={(v) => setCategory(v as typeof category)}
                >
                  <SelectTrigger data-testid="select-broadcast-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        <span className="inline-flex items-center gap-2">
                          <c.icon className="w-3.5 h-3.5" /> {c.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bc-message">Message</Label>
              <Textarea
                id="bc-message"
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write the body of the announcement..."
                data-testid="input-broadcast-message"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Audience</Label>
                <Select
                  value={audienceKind}
                  onValueChange={(v) =>
                    setAudienceKind(v as "all" | "role")
                  }
                >
                  <SelectTrigger data-testid="select-audience-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Everyone</SelectItem>
                    <SelectItem value="role">A specific role</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {audienceKind === "role" && (
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select value={audienceRole} onValueChange={setAudienceRole}>
                    <SelectTrigger data-testid="select-audience-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-end gap-2">
                <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2.5 w-full">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <Label htmlFor="bc-email" className="flex-1 cursor-pointer">
                    Also email recipients
                  </Label>
                  <Switch
                    id="bc-email"
                    checked={sendEmail}
                    onCheckedChange={setSendEmail}
                    data-testid="switch-send-email"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Audience:{" "}
                <span className="font-medium text-foreground">
                  {audienceLabel}
                </span>
              </p>
              <Button
                type="submit"
                className="rounded-full gap-1.5"
                disabled={createBroadcast.isPending}
                data-testid="button-send-broadcast"
              >
                <Send className="w-4 h-4" />
                {createBroadcast.isPending ? "Sending..." : "Send broadcast"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-base font-semibold mb-3">Recent broadcasts</h2>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-2xl" />
            ))}
          </div>
        ) : !broadcasts || broadcasts.length === 0 ? (
          <Card className="rounded-2xl border-border/60">
            <CardContent className="py-10 text-center">
              <p className="text-sm text-muted-foreground">
                No broadcasts yet — your first announcement will appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {broadcasts.map((b: any) => {
              const styles = categoryStyles(b.category);
              const Icon = styles.icon;
              const readPct = b.recipientCount
                ? Math.round((b.readCount / b.recipientCount) * 100)
                : 0;
              return (
                <Card
                  key={b.id}
                  className="rounded-2xl border-border/60 shadow-sm hover-elevate active-elevate-2 cursor-pointer transition"
                  onClick={() => setDetailId(b.id)}
                  data-testid={`broadcast-row-${b.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${styles.chip}`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-sm leading-snug truncate">
                            {b.title}
                          </p>
                          <Badge
                            variant="outline"
                            className={`shrink-0 text-[10px] uppercase tracking-wide ${styles.chip}`}
                          >
                            {b.category}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-snug">
                          {b.message}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Users className="w-3 h-3" />{" "}
                            {describeAudience(b.audience)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            {b.readCount}/{b.recipientCount} read · {readPct}%
                          </span>
                          {b.sendEmail && (
                            <span className="inline-flex items-center gap-1">
                              <Mail className="w-3 h-3" /> emailed
                            </span>
                          )}
                          <span>{formatDate(b.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send this broadcast?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              <span className="text-muted-foreground">Title:</span>{" "}
              <span className="font-medium">{title}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Audience:</span>{" "}
              <span className="font-medium">{audienceLabel}</span>
            </p>
            {sendEmail && (
              <p className="text-xs inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                <Mail className="w-3.5 h-3.5" /> Recipients will also receive an
                email.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              You can't edit a broadcast after sending.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={createBroadcast.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={doSend}
              disabled={createBroadcast.isPending}
              data-testid="button-confirm-send-broadcast"
            >
              {createBroadcast.isPending ? "Sending..." : "Send"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <BroadcastDetailDialog
        id={detailId}
        onClose={() => setDetailId(null)}
        queryClient={queryClient}
      />
    </div>
  );
}

function BroadcastDetailDialog({
  id,
  onClose,
}: {
  id: number | null;
  onClose: () => void;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const { data, isLoading } = useGetBroadcast(id ?? 0, {
    query: {
      enabled: id !== null,
      queryKey: id !== null ? getGetBroadcastQueryKey(id) : ["broadcast-disabled"],
    },
  });

  const styles = data ? categoryStyles(data.category) : categoryStyles("");
  const Icon = styles.icon;

  return (
    <Dialog open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {isLoading || !data ? (
          <div className="py-10 text-center text-muted-foreground text-sm">
            Loading...
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-start gap-3">
                <div
                  className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${styles.chip}`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <DialogTitle className="text-base">{data.title}</DialogTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Sent by {data.senderName ?? "—"} ·{" "}
                    {formatDate(data.createdAt)}
                  </p>
                </div>
              </div>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-xl bg-muted/40 p-3 text-sm whitespace-pre-wrap">
                {data.message}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border bg-card p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Recipients
                  </p>
                  <p className="text-lg font-semibold mt-1">
                    {data.recipientCount}
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Read
                  </p>
                  <p className="text-lg font-semibold mt-1">{data.readCount}</p>
                </div>
                <div className="rounded-xl border bg-card p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Read %
                  </p>
                  <p className="text-lg font-semibold mt-1">
                    {data.recipientCount
                      ? Math.round((data.readCount / data.recipientCount) * 100)
                      : 0}
                    %
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold mb-2">Recipients</p>
                <div className="rounded-xl border max-h-72 overflow-y-auto divide-y">
                  {(data as any).recipients?.map((r: any) => (
                    <div
                      key={r.memberId}
                      className="flex items-center justify-between px-3 py-2 text-sm"
                    >
                      <span className="truncate">{r.memberName}</span>
                      {r.isRead ? (
                        <Badge variant="secondary" className="text-[10px]">
                          Read
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          Unread
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {data.sendEmail && (
                <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" /> Email delivery was attempted
                  for recipients with an address on file.
                </p>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Suppress unused import lint
void Checkbox;
