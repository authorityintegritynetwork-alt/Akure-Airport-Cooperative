import {
  useGetSettings,
  useUpdateSettings,
  useToggleBalanceVisibility,
  getGetSettingsQueryKey,
  useListLoanProducts,
  useCreateLoanProduct,
  useUpdateLoanProduct,
  useDeleteLoanProduct,
  getListLoanProductsQueryKey,
} from "@workspace/api-client-react";
import { useStepUpAction } from "@/lib/step-up";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState, Component, type ReactNode } from "react";
import { Plus, Pencil, Trash2, EyeOff, Eye } from "lucide-react";

class CardErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 dark:bg-rose-950/20 p-4 text-xs text-rose-700 dark:text-rose-400">
          Balance Visibility card failed to load: {this.state.error}
        </div>
      );
    }
    return this.props.children;
  }
}

function BalanceVisibilityCard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: settings, isLoading } = useGetSettings();
  const toggleMut = useToggleBalanceVisibility();

  async function handleToggle(hidden: boolean) {
    try {
      await toggleMut.mutateAsync({ hidden });
      queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      toast({
        title: hidden ? "Balances hidden" : "Balances visible",
        description: hidden
          ? "Members now see ₦0.00 for all balances and no transaction history."
          : "Members can now see their real balances and transaction history.",
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  const hidden = settings?.balancesHidden ?? false;

  return (
    <Card className={`rounded-2xl shadow-sm border-2 ${hidden ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20" : "border-border/70"}`}>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className={`mt-0.5 rounded-xl p-2.5 ${hidden ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" : "bg-muted text-muted-foreground"}`}>
            {hidden ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold leading-tight">Balance Visibility</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {hidden
                    ? "Members currently see ₦0.00 for all balances and no transaction history."
                    : "Members can see their real savings, loans, and transaction history."}
                </p>
              </div>
              {isLoading ? (
                <div className="w-10 h-6 rounded-full bg-muted animate-pulse shrink-0" />
              ) : (
                <Switch
                  checked={!hidden}
                  disabled={toggleMut.isPending}
                  onCheckedChange={(checked) => handleToggle(!checked)}
                  data-testid="switch-balance-visibility"
                />
              )}
            </div>
            {hidden && (
              <div className="mt-3 rounded-xl bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 px-3 py-2 flex items-center gap-2">
                <EyeOff className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
                <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                  Balance hiding is active — members see ₦0.00 everywhere. Toggle on to restore real figures.
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const settingsSchema = z.object({
  cooperativeName: z.string().min(2, "Cooperative name required"),
  loanInterestRate: z.number().min(0).max(100),
  maxLoanAmount: z.number().positive().optional(),
  maxLoanTenureMonths: z.number().int().min(1).max(360),
});
type SettingsForm = z.infer<typeof settingsSchema>;

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: settings, isLoading } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const updateWithStepUp = useStepUpAction((data: any) => updateSettings.mutateAsync({ data }));

  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: { cooperativeName: "", loanInterestRate: 10, maxLoanAmount: undefined, maxLoanTenureMonths: 24 },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        cooperativeName: settings.cooperativeName,
        loanInterestRate: settings.loanInterestRate,
        maxLoanAmount: settings.maxLoanAmount ?? undefined,
        maxLoanTenureMonths: settings.maxLoanTenureMonths,
      });
    }
  }, [settings]);

  async function onSubmit(data: SettingsForm) {
    try {
      await updateWithStepUp({
        cooperativeName: data.cooperativeName,
        loanInterestRate: data.loanInterestRate,
        maxLoanAmount: data.maxLoanAmount || undefined,
        maxLoanTenureMonths: data.maxLoanTenureMonths,
      });
      toast({ title: "Settings updated" });
      queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-5 max-w-lg">
        <Skeleton className="h-32 w-full rounded-3xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-lg">
      <CardErrorBoundary><BalanceVisibilityCard /></CardErrorBoundary>

      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-3xl p-5 sm:p-6 text-white shadow-xl shadow-primary/20"
        style={{
          background:
            "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(220 80% 35%) 45%, hsl(200 85% 45%) 100%)",
        }}
        data-testid="settings-hero"
      >
        <div className="absolute -top-12 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 -left-8 w-56 h-56 rounded-full bg-white/5 blur-3xl" />
        <div className="relative">
          <p className="text-xs sm:text-sm text-white/80 font-medium uppercase tracking-wider">
            System Settings
          </p>
          <h1 className="text-xl sm:text-2xl font-bold mt-0.5 leading-tight">
            Cooperative configuration
          </h1>
          <p className="text-xs text-white/80 mt-1">
            Tune loan parameters and cooperative branding
          </p>
        </div>
      </div>

      <Card className="rounded-2xl shadow-sm border-border/70">
        <CardContent className="p-5">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="cooperativeName" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cooperative Name</FormLabel>
                  <FormControl><Input className="rounded-xl h-11" data-testid="input-cooperative-name" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="loanInterestRate" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Loan Interest Rate (%)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.1"
                      className="rounded-xl h-11 tabular-nums"
                      data-testid="input-interest-rate"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="maxLoanAmount" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Maximum Loan Amount (₦)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      className="rounded-xl h-11 tabular-nums"
                      placeholder="Leave blank for no limit"
                      data-testid="input-max-loan-amount"
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="maxLoanTenureMonths" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Maximum Loan Tenure (months)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      className="rounded-xl h-11 tabular-nums"
                      data-testid="input-max-tenure"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <Button
                type="submit"
                className="w-full rounded-xl h-11"
                disabled={updateSettings.isPending}
                data-testid="button-save-settings"
              >
                {updateSettings.isPending ? "Saving..." : "Save Settings"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <LoanProductsSection />
    </div>
  );
}

const productSchema = z.object({
  code: z
    .string()
    .min(2, "Code required")
    .regex(/^[a-z0-9_]+$/i, "Letters, digits, underscores only"),
  name: z.string().min(2, "Name required"),
  description: z.string().optional(),
  interestRate: z.number().min(0).max(100),
  defaultTenureMonths: z.number().int().min(1).max(360),
  maxTenureMonths: z.number().int().min(1).max(360),
});
type ProductForm = z.infer<typeof productSchema>;

function LoanProductsSection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: products, isLoading } = useListLoanProducts({
    includeInactive: true,
  });
  const createMut = useCreateLoanProduct();
  const updateMut = useUpdateLoanProduct();
  const deleteMut = useDeleteLoanProduct();

  const createWithStepUp = useStepUpAction((data: ProductForm) =>
    createMut.mutateAsync({ data }),
  );
  const updateWithStepUp = useStepUpAction(
    ({ id, data }: { id: number; data: any }) =>
      updateMut.mutateAsync({ id, data }),
  );
  const deleteWithStepUp = useStepUpAction((id: number) =>
    deleteMut.mutateAsync({ id }),
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const form = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      code: "",
      name: "",
      description: "",
      interestRate: 10,
      defaultTenureMonths: 12,
      maxTenureMonths: 12,
    },
  });

  function openCreate() {
    setEditing(null);
    form.reset({
      code: "",
      name: "",
      description: "",
      interestRate: 10,
      defaultTenureMonths: 12,
      maxTenureMonths: 12,
    });
    setDialogOpen(true);
  }

  function openEdit(p: any) {
    setEditing(p);
    form.reset({
      code: p.code,
      name: p.name,
      description: p.description ?? "",
      interestRate: p.interestRate,
      defaultTenureMonths: p.defaultTenureMonths,
      maxTenureMonths: p.maxTenureMonths,
    });
    setDialogOpen(true);
  }

  async function onSubmit(data: ProductForm) {
    try {
      if (editing) {
        await updateWithStepUp({
          id: editing.id,
          data: {
            name: data.name,
            description: data.description || null,
            interestRate: data.interestRate,
            defaultTenureMonths: data.defaultTenureMonths,
            maxTenureMonths: data.maxTenureMonths,
          },
        });
        toast({ title: "Loan product updated" });
      } else {
        await createWithStepUp(data);
        toast({ title: "Loan product created" });
      }
      queryClient.invalidateQueries({ queryKey: getListLoanProductsQueryKey() });
      setDialogOpen(false);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Could not save",
        variant: "destructive",
      });
    }
  }

  async function toggleActive(p: any) {
    try {
      await updateWithStepUp({ id: p.id, data: { isActive: !p.isActive } });
      queryClient.invalidateQueries({ queryKey: getListLoanProductsQueryKey() });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Could not update",
        variant: "destructive",
      });
    }
  }

  async function handleDelete(p: any) {
    if (
      !confirm(`Delete loan product "${p.name}"? This cannot be undone.`)
    )
      return;
    try {
      await deleteWithStepUp(p.id);
      toast({ title: "Loan product deleted" });
      queryClient.invalidateQueries({ queryKey: getListLoanProductsQueryKey() });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Could not delete",
        variant: "destructive",
      });
    }
  }

  return (
    <Card className="rounded-2xl shadow-sm border-border/70" data-testid="loan-products-card">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold">Loan Products</h2>
            <p className="text-xs text-muted-foreground">
              Configure each loan type's interest rate and maximum tenure
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="rounded-full"
                onClick={openCreate}
                data-testid="button-add-loan-product"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md rounded-3xl">
              <DialogHeader>
                <DialogTitle>
                  {editing ? "Edit loan product" : "New loan product"}
                </DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-3"
                >
                  <FormField
                    control={form.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Code</FormLabel>
                        <FormControl>
                          <Input
                            className="rounded-xl h-11"
                            placeholder="e.g. regular"
                            disabled={!!editing}
                            data-testid="input-product-code"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input
                            className="rounded-xl h-11"
                            data-testid="input-product-name"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Input
                            className="rounded-xl h-11"
                            data-testid="input-product-description"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <FormField
                      control={form.control}
                      name="interestRate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[11px]">Rate %</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.1"
                              className="rounded-xl h-11 tabular-nums"
                              data-testid="input-product-rate"
                              {...field}
                              onChange={(e) =>
                                field.onChange(parseFloat(e.target.value))
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="defaultTenureMonths"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[11px]">Default mo</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              className="rounded-xl h-11 tabular-nums"
                              data-testid="input-product-default-tenure"
                              {...field}
                              onChange={(e) =>
                                field.onChange(parseInt(e.target.value))
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="maxTenureMonths"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[11px]">Max mo</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              className="rounded-xl h-11 tabular-nums"
                              data-testid="input-product-max-tenure"
                              {...field}
                              onChange={(e) =>
                                field.onChange(parseInt(e.target.value))
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      type="submit"
                      className="rounded-xl"
                      disabled={createMut.isPending || updateMut.isPending}
                      data-testid="button-save-loan-product"
                    >
                      {createMut.isPending || updateMut.isPending
                        ? "Saving..."
                        : editing
                          ? "Save changes"
                          : "Create product"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        ) : !products || products.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No loan products yet.
          </p>
        ) : (
          <div className="space-y-2" data-testid="loan-products-list">
            {products.map((p) => (
              <div
                key={p.id}
                className={`rounded-xl border p-3 flex items-center gap-3 ${
                  p.isActive
                    ? "border-border/60 bg-card"
                    : "border-border/40 bg-muted/40 opacity-70"
                }`}
                data-testid={`loan-product-row-${p.code}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm truncate">{p.name}</p>
                    <Badge variant="outline" className="text-[10px] rounded-full">
                      {p.code}
                    </Badge>
                    {!p.isActive && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] rounded-full"
                      >
                        Disabled
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {p.interestRate}% flat · default {p.defaultTenureMonths} mo
                    · max {p.maxTenureMonths} mo
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Switch
                    checked={p.isActive}
                    onCheckedChange={() => toggleActive(p)}
                    data-testid={`switch-product-${p.code}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    onClick={() => openEdit(p)}
                    data-testid={`button-edit-product-${p.code}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg text-rose-600 hover:text-rose-600"
                    onClick={() => handleDelete(p)}
                    data-testid={`button-delete-product-${p.code}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
