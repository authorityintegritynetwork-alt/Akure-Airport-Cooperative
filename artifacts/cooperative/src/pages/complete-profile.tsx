import { useEffect, useState } from "react";
import { useUser, useClerk } from "@clerk/react";
import {
  useRegisterMember,
  useListOrganizations,
  useGetMatchSuggestions,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Search } from "lucide-react";

export function CompleteProfilePage() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const defaultName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "";
  const [fullName, setFullName] = useState(defaultName);
  const [phone, setPhone] = useState("");
  const [staffId, setStaffId] = useState("");
  const [organization, setOrganization] = useState<string>("");

  const { data: organizations, isLoading: orgsLoading } = useListOrganizations();

  // Debounce name + org so we can preview a likely cooperative-record match
  // without firing a request on every keystroke.
  const [debouncedName, setDebouncedName] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedName(fullName.trim()), 400);
    return () => clearTimeout(t);
  }, [fullName]);

  const canPreview = debouncedName.length >= 2 && !!organization;
  const { data: matchData, isFetching: matchLoading } = useGetMatchSuggestions(
    { fullName: debouncedName, organization },
    { query: { enabled: canPreview, queryKey: ["matchPreview", debouncedName, organization] } },
  );
  const topMatch = matchData?.suggestions?.[0];

  const register = useRegisterMember({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries();
        toast({
          title: "Profile submitted",
          description: "An administrator will review and approve your account.",
        });
        setLocation("/pending-approval");
      },
      onError: (err: any) => {
        toast({
          title: "Registration failed",
          description: err?.message ?? "Please try again",
          variant: "destructive",
        });
      },
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast({ title: "Full name is required", variant: "destructive" });
      return;
    }
    if (!organization) {
      toast({ title: "Please select your employer", variant: "destructive" });
      return;
    }
    register.mutate({
      data: {
        fullName: fullName.trim(),
        phone: phone.trim() || undefined,
        staffId: staffId.trim() || undefined,
        organization,
      },
    });
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md shadow-lg border-border/70">
        <CardHeader className="text-center pb-4">
          <CardTitle className="text-2xl tracking-tight">Complete your profile</CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Tell us a bit about yourself to finish setting up your cooperative account.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full name *</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="As it appears on your staff ID"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="08012345678"
                type="tel"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="staffId">Staff ID</Label>
              <Input
                id="staffId"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Employer *</Label>
              <p className="text-xs text-muted-foreground">
                Select the organization that employs you. This determines which deduction format and balance categories apply to your account.
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                {orgsLoading && (
                  <div className="col-span-2 text-sm text-muted-foreground py-3">
                    Loading organizations...
                  </div>
                )}
                {!orgsLoading && (!organizations || organizations.length === 0) && (
                  <div className="col-span-2 text-sm text-destructive py-3">
                    No organizations have been set up yet. Please contact an administrator.
                  </div>
                )}
                {organizations?.map((org) => (
                  <button
                    key={org.code}
                    type="button"
                    data-testid={`org-${org.code.toLowerCase()}`}
                    onClick={() => setOrganization(org.code)}
                    className={`border rounded-lg px-3 py-3 text-left transition ${
                      organization === org.code
                        ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="font-semibold text-sm">{org.code}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {org.description || org.name}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            {canPreview && (
              <div className="rounded-lg border border-border/70 bg-muted/40 p-3 text-sm">
                {matchLoading ? (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Search className="w-4 h-4 animate-pulse" />
                    Checking cooperative records...
                  </p>
                ) : topMatch ? (
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium text-foreground">
                        We found a likely match in our records
                      </p>
                      <p className="text-muted-foreground mt-0.5">
                        {topMatch.fullName}
                        {topMatch.organization ? ` · ${topMatch.organization}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Your existing balances will be linked once an administrator approves your account.
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    No existing cooperative record matched this name yet. You can still continue —
                    an administrator will review your account.
                  </p>
                )}
              </div>
            )}
            <Button type="submit" className="w-full mt-2" disabled={register.isPending}>
              {register.isPending ? "Submitting..." : "Submit for approval"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => signOut({ redirectUrl: "/" })}
            >
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
