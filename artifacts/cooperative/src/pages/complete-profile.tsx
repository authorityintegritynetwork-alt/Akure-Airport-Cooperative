import { useState } from "react";
import { useUser, useClerk } from "@clerk/react";
import {
  useRegisterMember,
  useListOrganizations,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export function CompleteProfilePage() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const defaultName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "";
  const [fullName, setFullName] = useState(defaultName);
  const [phone, setPhone] = useState("");
  const [memberType, setMemberType] = useState<"staff" | "pensioner">("staff");
  const [staffId, setStaffId] = useState("");
  const [organization, setOrganization] = useState<string>("");

  const { data: organizations, isLoading: orgsLoading } = useListOrganizations();

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
    if (!staffId.trim()) {
      const label = memberType === "pensioner" ? "Pensioner number" : "Staff number";
      toast({ title: `${label} is required`, variant: "destructive" });
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
        memberType,
        staffId: staffId.trim(),
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
              <Label>Member type *</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMemberType("staff")}
                  className={`border rounded-lg px-3 py-3 text-left transition ${
                    memberType === "staff"
                      ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="font-semibold text-sm">Active Staff</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Currently employed</div>
                </button>
                <button
                  type="button"
                  onClick={() => setMemberType("pensioner")}
                  className={`border rounded-lg px-3 py-3 text-left transition ${
                    memberType === "pensioner"
                      ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="font-semibold text-sm">Pensioner</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Retired / pensioner</div>
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="staffId">
                {memberType === "pensioner" ? "Pensioner number" : "Staff number"} *
              </Label>
              <Input
                id="staffId"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                placeholder={memberType === "pensioner" ? "Your pensioner number" : "Your staff number"}
                required
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
