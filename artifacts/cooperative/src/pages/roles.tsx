import { useState } from "react";
import {
  useListMembers,
  useUpdateMember,
  getListMembersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  { value: "financial_auditor", label: "Financial Auditor" },
  { value: "treasurer", label: "Treasurer" },
  { value: "super_admin", label: "Super Admin" },
];

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
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-2">
        <UserCog className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">Role Management</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Members</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : !members || members.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No active members found.</div>
          ) : (
            <div className="divide-y">
              {members.map((member: any) => (
                <div key={member.id} className="flex items-center justify-between px-4 py-3" data-testid={`role-row-${member.id}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                      {member.fullName.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{member.fullName}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                  <Select
                    value={member.role}
                    onValueChange={(v) => handleRoleChange(member.id, v)}
                  >
                    <SelectTrigger className="w-44" data-testid={`select-role-${member.id}`}>
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
        </CardContent>
      </Card>
    </div>
  );
}
