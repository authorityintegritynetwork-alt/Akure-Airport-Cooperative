import { useState } from "react";
import { Link } from "wouter";
import {
  useListMembers,
  useActivateMember,
  useDeactivateMember,
  useCreateMember,
  useUpdateMember,
  useDeleteMember,
  useBulkAssignOrganization,
  useGetProfile,
  getListMembersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { useStepUpAction } from "@/lib/step-up";
import { PlusCircle, Search, UserCheck, UserX, Eye, Pencil, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const createMemberSchema = z.object({
  fullName: z.string().min(2, "Full name required"),
  email: z.string().email("Valid email required"),
  phone: z.string().optional(),
  staffId: z.string().optional(),
  role: z.enum(["member", "admin", "financial_auditor", "treasurer", "super_admin"]).optional(),
  status: z.enum(["pending", "active", "inactive"]).optional(),
  organization: z.enum(["faan", "nama"]).optional(),
});
type CreateMemberForm = z.infer<typeof createMemberSchema>;

const editMemberSchema = z.object({
  fullName: z.string().min(2, "Full name required"),
  phone: z.string().optional(),
  staffId: z.string().optional(),
  role: z.enum(["member", "admin", "financial_auditor", "treasurer", "super_admin"]),
  status: z.enum(["pending", "active", "inactive"]),
  organization: z.enum(["faan", "nama"]),
});
type EditMemberForm = z.infer<typeof editMemberSchema>;

function memberStatusBadge(status: string) {
  const map: Record<string, "default" | "secondary" | "destructive"> = {
    active: "default",
    pending: "secondary",
    inactive: "destructive",
  };
  return <Badge variant={map[status] || "secondary"}>{status}</Badge>;
}

export function MembersPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [orgFilter, setOrgFilter] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<any | null>(null);
  const [deletingMember, setDeletingMember] = useState<any | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: profile } = useGetProfile();
  const isSuperAdmin = profile?.role === "super_admin";
  const canManage = profile?.role === "admin" || profile?.role === "super_admin";

  const params: any = {};
  if (search) params.search = search;
  if (statusFilter) params.status = statusFilter;
  if (orgFilter) params.organization = orgFilter;

  const { data: members, isLoading } = useListMembers(params, {
    query: { queryKey: getListMembersQueryKey(params) },
  });

  const activateMember = useActivateMember();
  const deactivateMember = useDeactivateMember();
  const createMember = useCreateMember();
  const updateMember = useUpdateMember();
  const deleteMember = useDeleteMember();
  const bulkAssign = useBulkAssignOrganization();

  const updateMemberWithStepUp = useStepUpAction(
    (id: number, data: any) => updateMember.mutateAsync({ id, data }),
  );
  const deleteMemberWithStepUp = useStepUpAction(
    (id: number) => deleteMember.mutateAsync({ id }),
  );
  const bulkAssignWithStepUp = useStepUpAction(
    (data: any) => bulkAssign.mutateAsync({ data }),
  );

  const editForm = useForm<EditMemberForm>({
    resolver: zodResolver(editMemberSchema),
    defaultValues: { fullName: "", phone: "", staffId: "", role: "member", status: "active", organization: "faan" },
  });

  function openEdit(member: any) {
    editForm.reset({
      fullName: member.fullName ?? "",
      phone: member.phone ?? "",
      staffId: member.staffId ?? "",
      role: member.role,
      status: member.status,
      organization: member.organization ?? "faan",
    });
    setEditingMember(member);
  }

  async function onEditSubmit(data: EditMemberForm) {
    if (!editingMember) return;
    try {
      await updateMemberWithStepUp(editingMember.id, {
        fullName: data.fullName,
        phone: data.phone || undefined,
        staffId: data.staffId || undefined,
        role: data.role,
        status: data.status,
        organization: data.organization,
      });
      toast({ title: "Member updated" });
      queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === '/api/members' });
      setEditingMember(null);
    } catch (err: any) {
      if (err?.cancelled) return;
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    }
  }

  async function confirmDelete() {
    if (!deletingMember) return;
    try {
      await deleteMemberWithStepUp(deletingMember.id);
      toast({ title: "Member deleted", description: deletingMember.fullName });
      queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === '/api/members' });
      setDeletingMember(null);
    } catch (err: any) {
      if (err?.cancelled) return;
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  }

  const form = useForm<CreateMemberForm>({
    resolver: zodResolver(createMemberSchema),
    defaultValues: { fullName: "", email: "", phone: "", staffId: "", role: "member", status: "active", organization: "faan" },
  });

  function handleActivate(id: number) {
    activateMember.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Member activated" });
          queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === '/api/members' });
        },
      },
    );
  }

  function handleDeactivate(id: number) {
    deactivateMember.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Member deactivated" });
          queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === '/api/members' });
        },
      },
    );
  }

  function onSubmit(data: CreateMemberForm) {
    createMember.mutate(
      {
        data: {
          fullName: data.fullName,
          email: data.email,
          phone: data.phone || undefined,
          staffId: data.staffId || undefined,
          role: data.role,
          status: data.status,
          organization: data.organization,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Member created successfully" });
          queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === '/api/members' });
          setDialogOpen(false);
          form.reset();
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err.message || "Failed to create member", variant: "destructive" });
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Members</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-member">
              <PlusCircle className="w-4 h-4 mr-2" />
              Add Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Member</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="fullName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl><Input data-testid="input-member-fullname" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl><Input type="email" data-testid="input-member-email" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone (optional)</FormLabel>
                    <FormControl><Input data-testid="input-member-phone" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="staffId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Staff ID (optional)</FormLabel>
                    <FormControl><Input data-testid="input-member-staffid" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="role" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-member-role">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="financial_auditor">Financial Auditor</SelectItem>
                        <SelectItem value="treasurer">Treasurer</SelectItem>
                        <SelectItem value="super_admin">Super Admin</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="organization" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Organization</FormLabel>
                    <Select value={field.value || "faan"} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-member-organization">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="faan">FAAN</SelectItem>
                        <SelectItem value="nama">NAMA</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <Button type="submit" className="w-full" disabled={createMember.isPending} data-testid="button-submit-create-member">
                  {createMember.isPending ? "Creating..." : "Create Member"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search members..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-members-search"
          />
        </div>
        <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-36" data-testid="select-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={orgFilter || "all"} onValueChange={(v) => setOrgFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-36" data-testid="select-org-filter">
            <SelectValue placeholder="Organization" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Orgs</SelectItem>
            <SelectItem value="faan">FAAN</SelectItem>
            <SelectItem value="nama">NAMA</SelectItem>
          </SelectContent>
        </Select>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 ml-auto bg-muted rounded-md px-3 py-1.5">
            <span className="text-sm font-medium" data-testid="selected-count">
              {selectedIds.size} selected
            </span>
            {(["faan", "nama"] as const).map((o) => (
              <Button
                key={o}
                size="sm"
                variant="outline"
                disabled={bulkAssign.isPending}
                onClick={async () => {
                  try {
                    const r: any = await bulkAssignWithStepUp({
                      memberIds: Array.from(selectedIds),
                      organization: o,
                    });
                    toast({
                      title: `Assigned to ${o.toUpperCase()}`,
                      description: `${r.updated ?? 0} member(s) updated.`,
                    });
                    setSelectedIds(new Set());
                    queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === '/api/members' });
                  } catch (err: any) {
                    if (err?.cancelled) return;
                    toast({ title: "Bulk assign failed", description: err.message, variant: "destructive" });
                  }
                }}
                data-testid={`button-bulk-${o}`}
              >
                Assign to {o.toUpperCase()}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds(new Set())}
              data-testid="button-clear-selection"
            >
              Clear
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : !members || members.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <PlusCircle className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">
                {search || statusFilter || orgFilter ? "No members match your filters" : "No members yet"}
              </p>
              <p className="text-sm mt-1 mb-4">
                {search || statusFilter || orgFilter
                  ? "Try adjusting or clearing your filters."
                  : "Add your first member to get started."}
              </p>
              {!(search || statusFilter || orgFilter) && (
                <Button onClick={() => setDialogOpen(true)} data-testid="button-empty-add-member">
                  <PlusCircle className="w-4 h-4 mr-2" />
                  Add Member
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {members.map((member: any) => (
                <div
                  key={member.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3"
                  data-testid={`member-row-${member.id}`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <input
                      type="checkbox"
                      className="w-4 h-4 cursor-pointer shrink-0"
                      checked={selectedIds.has(member.id)}
                      onChange={(e) => {
                        const next = new Set(selectedIds);
                        if (e.target.checked) next.add(member.id);
                        else next.delete(member.id);
                        setSelectedIds(next);
                      }}
                      data-testid={`checkbox-member-${member.id}`}
                    />
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                      {member.fullName.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{member.fullName}</p>
                      <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                      <div className="flex flex-wrap gap-1 mt-1 sm:hidden">
                        {memberStatusBadge(member.status)}
                        <Badge variant="outline" className="text-xs uppercase">
                          {member.organization || "faan"}
                        </Badge>
                        <Badge variant="outline" className="text-xs">{member.role.replace("_", " ")}</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
                    <div className="hidden sm:flex items-center gap-2">
                      {memberStatusBadge(member.status)}
                      <Badge variant="outline" className="text-xs uppercase" data-testid={`member-org-${member.id}`}>
                        {member.organization || "faan"}
                      </Badge>
                      <Badge variant="outline" className="text-xs">{member.role.replace("_", " ")}</Badge>
                    </div>
                    <div className="text-right hidden lg:block">
                      <p className="text-xs text-muted-foreground">Savings</p>
                      <p className="text-sm font-medium">{formatCurrency(member.savingsBalance)}</p>
                    </div>
                    <div className="flex gap-1">
                      <Link href={`/members/${member.id}`}>
                        <Button variant="ghost" size="icon" data-testid={`button-view-member-${member.id}`}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </Link>
                      {member.status === "pending" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleActivate(member.id)}
                          data-testid={`button-activate-${member.id}`}
                        >
                          <UserCheck className="w-4 h-4 text-primary" />
                        </Button>
                      )}
                      {member.status === "active" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeactivate(member.id)}
                          data-testid={`button-deactivate-${member.id}`}
                        >
                          <UserX className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                      {canManage && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(member)}
                            data-testid={`button-edit-${member.id}`}
                            title="Edit member"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeletingMember(member)}
                            data-testid={`button-delete-${member.id}`}
                            title="Delete member"
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingMember} onOpenChange={(o) => !o && setEditingMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Member</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <FormField control={editForm.control} name="fullName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl><Input data-testid="input-edit-fullname" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl><Input data-testid="input-edit-phone" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="staffId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Staff ID</FormLabel>
                  <FormControl><Input data-testid="input-edit-staffid" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="role" render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger data-testid="select-edit-role"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="financial_auditor">Financial Auditor</SelectItem>
                      <SelectItem value="treasurer">Treasurer</SelectItem>
                      <SelectItem value="super_admin">Super Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger data-testid="select-edit-status"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="organization" render={({ field }) => (
                <FormItem>
                  <FormLabel>Organization</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger data-testid="select-edit-organization"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="faan">FAAN</SelectItem>
                      <SelectItem value="nama">NAMA</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <Button type="submit" className="w-full" disabled={updateMember.isPending} data-testid="button-submit-edit-member">
                {updateMember.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingMember} onOpenChange={(o) => !o && setDeletingMember(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this member?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deletingMember?.fullName}</strong> along with all their
              transactions, loans, and store purchases. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMember.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMember.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
