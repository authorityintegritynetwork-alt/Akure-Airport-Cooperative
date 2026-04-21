import { Link, useLocation } from "wouter";
import { useGetProfile } from "@workspace/api-client-react";
import { useClerk } from "@clerk/react";
import logoUrl from "@assets/aacs-logo_1776751208467.png";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, LayoutDashboard, Wallet, CreditCard, ShoppingCart, ShoppingBag, BellRing, Users, FileSpreadsheet, Settings, UserCog, Shield, Sun, Moon, ShieldAlert } from "lucide-react";
import { useListNotifications } from "@workspace/api-client-react";
import { useTheme } from "@/lib/theme";
import { useUser } from "@clerk/react";
import { useState } from "react";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: profile } = useGetProfile();
  const { signOut, openUserProfile } = useClerk();
  const { user } = useUser();
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [twoFaDismissed, setTwoFaDismissed] = useState(
    () => typeof window !== "undefined" && window.sessionStorage.getItem("aacs-2fa-dismissed") === "1",
  );

  function dismissTwoFa() {
    window.sessionStorage.setItem("aacs-2fa-dismissed", "1");
    setTwoFaDismissed(true);
  }

  const { data: notifications } = useListNotifications({ unread: true }, {
    query: {
      enabled: !!profile && profile.status === "active",
      queryKey: ["notifications", { unread: true }],
    }
  });

  const unreadCount = notifications?.length || 0;

  if (!profile) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  const isAdmin = profile.role === "admin" || profile.role === "super_admin";
  const isSuperAdmin = profile.role === "super_admin";
  const isMember = profile.role === "member";

  const navItem = (href: string, icon: React.ReactNode, label: string) => (
    <SidebarMenuItem key={href}>
      <SidebarMenuButton asChild isActive={location === href}>
        <Link href={href}>
          {icon}
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar>
          <SidebarHeader className="p-4">
            <div className="flex items-center gap-2">
              <img src={logoUrl} alt="AASCMS" className="w-9 h-9 object-contain" />

              <span className="font-semibold text-xs leading-tight tracking-tight">
                Akure Airport Staff Co-operative Multipurpose Society Limited
              </span>
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItem("/dashboard", <LayoutDashboard className="w-4 h-4" />, "Dashboard")}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>Personal</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {isMember && navItem("/my-savings", <Wallet className="w-4 h-4" />, "My Savings")}
                  {isMember && navItem("/my-loans", <CreditCard className="w-4 h-4" />, "My Loans")}
                  {isMember && navItem("/store", <ShoppingCart className="w-4 h-4" />, "Store")}
                  {isMember && navItem("/my-purchases", <ShoppingBag className="w-4 h-4" />, "My Purchases")}
                  {navItem("/my-notifications", <Bell className="w-4 h-4" />, "Notifications")}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {isAdmin && (
              <SidebarGroup>
                <SidebarGroupLabel>Administration</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {navItem("/members", <Users className="w-4 h-4" />, "Members")}
                    {navItem("/loans", <CreditCard className="w-4 h-4" />, "All Loans")}
                    {navItem("/upload", <FileSpreadsheet className="w-4 h-4" />, "Upload Deductions")}
                    {navItem("/store-admin", <ShoppingCart className="w-4 h-4" />, "Store Admin")}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {isSuperAdmin && (
              <SidebarGroup>
                <SidebarGroupLabel>System</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {navItem("/settings", <Settings className="w-4 h-4" />, "Settings")}
                    {navItem("/roles", <UserCog className="w-4 h-4" />, "Roles")}
                    {navItem("/audit-logs", <Shield className="w-4 h-4" />, "Audit Logs")}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </SidebarContent>

          <SidebarFooter className="p-4 border-t border-sidebar-border">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                  {profile.fullName.charAt(0)}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium truncate">{profile.fullName}</span>
                  <Badge variant="secondary" className="text-xs w-fit">{profile.role}</Badge>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={toggleTheme}
                  data-testid="button-toggle-theme"
                  title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                >
                  {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => signOut()}>
                  Sign Out
                </Button>
              </div>
            </div>
          </SidebarFooter>
        </Sidebar>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 sticky top-0 z-10">
            <SidebarTrigger />
            <div className="flex items-center gap-4">
              <Link href="/my-notifications" className="relative p-2 rounded-full hover:bg-accent cursor-pointer">
                {unreadCount > 0 ? (
                  <>
                    <BellRing className="w-5 h-5 text-primary" />
                    <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
                  </>
                ) : (
                  <Bell className="w-5 h-5 text-muted-foreground" />
                )}
              </Link>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6 overflow-auto">
            {!twoFaDismissed && user && !user.twoFactorEnabled && (
              <div
                className="mb-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 p-3"
                data-testid="banner-2fa-reminder"
              >
                <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div className="flex-1 text-sm">
                  <p className="font-medium text-amber-900 dark:text-amber-200">
                    Protect your account with two-factor authentication
                  </p>
                  <p className="text-amber-800 dark:text-amber-300/80 mt-0.5">
                    Add a second sign-in step to keep your savings, loans and member data safe.
                    It takes under a minute from your account security settings.
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openUserProfile?.()}
                    data-testid="button-open-2fa-settings"
                  >
                    Enable 2FA
                  </Button>
                  <Button size="sm" variant="ghost" onClick={dismissTwoFa} data-testid="button-dismiss-2fa">
                    Dismiss
                  </Button>
                </div>
              </div>
            )}
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
