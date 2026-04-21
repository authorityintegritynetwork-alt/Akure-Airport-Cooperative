import { useState } from "react";
import { useUser, useClerk } from "@clerk/react";
import { useRegisterMember } from "@workspace/api-client-react";
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
  const [staffId, setStaffId] = useState("");

  const register = useRegisterMember({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries();
        toast({ title: "Welcome!", description: "Your account has been created." });
        setLocation("/dashboard");
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
    register.mutate({
      data: {
        fullName: fullName.trim(),
        phone: phone.trim() || undefined,
        staffId: staffId.trim() || undefined,
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
            <Button type="submit" className="w-full mt-2" disabled={register.isPending}>
              {register.isPending ? "Creating account..." : "Create account"}
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
