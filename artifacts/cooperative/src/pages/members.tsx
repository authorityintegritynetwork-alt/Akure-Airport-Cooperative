import { useState } from "react";
import { Link, useSearch } from "wouter";
import {
  useListMembers,
  useActivateMember,
  useDeactivateMember,
  useCreateMember,
  useUpdateMember,
  useDeleteMember,
  useBulkAssignOrganization,
  useGetProfile,
  useListOrganizations,
  getListMembersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { PlusCircle, Search, UserCheck, UserX, Eye, Pencil, Trash2, SlidersHorizontal, X, Users } from "lucide-react";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";

const createMemberSchema = z.object({
  fullName: z.string().min(2, "Full name required"),
  email: z.string().email("Valid email required"),
  phone: z.string().optional(),
  staffId: z.string().optional(),
  role: z.enum(["member", "admin", "financial_auditor", "treasurer", "super_admin"]).optional(),
  status: z.enum(["pending", "active", "inactive"]).optional(),
  organization: z.string().optional(),
});
type CreateMemberForm = z.infer<typeof createMemberSchema>;

const editMemberSchema = z.object({
  fullName: z.string().min(2, "Full name required"),
  phone: z.string().optional(),
  staffId: z.string().optional(),
  role: z.enum(["member", "admin", "financial_auditor", "treasurer", "super_admin"]),
  status: z.enum(["pending", "active", "inactive"]),
  organization: z.string().min(1, "Organization required"),
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
  const searchString = useSearch();
  const initialStatus = (() => {
    const sp = new URLSearchParams(searchString);
    const s = sp.get("status");
    return s === "pending" || s === "active" || s === "inactive" ? s : "";
  })();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus);
  const [orgFilter, setOrgFilter] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<any | null>(null);
  const [deletingMember, setDeletingMember] = useState<any | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: profile } = useGetProfile();
  const isSuperAdmin = profile?.role === "super_admin";
  const canManage = profile?.role === "admin" || profile?.role === "super_admin";
  const { data: organizations } = useListOrganizations();
  const activeOrgs = (organizations ?? []).filter((o: any) => o.isActive);
  const defaultOrgCode = activeOrgs[0]?.code ?? "";

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
    defaultValues: { fullName: "", phone: "", staffId: "", role: "member", status: "active", organization: defaultOrgCode },
  });

  function openEdit(member: any) {
    editForm.reset({
      fullName: member.fullName ?? "",
      phone: member.phone ?? "",
      staffId: member.staffId ?? "",
      role: member.role,
      status: member.status,
      organization: member.organization ?? defaultOrgCode,
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
      const name = deletingMember.fullName;
      await deleteMemberWithStepUp(deletingMember.id);
      toast({
        title: "Member permanently deleted",
        description: `${name} and all of their savings, loans and purchases have been removed.`,
      });
      queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === '/api/members' });
      setDeletingMember(null);
      setDeleteConfirmText("");
    } catch (err: any) {
      if (err?.cancelled) return;
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  }

  const form = useForm<CreateMemberForm>({
    resolver: zodResolver(createMemberSchema),
    defaultValues: { fullName: "", email: "", phone: "", staffId: "", role: "member", status: "active", organization: defaultOrgCode },
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

  const totalCount = members?.length ?? 0;
  const hasFilters = !!(search || statusFilter || orgFilter);
  const activeFilterCount =
    (statusFilter ? 1 : 0) + (orgFilter ? 1 : 0);

  function clearAllFilters() {
    setSearch("");
    setStatusFilter("");
    setOrgFilter("");
  }

  return (
    <div className="space-y-5">
      {/* Hero gradient card */}
      <div
        className="relative overflow-hidden rounded-3xl p-5 sm:p-6 text-white shadow-xl shadow-primary/20"
        style={{
          background:
            "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(220 80% 35%) 45%, hsl(200 85% 45%) 100%)",
        }}
        data-testid="members-hero-card"
      >
        <div className="absolute -top-12 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 -left-8 w-56 h-56 rounded-full bg-white/5 blur-3xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-xs sm:text-sm text-white/80 font-medium uppercase tracking-wider">
              Members
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold mt-0.5 tabular-nums">
              {totalCount}
            </h1>
            <p className="text-xs text-white/80 mt-1">
              {hasFilters ? "Matching current filters" : "Total in cooperative"}
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="rounded-full bg-white text-primary hover:bg-white/90 shadow-md gap-1.5 shrink-0"
                data-testid="button-create-member"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Add</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl">
              <DialogHeader>
                <DialogTitle>Create New Member</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField control={form.control} name="fullName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl><Input className="rounded-xl" data-testid="input-member-fullname" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl><Input type="email" className="rounded-xl" data-testid="input-member-email" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="phone" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone (optional)</FormLabel>
                      <FormControl><Input className="rounded-xl" data-testid="input-member-phone" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="staffId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Staff ID (optional)</FormLabel>
                      <FormControl><Input className="rounded-xl" data-testid="input-member-staffid" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="role" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="rounded-xl" data-testid="select-member-role">
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
                      <Select value={field.value || defaultOrgCode} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="rounded-xl" data-testid="select-member-organization">
                            <SelectValue placeholder="Select an organization" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {activeOrgs.map((o: any) => (
                            <SelectItem key={o.code} value={o.code}>
                              {o.code} — {o.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <Button type="submit" className="w-full rounded-xl" disabled={createMember.isPending} data-testid="button-submit-create-member">
                    {createMember.isPending ? "Creating..." : "Create Member"}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Toolbar — search always visible, filters on desktop / sheet on mobile */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search members..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 rounded-xl"
            data-testid="input-members-search"
          />
        </div>

        {/* Mobile filter trigger */}
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="md:hidden rounded-xl shrink-0 relative"
              data-testid="button-open-member-filters"
            >
              <SlidersHorizontal className="w-4 h-4" />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-3xl">
            <SheetHeader className="text-left">
              <SheetTitle>Filter members</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 mt-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</label>
                <Select
                  value={statusFilter || "all"}
                  onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}
                >
                  <SelectTrigger className="rounded-xl mt-1.5" data-testid="select-status-filter-mobile">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Organization</label>
                <Select
                  value={orgFilter || "all"}
                  onValueChange={(v) => setOrgFilter(v === "all" ? "" : v)}
                >
                  <SelectTrigger className="rounded-xl mt-1.5" data-testid="select-org-filter-mobile">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Organizations</SelectItem>
                    {activeOrgs.map((o: any) => (
                      <SelectItem key={o.code} value={o.code}>
                        {o.code} — {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <SheetFooter className="mt-6 flex-row gap-2">
              <Button
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={clearAllFilters}
                disabled={!hasFilters}
              >
                Clear all
              </Button>
              <SheetClose asChild>
                <Button className="flex-1 rounded-xl">Done</Button>
              </SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        {/* Desktop inline filters */}
        <div className="hidden md:flex gap-2">
          <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-36 rounded-xl" data-testid="select-status-filter">
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
            <SelectTrigger className="w-36 rounded-xl" data-testid="select-org-filter">
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
      </div>

      {/* Active filter chips */}
      {hasFilters && (
        <div className="flex items-center gap-2 flex-wrap">
          {statusFilter && (
            <Badge variant="secondary" className="rounded-full gap-1 pr-1">
              {statusFilter}
              <button
                type="button"
                onClick={() => setStatusFilter("")}
                className="hover:bg-background/50 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {orgFilter && (
            <Badge variant="secondary" className="rounded-full gap-1 pr-1 uppercase">
              {orgFilter}
              <button
                type="button"
                onClick={() => setOrgFilter("")}
                className="hover:bg-background/50 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          <button
            type="button"
            onClick={clearAllFilters}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Bulk-select bar */}
      {selectedIds.size > 0 && (
        <div className="rounded-2xl bg-primary/10 border border-primary/20 p-3 flex flex-wrap items-center gap-2 shadow-sm">
          <span className="text-sm font-semibold" data-testid="selected-count">
            {selectedIds.size} selected
          </span>
          <span className="text-xs text-muted-foreground hidden sm:inline">·</span>
          <span className="text-xs text-muted-foreground">Assign to:</span>
          <div className="flex gap-1.5 flex-wrap">
            {activeOrgs.map((o: any) => (
              <Button
                key={o.code}
                size="sm"
                variant="outline"
                className="rounded-full bg-card"
                disabled={bulkAssign.isPending}
                onClick={async () => {
                  try {
                    const r: any = await bulkAssignWithStepUp({
                      memberIds: Array.from(selectedIds),
                      organization: o.code,
                    });
                    toast({
                      title: `Assigned to ${o.code}`,
                      description: `${r.updated ?? 0} member(s) updated.`,
                    });
                    setSelectedIds(new Set());
                    queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === '/api/members' });
                  } catch (err: any) {
                    if (err?.cancelled) return;
                    toast({ title: "Bulk assign failed", description: err.message, variant: "destructive" });
                  }
                }}
                data-testid={`button-bulk-${o.code.toLowerCase()}`}
              >
                {o.code}
              </Button>
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto rounded-full"
            onClick={() => setSelectedIds(new Set())}
            data-testid="button-clear-selection"
          >
            <X className="w-3.5 h-3.5 mr-1" /> Clear
          </Button>
        </div>
      )}

      {/* Member cards */}
      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}</div>
      ) : !members || members.length === 0 ? (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="text-center py-16 text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">
              {hasFilters ? "No members match your filters" : "No members yet"}
            </p>
            <p className="text-sm mt-1 mb-4">
              {hasFilters
                ? "Try adjusting or clearing your filters."
                : "Add your first member to get started."}
            </p>
            {!hasFilters && (
              <Button onClick={() => setDialogOpen(true)} className="rounded-full" data-testid="button-empty-add-member">
                <PlusCircle className="w-4 h-4 mr-2" />
                Add Member
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {members.map((member: any) => {
            const checked = selectedIds.has(member.id);
            return (
              <div
                key={member.id}
                className={`group rounded-2xl border bg-card p-3 sm:p-4 transition-all hover:shadow-md ${
                  checked
                    ? "border-primary/50 ring-1 ring-primary/30 shadow-sm"
                    : "border-border/70 shadow-sm"
                }`}
                data-testid={`member-row-${member.id}`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="w-4 h-4 cursor-pointer shrink-0 mt-2 accent-primary"
                    checked={checked}
                    onChange={(e) => {
                      const next = new Set(selectedIds);
                      if (e.target.checked) next.add(member.id);
                      else next.delete(member.id);
                      setSelectedIds(next);
                    }}
                    data-testid={`checkbox-member-${member.id}`}
                  />
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-blue-500 text-primary-foreground flex items-center justify-center font-bold shrink-0 shadow-sm">
                    {member.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link href={`/members/${member.id}`}>
                      <p className="font-semibold text-sm truncate hover:underline cursor-pointer">
                        {member.fullName}
                      </p>
                    </Link>
                    <p className="text-xs text-muted-foreground truncate">
                      {member.email}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {memberStatusBadge(member.status)}
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase rounded-full px-2"
                        data-testid={`member-org-${member.id}`}
                      >
                        {member.organization || "—"}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="text-[10px] rounded-full px-2"
                      >
                        {member.role.replace("_", " ")}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="text-[10px] rounded-full px-2 lg:hidden"
                      >
                        {formatCurrency(member.savingsBalance)}
                      </Badge>
                    </div>
                  </div>
                  <div className="hidden lg:block text-right shrink-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                      Savings
                    </p>
                    <p className="text-sm font-bold tabular-nums">
                      {formatCurrency(member.savingsBalance)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-3 pt-3 border-t border-border/50 -mx-1">
                  <Link href={`/members/${member.id}`} className="flex-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full rounded-lg gap-1.5 text-xs h-8"
                      data-testid={`button-view-member-${member.id}`}
                    >
                      <Eye className="w-3.5 h-3.5" /> View
                    </Button>
                  </Link>
                  {member.status === "pending" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 rounded-lg gap-1.5 text-xs h-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                      onClick={() => handleActivate(member.id)}
                      data-testid={`button-activate-${member.id}`}
                    >
                      <UserCheck className="w-3.5 h-3.5" /> Activate
                    </Button>
                  )}
                  {member.status === "active" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 rounded-lg gap-1.5 text-xs h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDeactivate(member.id)}
                      data-testid={`button-deactivate-${member.id}`}
                    >
                      <UserX className="w-3.5 h-3.5" /> Deactivate
                    </Button>
                  )}
                  {canManage && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-lg h-8 px-2.5"
                        onClick={() => openEdit(member)}
                        data-testid={`button-edit-${member.id}`}
                        title="Edit member"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-lg h-8 px-2.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeletingMember(member)}
                        data-testid={`button-delete-${member.id}`}
                        title="Delete member"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

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
                    <FormControl><SelectTrigger data-testid="select-edit-organization"><SelectValue placeholder="Select an organization" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {activeOrgs.map((o: any) => (
                        <SelectItem key={o.code} value={o.code}>
                          {o.code} — {o.name}
                        </SelectItem>
                      ))}
                      {/* Always include the member's current org code, even if it has been deactivated, so the form value remains valid. */}
                      {field.value && !activeOrgs.some((o: any) => o.code === field.value) && (
                        <SelectItem value={field.value}>{field.value} (inactive)</SelectItem>
                      )}
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

      <AlertDialog
        open={!!deletingMember}
        onOpenChange={(o) => {
          if (!o) {
            setDeletingMember(null);
            setDeleteConfirmText("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this member?</AlertDialogTitle>
            <AlertDialogDescription>
              This will <strong>permanently delete</strong> <strong>{deletingMember?.fullName}</strong> along with all of
              their savings, transactions, loans, and store purchases. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">
              Type <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{deletingMember?.fullName}</span> below to confirm.
            </label>
            <Input
              autoFocus
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={deletingMember?.fullName}
              data-testid="input-delete-confirm"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMember.isPending || deleteConfirmText.trim() !== (deletingMember?.fullName ?? "")}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMember.isPending ? "Deleting..." : "Yes, permanently delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
