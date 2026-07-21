import { useClerk } from "@clerk/react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, ShieldCheck, TrendingUp, Users, CheckCircle2, Sparkles, LogOut } from "lucide-react";
import logoUrl from "@assets/aacs-logo_1776751208467.png";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function LandingPage() {
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <header className="px-6 lg:px-12 py-5 flex items-center justify-between border-b border-border/60 backdrop-blur-sm sticky top-0 bg-background/80 z-10">
        <div className="flex items-center gap-2.5">
          <img src={logoUrl} alt="AASCMS Logo" className="w-10 h-10 object-contain" />
          <span className="hidden sm:block font-semibold text-sm md:text-base tracking-tight text-foreground leading-tight">
            Akure Airport Staff Co-operative Multipurpose Society Limited
          </span>
          <span className="sm:hidden font-semibold text-sm tracking-tight text-foreground">
            AASCMS
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/sign-in")}>Sign In</Button>
          <Button size="sm" className="shadow-sm" onClick={() => setLocation("/sign-up")}>Get Started</Button>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="px-6 lg:px-12 pt-20 pb-24 max-w-6xl mx-auto w-full">
          <div className="flex flex-col items-center text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent border border-accent-foreground/10 mb-8">
              <Sparkles className="w-3.5 h-3.5 text-accent-foreground" />
              <span className="text-xs font-medium text-accent-foreground">Trusted by Akure Airport Staff</span>
            </div>

            <h1 className="text-5xl md:text-7xl font-bold tracking-tighter text-foreground mb-6 leading-[1.05]">
              One society. One purpose.<br />
              <span className="text-primary">Shared prosperity.</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed">
              Secure savings, transparent loans, and cooperative commerce — all in one platform built exclusively for the Akure Airport Staff Cooperative Society.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button size="lg" className="text-base px-7 shadow-md group" onClick={() => setLocation("/sign-up")}>
                Join the Cooperative
                <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-0.5 transition-transform" />
              </Button>
              <Button variant="outline" size="lg" className="text-base px-7" onClick={() => setLocation("/sign-in")}>
                Member Sign In
              </Button>
            </div>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                Bank-grade security
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                Member-approved loans
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                Automated savings
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="px-6 lg:px-12 pb-24 max-w-6xl mx-auto w-full">
          <div className="grid md:grid-cols-3 gap-5">
            <Card className="group border-border/70 hover:border-primary/30 transition-colors shadow-sm hover:shadow-md">
              <CardContent className="p-7">
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-5 group-hover:bg-primary/15 transition-colors">
                  <TrendingUp className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2 tracking-tight">Effortless Savings</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Monthly contributions automatically deducted and reconciled. Watch your savings grow with full transparency.
                </p>
              </CardContent>
            </Card>

            <Card className="group border-border/70 hover:border-primary/30 transition-colors shadow-sm hover:shadow-md">
              <CardContent className="p-7">
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-5 group-hover:bg-primary/15 transition-colors">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2 tracking-tight">Transparent Loans</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Apply in minutes and track every step. A multi-stage approval workflow keeps the process fair, accountable, and member-focused.
                </p>
              </CardContent>
            </Card>

            <Card className="group border-border/70 hover:border-primary/30 transition-colors shadow-sm hover:shadow-md">
              <CardContent className="p-7">
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-5 group-hover:bg-primary/15 transition-colors">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2 tracking-tight">Cooperative Store</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Buy essentials on credit with flexible repayment. A community marketplace owned by members, for members.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* How it works */}
        <section className="px-6 lg:px-12 pb-24 max-w-6xl mx-auto w-full">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold tracking-tight">How it works</h2>
            <p className="text-muted-foreground mt-2">Up and running in three steps.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                title: "Register your account",
                body: "Sign up with your staff details. An admin verifies your identity and activates your account — usually within one working day.",
              },
              {
                step: "2",
                title: "Deductions are uploaded monthly",
                body: "Your payroll deductions are reconciled each month by the cooperative admin team. Your savings and loan repayments update automatically.",
              },
              {
                step: "3",
                title: "Track everything in real time",
                body: "Log in anytime to see your savings balance, loan status, store purchases, and a full monthly breakdown — all in one place.",
              },
            ].map(({ step, title, body }) => (
              <div key={step} className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold mb-4 shadow-md shadow-primary/25">
                  {step}
                </div>
                <h3 className="font-semibold text-base mb-2 tracking-tight">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="px-6 lg:px-12 pb-24 max-w-6xl mx-auto w-full">
          <div className="rounded-2xl bg-sidebar text-sidebar-foreground p-10 md:p-14 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-transparent" />
            <div className="relative">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
                Ready to take control of your future?
              </h2>
              <p className="text-sidebar-foreground/70 max-w-xl mx-auto mb-7">
                Join hundreds of airport staff already building wealth together.
              </p>
              <Button size="lg" variant="secondary" className="text-base px-7 shadow-lg" onClick={() => setLocation("/sign-up")}>
                Create Your Account
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="px-6 lg:px-12 py-8 border-t border-border/60 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Akure Airport Staff Cooperative Multipurpose Society. All rights reserved.
      </footer>
    </div>
  );
}

export function PendingApproval() {
  const { signOut } = useClerk();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full text-center shadow-lg border-border/70">
        <CardContent className="pt-8 pb-8 px-7">
          <div className="w-16 h-16 bg-accent rounded-2xl flex items-center justify-center mx-auto mb-5">
            <ShieldCheck className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight mb-2">Account Under Review</h2>
          <p className="text-muted-foreground mb-6 leading-relaxed">
            Your registration has been received. An administrator will verify your staff details and activate your account shortly. You'll be able to sign back in once your account is approved.
          </p>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => signOut({ redirectUrl: "/" })}
            data-testid="button-pending-signout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
