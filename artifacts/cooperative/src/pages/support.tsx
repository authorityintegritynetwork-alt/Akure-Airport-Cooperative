import { useEffect, useState, useRef } from "react";
import {
  useListSupportTickets,
  useCreateSupportTicket,
  useGetSupportTicket,
  useAddSupportTicketMessage,
  useGetProfile,
  getListSupportTicketsQueryKey,
  getGetSupportTicketQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";
import {
  HeadphonesIcon,
  Plus,
  MessageSquare,
  ArrowLeft,
  Send,
  ShieldCheck,
} from "lucide-react";

const CATEGORIES = [
  { value: "loan", label: "Loans" },
  { value: "deduction", label: "Salary deductions" },
  { value: "account", label: "My account" },
  { value: "store", label: "Store" },
  { value: "general", label: "General question" },
] as const;

const PRIORITIES = [
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
] as const;

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
    label: "Waiting on you",
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

export function SupportPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: profile } = useGetProfile();
  const { data: tickets, isLoading } = useListSupportTickets({});

  const [openId, setOpenId] = useState<number | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  const [subject, setSubject] = useState("");
  const [category, setCategory] =
    useState<(typeof CATEGORIES)[number]["value"]>("general");
  const [priority, setPriority] =
    useState<(typeof PRIORITIES)[number]["value"]>("normal");
  const [body, setBody] = useState("");
  const create = useCreateSupportTicket();

  function reset() {
    setSubject("");
    setCategory("general");
    setPriority("normal");
    setBody("");
  }

  function submitNew(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) {
      toast({
        title: "Add a subject and a message",
        variant: "destructive",
      });
      return;
    }
    create.mutate(
      {
        data: {
          subject: subject.trim(),
          category,
          priority,
          body: body.trim(),
        },
      },
      {
        onSuccess: (resp: any) => {
          toast({
            title: "Ticket opened",
            description: "An admin will get back to you shortly.",
          });
          reset();
          setComposeOpen(false);
          queryClient.invalidateQueries({
            queryKey: getListSupportTicketsQueryKey({}),
          });
          setOpenId(resp.id);
        },
        onError: (err: any) => {
          toast({
            title: "Could not create ticket",
            description: err?.message ?? "Try again.",
            variant: "destructive",
          });
        },
      },
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary to-blue-500 text-primary-foreground flex items-center justify-center shadow-md shadow-primary/25 shrink-0">
            <HeadphonesIcon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold leading-tight">
              Support
            </h1>
            <p className="text-xs text-muted-foreground">
              Message the cooperative office about your account, loans, or
              deductions.
            </p>
          </div>
        </div>
        <Button
          className="rounded-full gap-1.5 shrink-0"
          onClick={() => setComposeOpen(true)}
          data-testid="button-new-ticket"
        >
          <Plus className="w-4 h-4" /> New ticket
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : !tickets || tickets.length === 0 ? (
        <Card className="rounded-2xl border-border/60">
          <CardContent className="py-12 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <MessageSquare className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No tickets yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Open one if you have a question or need help with anything.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tickets.map((t: any) => {
            const status = STATUS_LABEL[t.status] ?? STATUS_LABEL.open;
            return (
              <Card
                key={t.id}
                className="rounded-2xl border-border/60 shadow-sm hover-elevate active-elevate-2 cursor-pointer transition"
                onClick={() => setOpenId(t.id)}
                data-testid={`ticket-row-${t.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <MessageSquare className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-sm leading-snug truncate">
                          {t.subject}
                        </p>
                        <Badge className={`${status.cls} shrink-0 border-0`}>
                          {status.label}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1 capitalize">
                        {t.category} · {t.messageCount} message
                        {t.messageCount === 1 ? "" : "s"} ·{" "}
                        {formatDate(t.lastMessageAt)}
                      </p>
                    </div>
                    {t.unreadForViewer && (
                      <span className="w-2 h-2 rounded-full bg-rose-500 mt-1 shrink-0" />
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New support ticket</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitNew} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="t-sub">Subject</Label>
              <Input
                id="t-sub"
                value={subject}
                maxLength={200}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Short summary"
                data-testid="input-ticket-subject"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={category}
                  onValueChange={(v) => setCategory(v as typeof category)}
                >
                  <SelectTrigger data-testid="select-ticket-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select
                  value={priority}
                  onValueChange={(v) => setPriority(v as typeof priority)}
                >
                  <SelectTrigger data-testid="select-ticket-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-body">Message</Label>
              <Textarea
                id="t-body"
                rows={5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Tell us what's going on..."
                data-testid="input-ticket-body"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setComposeOpen(false)}
                disabled={create.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={create.isPending}
                data-testid="button-submit-ticket"
              >
                {create.isPending ? "Opening..." : "Open ticket"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <TicketThreadDialog
        id={openId}
        viewerMemberId={profile?.id ?? null}
        viewerIsAdmin={false}
        onClose={() => setOpenId(null)}
      />
    </div>
  );
}

export function TicketThreadDialog({
  id,
  viewerMemberId,
  viewerIsAdmin,
  onClose,
  showStatusControl,
}: {
  id: number | null;
  viewerMemberId: number | null;
  viewerIsAdmin: boolean;
  onClose: () => void;
  showStatusControl?: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useGetSupportTicket(id ?? 0, {
    query: {
      enabled: id !== null,
      queryKey:
        id !== null ? getGetSupportTicketQueryKey(id) : ["ticket-disabled"],
    },
  });

  const addMessage = useAddSupportTicketMessage();
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (id !== null) {
      setReply("");
      setInternal(false);
    }
  }, [id]);

  useEffect(() => {
    if (data && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [data?.messages?.length]);

  // Mark as read when opened: refetch on open invalidates the
  // notifications + ticket list (server clears unread on GET).
  useEffect(() => {
    if (id !== null && data) {
      queryClient.invalidateQueries({
        queryKey: getListSupportTicketsQueryKey({}),
      });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, data?.id]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim() || id === null) return;
    addMessage.mutate(
      {
        id,
        data: { body: reply.trim(), isInternalNote: internal },
      },
      {
        onSuccess: () => {
          setReply("");
          setInternal(false);
          queryClient.invalidateQueries({
            queryKey: getGetSupportTicketQueryKey(id),
          });
          queryClient.invalidateQueries({
            queryKey: getListSupportTicketsQueryKey({}),
          });
        },
        onError: (err: any) => {
          toast({
            title: "Could not send",
            description: err?.message ?? "Try again.",
            variant: "destructive",
          });
        },
      },
    );
  }

  const status = data
    ? STATUS_LABEL[data.status] ?? STATUS_LABEL.open
    : null;
  const isClosed = data?.status === "closed";

  return (
    <Dialog open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
        {isLoading || !data ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : (
          <>
            <DialogHeader className="px-5 pt-5 pb-3 border-b">
              <div className="flex items-start gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="md:hidden -ml-2 h-8 w-8 p-0 shrink-0"
                  onClick={onClose}
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <div className="flex-1 min-w-0">
                  <DialogTitle className="text-base leading-snug truncate">
                    {data.subject}
                  </DialogTitle>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <Badge className={`${status!.cls} border-0 text-[10px]`}>
                      {status!.label}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="text-[10px] capitalize"
                    >
                      {data.category}
                    </Badge>
                    {data.priority !== "normal" && (
                      <Badge
                        variant="outline"
                        className={`text-[10px] capitalize ${
                          data.priority === "urgent"
                            ? "border-rose-300 text-rose-700"
                            : "border-amber-300 text-amber-700"
                        }`}
                      >
                        {data.priority}
                      </Badge>
                    )}
                    {viewerIsAdmin && (
                      <span className="text-[11px] text-muted-foreground">
                        from <strong>{data.memberName}</strong>
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {showStatusControl}
            </DialogHeader>

            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-muted/20"
            >
              {data.messages.map((m: any) => {
                const mine = viewerMemberId === m.senderMemberId;
                const isAdminMsg =
                  m.senderRole === "admin" ||
                  m.senderRole === "super_admin" ||
                  m.senderRole === "treasurer" ||
                  m.senderRole === "financial_auditor";
                return (
                  <div
                    key={m.id}
                    className={`flex ${mine ? "justify-end" : "justify-start"}`}
                    data-testid={`ticket-message-${m.id}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 shadow-sm ${
                        m.isInternalNote
                          ? "bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-100"
                          : mine
                            ? "bg-primary text-primary-foreground"
                            : "bg-card border border-border"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[11px] font-semibold opacity-90">
                          {mine ? "You" : m.senderName}
                        </span>
                        {isAdminMsg && !mine && (
                          <ShieldCheck className="w-3 h-3 opacity-80" />
                        )}
                        {m.isInternalNote && (
                          <span className="text-[10px] uppercase tracking-wider font-bold opacity-80">
                            internal note
                          </span>
                        )}
                      </div>
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {m.body}
                      </p>
                      <p
                        className={`text-[10px] mt-1 ${
                          mine && !m.isInternalNote
                            ? "text-primary-foreground/70"
                            : "text-muted-foreground"
                        }`}
                      >
                        {formatDate(m.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {!isClosed ? (
              <form
                onSubmit={send}
                className="border-t p-3 space-y-2 bg-card"
              >
                <Textarea
                  rows={2}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder={
                    internal
                      ? "Internal note (only admins can see this)"
                      : "Type your reply..."
                  }
                  disabled={addMessage.isPending}
                  data-testid="input-ticket-reply"
                />
                <div className="flex items-center justify-between gap-2">
                  {viewerIsAdmin ? (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={internal}
                        onChange={(e) => setInternal(e.target.checked)}
                        className="accent-amber-500"
                        data-testid="checkbox-internal-note"
                      />
                      Internal note
                    </label>
                  ) : (
                    <span />
                  )}
                  <Button
                    type="submit"
                    size="sm"
                    className="rounded-full gap-1.5"
                    disabled={!reply.trim() || addMessage.isPending}
                    data-testid="button-send-reply"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {addMessage.isPending ? "Sending..." : "Send"}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="border-t p-3 text-xs text-center text-muted-foreground bg-card">
                This ticket is closed.
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
