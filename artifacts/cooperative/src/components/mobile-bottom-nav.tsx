import { Link, useLocation } from "wouter";
import { useState } from "react";
import { useClerk } from "@clerk/react";
import { useGetProfile, useListNotifications } from "@workspace/api-client-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import {
  Home,
  Wallet,
  CreditCard,
  ShoppingCart,
  MoreHorizontal,
  Bell,
  ShoppingBag,
  Sun,
  Moon,
  LogOut,
} from "lucide-react";

type Tab = {
  href?: string;
  icon: React.ReactNode;
  label: string;
  more?: boolean;
};

export function MobileBottomNav() {
  const [location] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const { signOut } = useClerk();
  const { theme, toggleTheme } = useTheme();
  const { data: profile } = useGetProfile();
  const { data: notifications } = useListNotifications(
    { unread: true },
    {
      query: {
        enabled: !!profile && profile.status === "active",
        queryKey: ["notifications", { unread: true }],
      },
    },
  );
  const unreadCount = notifications?.length || 0;

  const tabs: Tab[] = [
    { href: "/dashboard", icon: <Home className="w-5 h-5" />, label: "Home" },
    { href: "/my-savings", icon: <Wallet className="w-5 h-5" />, label: "Savings" },
    { href: "/my-loans", icon: <CreditCard className="w-5 h-5" />, label: "Loans" },
    { href: "/store", icon: <ShoppingCart className="w-5 h-5" />, label: "Store" },
    { icon: <MoreHorizontal className="w-5 h-5" />, label: "More", more: true },
  ];

  function isActive(href?: string) {
    if (!href) return false;
    return location === href || location.startsWith(href + "/");
  }

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.12)] pb-[env(safe-area-inset-bottom)]"
        data-testid="mobile-bottom-nav"
      >
        <ul className="grid grid-cols-5">
          {tabs.map((tab) => {
            const active = isActive(tab.href);
            const content = (
              <div
                className={`flex flex-col items-center justify-center gap-1 py-2.5 px-1 transition-all relative ${
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 rounded-b-full bg-gradient-to-r from-primary to-blue-500" />
                )}
                <div
                  className={`relative ${
                    active ? "scale-110" : ""
                  } transition-transform`}
                >
                  {tab.icon}
                  {tab.label === "More" && unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium leading-none">
                  {tab.label}
                </span>
              </div>
            );

            return (
              <li key={tab.label}>
                {tab.more ? (
                  <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
                    <SheetTrigger asChild>
                      <button
                        type="button"
                        className="w-full"
                        data-testid="bottom-nav-more"
                      >
                        {content}
                      </button>
                    </SheetTrigger>
                    <SheetContent
                      side="bottom"
                      className="rounded-t-3xl border-t-2 max-h-[80vh] overflow-y-auto"
                    >
                      <SheetHeader className="text-left">
                        <SheetTitle>More</SheetTitle>
                      </SheetHeader>

                      {profile && (
                        <div className="mt-4 flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/15">
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-blue-500 text-primary-foreground flex items-center justify-center text-lg font-bold shadow-md">
                            {profile.fullName?.charAt(0).toUpperCase() ?? "?"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold truncate">
                              {profile.fullName}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {profile.email}
                            </p>
                          </div>
                          <Badge variant="secondary" className="shrink-0">
                            {profile.role}
                          </Badge>
                        </div>
                      )}

                      <div className="mt-4 space-y-1.5">
                        <MoreLink
                          href="/my-purchases"
                          icon={<ShoppingBag className="w-5 h-5" />}
                          label="My Purchases"
                          onClick={() => setMoreOpen(false)}
                        />
                        <MoreLink
                          href="/my-notifications"
                          icon={<Bell className="w-5 h-5" />}
                          label="Notifications"
                          badge={unreadCount > 0 ? unreadCount : undefined}
                          onClick={() => setMoreOpen(false)}
                        />
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          className="rounded-xl h-12 gap-2"
                          onClick={toggleTheme}
                          data-testid="more-toggle-theme"
                        >
                          {theme === "dark" ? (
                            <>
                              <Sun className="w-4 h-4" /> Light
                            </>
                          ) : (
                            <>
                              <Moon className="w-4 h-4" /> Dark
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          className="rounded-xl h-12 gap-2 text-destructive hover:text-destructive"
                          onClick={() => {
                            setMoreOpen(false);
                            signOut();
                          }}
                          data-testid="more-sign-out"
                        >
                          <LogOut className="w-4 h-4" /> Sign out
                        </Button>
                      </div>
                    </SheetContent>
                  </Sheet>
                ) : (
                  <Link href={tab.href!} data-testid={`bottom-nav-${tab.label.toLowerCase()}`}>
                    {content}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

function MoreLink({
  href,
  icon,
  label,
  badge,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/60 active:bg-muted transition-colors text-left no-underline text-foreground"
    >
      <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
        {icon}
      </div>
      <span className="flex-1 font-medium">{label}</span>
      {badge !== undefined && (
        <Badge variant="destructive" className="rounded-full">
          {badge}
        </Badge>
      )}
    </Link>
  );
}
