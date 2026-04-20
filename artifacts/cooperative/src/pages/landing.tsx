import { SignInButton, SignUpButton, Show } from "@clerk/react";
import { Link, Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck, TrendingUp, Users } from "lucide-react";

export function LandingPage() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <header className="px-6 py-4 flex items-center justify-between border-b">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="AAS Coop Logo" className="w-8 h-8" />
          <span className="font-bold text-xl text-primary">AAS Cooperative</span>
        </div>
        <div className="flex items-center gap-4">
          <SignInButton mode="modal">
            <Button variant="ghost">Sign In</Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button>Register</Button>
          </SignUpButton>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-5xl mx-auto w-full">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground mb-6">
          Akure Airport Staff <br />
          <span className="text-primary">Cooperative Society</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mb-12">
          Empowering airport staff through secure savings, accessible loans, and cooperative commerce. A trusted financial institution built for our community.
        </p>

        <div className="grid md:grid-cols-3 gap-6 w-full mb-12">
          <Card className="bg-card">
            <CardContent className="pt-6 flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <TrendingUp className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Grow Your Savings</h3>
              <p className="text-sm text-muted-foreground">Automated deductions make saving effortless and secure.</p>
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardContent className="pt-6 flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <ShieldCheck className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Accessible Loans</h3>
              <p className="text-sm text-muted-foreground">Fair interest rates and flexible tenure for your financial needs.</p>
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardContent className="pt-6 flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Community Store</h3>
              <p className="text-sm text-muted-foreground">Purchase essential commodities on credit with easy repayment.</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex gap-4">
          <SignUpButton mode="modal">
            <Button size="lg" className="text-lg px-8">Join the Cooperative</Button>
          </SignUpButton>
        </div>
      </main>

      <footer className="py-6 text-center border-t text-sm text-muted-foreground">
        © {new Date().getFullYear()} Akure Airport Staff Cooperative Multipurpose Society.
      </footer>
    </div>
  );
}

export function PendingApproval() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full text-center">
        <CardContent className="pt-6 pb-8 px-6">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Account Under Review</h2>
          <p className="text-muted-foreground mb-6">
            Your registration has been received. An administrator must verify your staff details and activate your account before you can access the platform.
          </p>
          <Button variant="outline" className="w-full" onClick={() => window.location.href = '/'}>
            Return Home
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
