import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Settings } from "lucide-react";
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

  function onSubmit(data: SettingsForm) {
    updateSettings.mutate(
      {
        data: {
          cooperativeName: data.cooperativeName,
          loanInterestRate: data.loanInterestRate,
          maxLoanAmount: data.maxLoanAmount || undefined,
          maxLoanTenureMonths: data.maxLoanTenureMonths,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Settings updated" });
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      },
    );
  }

  if (isLoading) return <Skeleton className="h-64 w-full max-w-lg" />;

  return (
    <div className="space-y-6 max-w-lg">
      <div className="flex items-center gap-2">
        <Settings className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">System Settings</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cooperative Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="cooperativeName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Cooperative Name</FormLabel>
                  <FormControl><Input data-testid="input-cooperative-name" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="loanInterestRate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Loan Interest Rate (%)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.1"
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
                  <FormLabel>Maximum Loan Amount (₦) — leave blank for no limit</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
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
                  <FormLabel>Maximum Loan Tenure (months)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      data-testid="input-max-tenure"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <Button type="submit" className="w-full" disabled={updateSettings.isPending} data-testid="button-save-settings">
                {updateSettings.isPending ? "Saving..." : "Save Settings"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
