import {
  useListMembers,
  useUpdateMember,
  getListMembersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useStepUpAction } from "@/lib/step-up";
import { UserCog } from "lucide-react";

const ROLES = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
  { value: "financial_auditor", label: "Auditor" },
  { value: "treasurer", label: "Treasurer" },
  { value: "super_admin", label: "Super Admin" },
];

const ROLE_TONE: Record<string, string> = {
  member: "bg-muted text-muted-foreground",
  admin: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  financial_auditor: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  treasurer: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  super_admin: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

export function RolesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: members, isLoading } = useListMembers({ status: "active" }, {
    query: { queryKey: getListMembersQueryKey({ status: "active" }) },
  });
  const updateMember = useUpdateMember();
  const updateMemberWithStepUp = useStepUpAction(
    (id: number, role: string) => updateMember.mutateAsync({ id, data: { role: role as any } }),
  );

  async function handleRoleChange(memberId: number, newRole: string) {
    try {
      await updateMemberWithStepUp(memberId, newRole);
      toast({ title: "Role updated" });
      queryClient.invalidateQueries({ queryKey: getListMembersQueryKey({}) });
    } catch (err: any) {
      if (err?.cancelled) return;
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-3xl p-5 sm:p-6 text-white shadow-xl shadow-primary/20"
        style={{
          background:
            "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(220 80% 35%) 45%, hsl(200 85% 45%) 100%)",
        }}
        data-testid="roles-hero"
      >
        <div className="absolute -top-12 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 -left-8 w-56 h-56 rounded-full bg-white/5 blur-3xl" />
        <div className="relative">
          <p className="text-xs sm:text-sm text-white/80 font-medium uppercase tracking-wider">
            Role Management
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold mt-0.5 tabular-nums">
            {members?.length ?? 0}
          </h1>
          <p className="text-xs text-white/80 mt-1">Active members</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
        </div>
      ) : !members || members.length === 0 ? (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="text-center py-16 text-muted-foreground">
            <UserCog className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No active members found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {members.map((member: any) => (
            <div
              key={member.id}
              className="rounded-2xl border border-border/70 bg-card shadow-sm p-3 sm:p-4 flex items-center gap-3"
              data-testid={`role-row-${member.id}`}
            >
              <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                {member.fullName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm truncate">{member.fullName}</p>
                <p className="text-[11px] text-muted-foreground truncate">{member.email}</p>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 mt-1 text-[10px] font-semibold uppercase tracking-wide ${
                    ROLE_TONE[member.role] || "bg-muted text-muted-foreground"
                  }`}
                >
                  {member.role.replace(/_/g, " ")}
                </span>
              </div>
              <Select
                value={member.role}
                onValueChange={(v) => handleRoleChange(member.id, v)}
              >
                <SelectTrigger
                  className="w-[140px] sm:w-44 rounded-xl shrink-0"
                  data-testid={`select-role-${member.id}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
