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
import { Bell, LayoutDashboard, Wallet, CreditCard, ShoppingCart, ShoppingBag, BellRing, Users, Settings, UserCog, Shield, Sun, Moon, Building2, Megaphone, Headphones, BookOpen, Upload, Archive, History, FileText, Zap } from "lucide-react";
import { useListNotifications } from "@workspace/api-client-react";
import { useTheme } from "@/lib/theme";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { AdminMobileBottomNav } from "@/components/admin-mobile-bottom-nav";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: profile } = useGetProfile();
  const { signOut } = useClerk();
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();

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
  // Roles that have a dedicated mobile bottom nav. Other staff (auditor,
  // treasurer) keep the sidebar/hamburger as their primary mobile nav.
  const hasMobileBottomNav = isMember || isAdmin;

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
                  {isMember && navItem("/support", <Headphones className="w-4 h-4" />, "Support")}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {isAdmin && (
              <>
                <SidebarGroup>
                  <SidebarGroupLabel>Members & Finance</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {navItem("/members", <Users className="w-4 h-4" />, "Members")}
                      {navItem("/statements", <FileText className="w-4 h-4" />, "Account Statements")}
                      {navItem("/opening-balances", <BookOpen className="w-4 h-4" />, "Opening Balances")}
                      {navItem("/loans", <CreditCard className="w-4 h-4" />, "Loans")}
                      {navItem("/admin-actions", <Zap className="w-4 h-4" />, "Admin Actions")}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>

                <SidebarGroup>
                  <SidebarGroupLabel>Uploads</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {navItem("/upload", <Upload className="w-4 h-4" />, "Upload Deductions")}
                      {navItem("/upload-history", <History className="w-4 h-4" />, "Upload History")}
                      {navItem("/cooperative-records", <Archive className="w-4 h-4" />, "Cooperative Records")}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>

                <SidebarGroup>
                  <SidebarGroupLabel>Commerce</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {navItem("/store-admin", <ShoppingCart className="w-4 h-4" />, "Store Admin")}
                      {navItem("/organizations", <Building2 className="w-4 h-4" />, "Organizations")}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>

                <SidebarGroup>
                  <SidebarGroupLabel>Communications</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {navItem("/announcements", <Megaphone className="w-4 h-4" />, "Announcements")}
                      {navItem("/support-admin", <Headphones className="w-4 h-4" />, "Support Queue")}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </>
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
          <header className="h-14 border-b border-border bg-card/80 backdrop-blur flex items-center justify-between px-4 sticky top-0 z-30">
            {/* Roles with a dedicated mobile bottom nav hide the hamburger on
                small screens; everyone else (auditor, treasurer) keeps it. */}
            <div className={hasMobileBottomNav ? "hidden md:block" : "block"}>
              <SidebarTrigger />
            </div>

            {/* On mobile show a compact brand for everyone so the header isn't empty */}
            <Link
              href="/dashboard"
              className="md:hidden flex items-center gap-2 min-w-0"
              data-testid="mobile-header-brand"
            >
              <img src={logoUrl} alt="AASCMS" className="w-7 h-7 object-contain shrink-0" />
              <span className="font-semibold text-sm truncate">AASCMS</span>
            </Link>

            <div className="flex items-center gap-1">
              <Link
                href="/my-notifications"
                className="relative p-2 rounded-full hover:bg-accent cursor-pointer"
                data-testid="header-notifications"
              >
                {unreadCount > 0 ? (
                  <>
                    <BellRing className="w-5 h-5 text-primary" />
                    <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-card" />
                  </>
                ) : (
                  <Bell className="w-5 h-5 text-muted-foreground" />
                )}
              </Link>
            </div>
          </header>
          <main
            className="flex-1 overflow-auto p-4 md:p-6 pb-24 md:pb-6"
          >
            {children}
          </main>
        </div>

        {isMember && <MobileBottomNav />}
        {isAdmin && <AdminMobileBottomNav />}
      </div>
    </SidebarProvider>
  );
}
