import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useStepUpAction } from "@/lib/step-up";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

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
    </div>
  );
}
