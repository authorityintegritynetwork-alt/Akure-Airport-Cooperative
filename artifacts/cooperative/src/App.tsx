import { useEffect, useRef, useState } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser, useAuth } from '@clerk/react';
import { InstallBanner } from "@/components/install-banner";
import { shadcn } from '@clerk/themes';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import { StepUpProvider, StepUpGate } from "@/lib/step-up";
import { setAuthTokenGetter } from "@workspace/api-client-react";

import { LandingPage, PendingApproval } from "./pages/landing";
import { AppLayout } from "./components/layout";
import { Dashboard } from "./pages/dashboard";
import { MySavingsPage } from "./pages/my-savings";
import { MyLoansPage } from "./pages/my-loans";
import { StorePage } from "./pages/store";
import { MyPurchasesPage } from "./pages/my-purchases";
import { NotificationsPage } from "./pages/notifications";
import { MembersPage } from "./pages/members";
import { MemberDetailPage } from "./pages/member-detail";
import { OpeningBalancesPage } from "./pages/opening-balances";
import { LoansAdminPage } from "./pages/loans-admin";
import { UploadPage, UploadHistoryPage } from "./pages/upload";
import { StoreAdminPage } from "./pages/store-admin";
import { AuditLogsPage } from "./pages/audit-logs";
import { SettingsPage } from "./pages/settings";
import { RolesPage } from "./pages/roles";
import { CompleteProfilePage } from "./pages/complete-profile";
import { OrganizationsPage } from "./pages/organizations";
import { AnnouncementsPage } from "./pages/announcements";
import { SupportPage } from "./pages/support";
import { SupportAdminPage } from "./pages/support-admin";
import { useGetProfile } from "@workspace/api-client-react";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.png`,
  },
  variables: {
    colorPrimary: "hsl(220 85% 28%)",
    colorForeground: "hsl(160 25% 8%)",
    colorMutedForeground: "hsl(215 16% 42%)",
    colorDanger: "hsl(0 72% 51%)",
    colorBackground: "hsl(0 0% 100%)",
    colorInput: "hsl(215 20% 91%)",
    colorInputForeground: "hsl(160 25% 8%)",
    colorNeutral: "hsl(215 20% 91%)",
    colorModalBackdrop: "rgba(15, 23, 42, 0.55)",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-2xl font-bold text-foreground",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButtonText: "text-foreground font-medium",
    formFieldLabel: "text-foreground font-medium",
    footerActionLink: "text-primary hover:text-primary/90 font-medium",
    footerActionText: "text-muted-foreground",
    dividerText: "text-muted-foreground",
    identityPreviewEditButton: "text-primary",
    formFieldSuccessText: "text-green-600",
    alertText: "text-destructive",
    logoBox: "mb-4",
    logoImage: "w-12 h-12",
    socialButtonsBlockButton: "border-border hover:bg-muted",
    formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow",
    formFieldInput: "bg-background border-input rounded-md",
    footerAction: "mt-4",
    dividerLine: "bg-border",
    alert: "bg-destructive/10 border-destructive/20 text-destructive",
    otpCodeFieldInput: "border-input",
    formFieldRow: "mb-4",
    main: "p-6",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function SignedInRouter({ children }: { children: React.ReactNode }) {
  const { data: profile, isLoading, error } = useGetProfile({
    query: { retry: false, staleTime: 0, queryKey: ["getProfile"] },
  });
  const [location] = useLocation();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;
  }

  const profileMissing = !profile && (error as any);

  if (profileMissing && location !== "/complete-profile") {
    return <Redirect to="/complete-profile" />;
  }
  if (profile && location === "/complete-profile") {
    return <Redirect to="/dashboard" />;
  }
  if (profile && profile.status === "pending" && location !== "/pending-approval") {
    return <Redirect to="/pending-approval" />;
  }

  // Force email-OTP step-up once per Clerk session, before any app page.
  // Bypass for the profile-completion and pending-approval screens — those
  // are part of the sign-up flow and the user has nothing sensitive to access yet.
  if (!profile || location === "/complete-profile" || location === "/pending-approval") {
    return <>{children}</>;
  }

  return <StepUpGate>{children}</StepUpGate>;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
}

function ProtectedRoute({ component: Component, bare }: { component: React.ComponentType; bare?: boolean }) {
  return (
    <>
      <Show when="signed-in">
        <SignedInRouter>
          {bare ? <Component /> : <AppLayout><Component /></AppLayout>}
        </SignedInRouter>
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function ScopedInstallBanner() {
  // Use a separate dismiss key for anonymous visitors vs each signed-in user.
  // This means a logged-in user gets a fresh "post sign-in" prompt even if
  // they previously dismissed the public landing-page banner.
  // Important: do NOT remount the banner with a `key` when scope changes —
  // doing so would lose the cached `beforeinstallprompt` event and prevent
  // the native install bubble from being shown after sign-in.
  const { user, isLoaded } = useUser();
  if (!isLoaded) return null;
  const scopeKey = user?.id ? `user:${user.id}` : "anon";
  return <InstallBanner scopeKey={scopeKey} />;
}

/**
 * Registers a Clerk token getter so every API request carries an
 * Authorization: Bearer header. This is required on non-localhost deployments
 * (e.g. Koyeb) where Clerk dev-instance cookies are not set on the app domain.
 */
function ClerkTokenSync() {
  const { getToken } = useAuth();
  useEffect(() => {
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken]);
  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkTokenSync />
        <ClerkQueryClientCacheInvalidator />
        <ScopedInstallBanner />
        <StepUpProvider>
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route path="/pending-approval" component={PendingApproval} />
          <Route path="/complete-profile">
            <ProtectedRoute component={CompleteProfilePage} bare />
          </Route>

          <Route path="/dashboard">
            <ProtectedRoute component={Dashboard} />
          </Route>
          <Route path="/my-savings">
            <ProtectedRoute component={MySavingsPage} />
          </Route>
          <Route path="/my-loans">
            <ProtectedRoute component={MyLoansPage} />
          </Route>
          <Route path="/store">
            <ProtectedRoute component={StorePage} />
          </Route>
          <Route path="/my-purchases">
            <ProtectedRoute component={MyPurchasesPage} />
          </Route>
          <Route path="/my-notifications">
            <ProtectedRoute component={NotificationsPage} />
          </Route>
          <Route path="/members/:id">
            <ProtectedRoute component={MemberDetailPage} />
          </Route>
          <Route path="/members">
            <ProtectedRoute component={MembersPage} />
          </Route>
          <Route path="/opening-balances">
            <ProtectedRoute component={OpeningBalancesPage} />
          </Route>
          <Route path="/loans">
            <ProtectedRoute component={LoansAdminPage} />
          </Route>
          <Route path="/announcements">
            <ProtectedRoute component={AnnouncementsPage} />
          </Route>
          <Route path="/support">
            <ProtectedRoute component={SupportPage} />
          </Route>
          <Route path="/support-admin">
            <ProtectedRoute component={SupportAdminPage} />
          </Route>
          <Route path="/upload">
            <ProtectedRoute component={UploadPage} />
          </Route>
          <Route path="/upload-history">
            <ProtectedRoute component={UploadHistoryPage} />
          </Route>
          <Route path="/store-admin">
            <ProtectedRoute component={StoreAdminPage} />
          </Route>
          <Route path="/organizations">
            <ProtectedRoute component={OrganizationsPage} />
          </Route>
          <Route path="/audit-logs">
            <ProtectedRoute component={AuditLogsPage} />
          </Route>
          <Route path="/settings">
            <ProtectedRoute component={SettingsPage} />
          </Route>
          <Route path="/roles">
            <ProtectedRoute component={RolesPage} />
          </Route>

          <Route>
            <div className="min-h-screen flex items-center justify-center text-muted-foreground">
              404 — Page not found
            </div>
          </Route>
        </Switch>
        </StepUpProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ThemeProvider>
        <TooltipProvider>
          <ClerkProviderWithRoutes />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </WouterRouter>
  );
}

export default App;
