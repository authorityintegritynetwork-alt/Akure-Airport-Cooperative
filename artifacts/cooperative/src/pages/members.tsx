import { useState } from "react";
import { Link } from "wouter";
import {
  useListMembers,
  useActivateMember,
  useDeactivateMember,
  useCreateMember,
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
import { PlusCircle, Search, UserCheck, UserX, Eye } from "lucide-react";

const createMemberSchema = z.object({
  fullName: z.string().min(2, "Full name required"),
  email: z.string().email("Valid email required"),
  phone: z.string().optional(),
  staffId: z.string().optional(),
  role: z.enum(["member", "admin", "financial_auditor", "treasurer", "super_admin"]).optional(),
  status: z.enum(["pending", "active", "inactive"]).optional(),
});
type CreateMemberForm = z.infer<typeof createMemberSchema>;

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
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const params: any = {};
  if (search) params.search = search;
  if (statusFilter) params.status = statusFilter;

  const { data: members, isLoading } = useListMembers(params, {
    query: { queryKey: getListMembersQueryKey(params) },
  });

  const activateMember = useActivateMember();
  const deactivateMember = useDeactivateMember();
  const createMember = useCreateMember();

  const form = useForm<CreateMemberForm>({
    resolver: zodResolver(createMemberSchema),
    defaultValues: { fullName: "", email: "", phone: "", staffId: "", role: "member", status: "active" },
  });

  function handleActivate(id: number) {
    activateMember.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Member activated" });
          queryClient.invalidateQueries({ queryKey: getListMembersQueryKey({}) });
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
          queryClient.invalidateQueries({ queryKey: getListMembersQueryKey({}) });
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
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Member created successfully" });
          queryClient.invalidateQueries({ queryKey: getListMembersQueryKey({}) });
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
                <Button type="submit" className="w-full" disabled={createMember.isPending} data-testid="button-submit-create-member">
                  {createMember.isPending ? "Creating..." : "Create Member"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-3">
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
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : !members || members.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No members found.</div>
          ) : (
            <div className="divide-y">
              {members.map((member: any) => (
                <div key={member.id} className="flex items-center justify-between px-4 py-3" data-testid={`member-row-${member.id}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                      {member.fullName.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{member.fullName}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {memberStatusBadge(member.status)}
                    <Badge variant="outline" className="text-xs">{member.role.replace("_", " ")}</Badge>
                    <div className="text-right hidden md:block">
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
                    </div>
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
