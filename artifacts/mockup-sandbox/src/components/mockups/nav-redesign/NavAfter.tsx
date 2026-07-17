import {
  LayoutDashboard, Wallet, CreditCard, ShoppingCart, ShoppingBag,
  Bell, Users, Settings, UserCog, Shield,
  Building2, Megaphone, Headphones, Sun, Upload,
  BookOpen, Archive, History, Sun as SunIcon,
} from "lucide-react";

function NavItem({
  icon, label, active = false, badge,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  badge?: string;
}) {
  return (
    <li className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
      active
        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
    }`}>
      <span className="w-4 h-4 shrink-0">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge && (
        <span className="text-[9px] font-bold uppercase bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
          {badge}
        </span>
      )}
    </li>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
      {children}
    </p>
  );
}

function GroupDivider() {
  return <div className="mx-3 my-1.5 border-t border-sidebar-border/60" />;
}

export function NavAfter() {
  return (
    <div className="w-[260px] h-screen bg-sidebar flex flex-col border-r border-sidebar-border font-sans relative" style={{ colorScheme: "light" }}>
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">A</div>
          <span className="font-semibold text-xs leading-tight text-sidebar-foreground">
            Akure Airport Staff Co-operative Multipurpose Society Limited
          </span>
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-2 px-2">
        <ul className="space-y-0.5 mb-1">
          <NavItem icon={<LayoutDashboard className="w-4 h-4" />} label="Dashboard" active />
        </ul>

        {/* ── Personal ── */}
        <GroupLabel>Personal</GroupLabel>
        <ul className="space-y-0.5">
          <NavItem icon={<Wallet className="w-4 h-4" />} label="My Savings" />
          <NavItem icon={<CreditCard className="w-4 h-4" />} label="My Loans" />
          <NavItem icon={<ShoppingCart className="w-4 h-4" />} label="Store" />
          <NavItem icon={<ShoppingBag className="w-4 h-4" />} label="My Purchases" />
          <NavItem icon={<Bell className="w-4 h-4" />} label="Notifications" />
          <NavItem icon={<Headphones className="w-4 h-4" />} label="Support" />
        </ul>

        {/* ── Members & Finance ── */}
        <GroupLabel>Members & Finance</GroupLabel>
        <ul className="space-y-0.5">
          <NavItem icon={<Users className="w-4 h-4" />} label="Members" />
          {/* BookOpen instead of Wallet — no longer clashes with My Savings */}
          <NavItem icon={<BookOpen className="w-4 h-4" />} label="Opening Balances" />
          {/* "Loans" without the redundant "All" prefix */}
          <NavItem icon={<CreditCard className="w-4 h-4" />} label="Loans" />
        </ul>

        {/* ── Uploads ── (grouped together, Upload History added) */}
        <GroupLabel>Uploads</GroupLabel>
        <ul className="space-y-0.5">
          {/* Upload icon — clear action signal */}
          <NavItem icon={<Upload className="w-4 h-4" />} label="Upload Deductions" />
          {/* Renamed from "Uploaded Months", matches mobile label, History icon */}
          <NavItem icon={<History className="w-4 h-4" />} label="Upload History" badge="new" />
          {/* Archive icon — distinct from Upload icon above */}
          <NavItem icon={<Archive className="w-4 h-4" />} label="Cooperative Records" />
        </ul>

        {/* ── Commerce ── */}
        <GroupLabel>Commerce</GroupLabel>
        <ul className="space-y-0.5">
          <NavItem icon={<ShoppingCart className="w-4 h-4" />} label="Store Admin" />
          <NavItem icon={<Building2 className="w-4 h-4" />} label="Organisations" />
        </ul>

        {/* ── Communications ── */}
        <GroupLabel>Communications</GroupLabel>
        <ul className="space-y-0.5">
          <NavItem icon={<Megaphone className="w-4 h-4" />} label="Announcements" />
          <NavItem icon={<Headphones className="w-4 h-4" />} label="Support Queue" />
        </ul>

        {/* ── System ── */}
        <GroupLabel>System</GroupLabel>
        <ul className="space-y-0.5">
          <NavItem icon={<Settings className="w-4 h-4" />} label="Settings" />
          <NavItem icon={<UserCog className="w-4 h-4" />} label="Roles" />
          <NavItem icon={<Shield className="w-4 h-4" />} label="Audit Logs" />
        </ul>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">O</div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-sidebar-foreground truncate">Olusegun Adeyemi</span>
            <span className="text-[10px] bg-secondary text-secondary-foreground rounded px-1 py-0.5 w-fit">admin</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="flex-1 border border-sidebar-border rounded-lg py-1.5 text-xs flex items-center justify-center gap-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent">
            <Sun className="w-3.5 h-3.5" /> Theme
          </button>
          <button className="flex-1 border border-sidebar-border rounded-lg py-1.5 text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent">
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
