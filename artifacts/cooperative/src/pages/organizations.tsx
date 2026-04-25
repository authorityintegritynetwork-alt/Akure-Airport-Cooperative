import { useState } from "react";
import {
  useListOrganizations,
  useCreateOrganization,
  useUpdateOrganization,
  useActivateOrganization,
  useDeactivateOrganization,
  getListOrganizationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  FormDescription,
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
import { useToast } from "@/hooks/use-toast";
import { useStepUpAction } from "@/lib/step-up";
import { PlusCircle, Pencil, Power, PowerOff, Building2 } from "lucide-react";

const createSchema = z.object({
  code: z
    .string()
    .min(2, "Code must be at least 2 characters")
    .max(16, "Code must be 16 characters or fewer")
    .regex(
      /^[A-Za-z][A-Za-z0-9_ ]*$/,
      "Code must start with a letter and contain only letters, digits, underscores or spaces",
    ),
  name: z.string().min(2, "Display name required"),
  description: z.string().optional(),
  excelFormat: z.enum(["faan", "nama"]),
});
type CreateForm = z.infer<typeof createSchema>;

const editSchema = z.object({
  name: z.string().min(2, "Display name required"),
  description: z.string().optional(),
  excelFormat: z.enum(["faan", "nama"]),
});
type EditForm = z.infer<typeof editSchema>;

export function OrganizationsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const params = { includeInactive: true };
  const { data: organizations, isLoading } = useListOrganizations(params, {
    query: { queryKey: getListOrganizationsQueryKey(params) },
  });

  const create = useCreateOrganization();
  const update = useUpdateOrganization();
  const activate = useActivateOrganization();
  const deactivate = useDeactivateOrganization();

  const createWithStepUp = useStepUpAction((data: any) =>
    create.mutateAsync({ data }),
  );
  const updateWithStepUp = useStepUpAction((id: number, data: any) =>
    update.mutateAsync({ id, data }),
  );
  const activateWithStepUp = useStepUpAction((id: number) =>
    activate.mutateAsync({ id }),
  );
  const deactivateWithStepUp = useStepUpAction((id: number) =>
    deactivate.mutateAsync({ id }),
  );

  const createForm = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { code: "", name: "", description: "", excelFormat: "faan" },
  });

  const editForm = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: { name: "", description: "", excelFormat: "faan" },
  });

  function openEdit(org: any) {
    editForm.reset({
      name: org.name ?? "",
      description: org.description ?? "",
      excelFormat: org.excelFormat,
    });
    setEditing(org);
  }

  function invalidate() {
    queryClient.invalidateQueries({
      predicate: (q) =>
        Array.isArray(q.queryKey) && q.queryKey[0] === "/api/organizations",
    });
    queryClient.invalidateQueries({
      predicate: (q) =>
        Array.isArray(q.queryKey) && q.queryKey[0] === "/api/members",
    });
  }

  async function onCreate(data: CreateForm) {
    try {
      await createWithStepUp({
        code: data.code.trim().toUpperCase().replace(/\s+/g, "_"),
        name: data.name.trim(),
        description: data.description?.trim() || undefined,
        excelFormat: data.excelFormat,
      });
      toast({ title: "Organization created" });
      invalidate();
      createForm.reset();
      setCreateOpen(false);
    } catch (err: any) {
      if (err?.cancelled) return;
      toast({
        title: "Could not create organization",
        description: err?.message ?? "Please try again",
        variant: "destructive",
      });
    }
  }

  async function onEdit(data: EditForm) {
    if (!editing) return;
    try {
      await updateWithStepUp(editing.id, {
        name: data.name.trim(),
        description: data.description?.trim() || null,
        excelFormat: data.excelFormat,
      });
      toast({ title: "Organization updated" });
      invalidate();
      setEditing(null);
    } catch (err: any) {
      if (err?.cancelled) return;
      toast({
        title: "Could not update organization",
        description: err?.message ?? "Please try again",
        variant: "destructive",
      });
    }
  }

  async function toggleActive(org: any) {
    try {
      if (org.isActive) {
        await deactivateWithStepUp(org.id);
        toast({
          title: `${org.code} deactivated`,
          description:
            "It will no longer appear on sign-up or in member assignment menus.",
        });
      } else {
        await activateWithStepUp(org.id);
        toast({ title: `${org.code} activated` });
      }
      invalidate();
    } catch (err: any) {
      if (err?.cancelled) return;
      toast({
        title: "Action failed",
        description: err?.message ?? "Please try again",
        variant: "destructive",
      });
    }
  }

  const activeCount = (organizations || []).filter((o: any) => o.isActive).length;

  return (
    <div className="space-y-5">
      {/* Hero gradient card */}
      <div
        className="relative overflow-hidden rounded-3xl p-5 sm:p-6 text-white shadow-xl shadow-primary/20"
        style={{
          background:
            "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(220 80% 35%) 45%, hsl(200 85% 45%) 100%)",
        }}
        data-testid="organizations-hero"
      >
        <div className="absolute -top-12 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 -left-8 w-56 h-56 rounded-full bg-white/5 blur-3xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs sm:text-sm text-white/80 font-medium uppercase tracking-wider">
              Organizations
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold mt-0.5 tabular-nums">
              {activeCount}
              <span className="text-base font-normal text-white/70"> active</span>
            </h1>
            <p className="text-xs text-white/80 mt-1">
              Configure employers and Excel formats
            </p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="rounded-full bg-white text-primary hover:bg-white/90 shrink-0 font-semibold shadow-lg"
                data-testid="button-create-organization"
              >
                <PlusCircle className="w-4 h-4 mr-1.5" />
                Add
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl max-h-[92vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add organization</DialogTitle>
              </DialogHeader>
              <Form {...createForm}>
                <form onSubmit={createForm.handleSubmit(onCreate)} className="space-y-4">
                  <FormField control={createForm.control} name="code" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Code *</FormLabel>
                      <FormControl>
                        <Input
                          className="rounded-xl"
                          data-testid="input-org-code"
                          placeholder="e.g. FAAN"
                          {...field}
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Short, unique identifier (uppercase). Cannot be changed after creation.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={createForm.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display name *</FormLabel>
                      <FormControl>
                        <Input
                          className="rounded-xl"
                          data-testid="input-org-name"
                          placeholder="e.g. Federal Airports Authority of Nigeria"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={createForm.control} name="description" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Input
                          className="rounded-xl"
                          data-testid="input-org-description"
                          placeholder="Optional one-line description shown on sign-up"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={createForm.control} name="excelFormat" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Excel deduction format *</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="rounded-xl" data-testid="select-org-format">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="faan">FAAN format</SelectItem>
                          <SelectItem value="nama">NAMA format</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-xs">
                        Which column layout the monthly deduction file for this organization uses.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <Button
                    type="submit"
                    className="w-full rounded-xl h-11"
                    disabled={create.isPending}
                    data-testid="button-submit-create-org"
                  >
                    {create.isPending ? "Creating..." : "Create organization"}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
        </div>
      ) : !organizations || organizations.length === 0 ? (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="text-center py-16 text-muted-foreground">
            <Building2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No organizations configured yet</p>
            <p className="text-sm mt-1">
              Add your first organization to enable member sign-up.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {organizations.map((org: any) => (
            <div
              key={org.id}
              className="rounded-2xl border border-border/70 bg-card shadow-sm p-4 flex items-start gap-3"
              data-testid={`org-row-${org.code.toLowerCase()}`}
            >
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-sm">{org.code}</span>
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20">
                    {org.excelFormat}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border ${
                      org.isActive
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                        : "bg-muted text-muted-foreground border-border"
                    }`}
                  >
                    {org.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="text-sm font-medium mt-0.5 truncate">{org.name}</p>
                {org.description && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{org.description}</p>
                )}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full h-10 w-10"
                  onClick={() => openEdit(org)}
                  title="Edit organization"
                  data-testid={`button-edit-org-${org.code.toLowerCase()}`}
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full h-10 w-10"
                  onClick={() => toggleActive(org)}
                  title={org.isActive ? "Deactivate" : "Activate"}
                  data-testid={`button-toggle-org-${org.code.toLowerCase()}`}
                >
                  {org.isActive ? (
                    <PowerOff className="w-4 h-4 text-destructive" />
                  ) : (
                    <Power className="w-4 h-4 text-emerald-600" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="rounded-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit {editing?.code}</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-4">
              <FormField control={editForm.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Display name *</FormLabel>
                  <FormControl><Input className="rounded-xl" data-testid="input-edit-org-name" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl><Input className="rounded-xl" data-testid="input-edit-org-description" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="excelFormat" render={({ field }) => (
                <FormItem>
                  <FormLabel>Excel deduction format *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="rounded-xl" data-testid="select-edit-org-format">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="faan">FAAN format</SelectItem>
                      <SelectItem value="nama">NAMA format</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription className="text-xs">
                    Changes apply to future uploads only — past upload records keep their original format.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <Button
                type="submit"
                className="w-full rounded-xl h-11"
                disabled={update.isPending}
                data-testid="button-submit-edit-org"
              >
                {update.isPending ? "Saving..." : "Save changes"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
