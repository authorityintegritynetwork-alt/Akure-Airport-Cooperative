import {
  LayoutDashboard, Wallet, CreditCard, ShoppingCart, ShoppingBag,
  Bell, Users, FileSpreadsheet, Settings, UserCog, Shield,
  Building2, Megaphone, Headphones, CalendarRange, Sun,
} from "lucide-react";

function NavItem({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <li className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
      active
        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
    }`}>
      <span className="w-4 h-4 shrink-0">{icon}</span>
      <span>{label}</span>
    </li>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
      {children}
    </p>
  );
}

export function NavBefore() {
  return (
    <div className="w-[260px] h-screen bg-sidebar flex flex-col border-r border-sidebar-border font-sans" style={{ colorScheme: "light" }}>
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
        {/* No label for dashboard */}
        <ul className="space-y-0.5 mb-1">
          <NavItem icon={<LayoutDashboard className="w-4 h-4" />} label="Dashboard" active />
        </ul>

        <GroupLabel>Personal</GroupLabel>
        <ul className="space-y-0.5">
          <NavItem icon={<Wallet className="w-4 h-4" />} label="My Savings" />
          <NavItem icon={<CreditCard className="w-4 h-4" />} label="My Loans" />
          <NavItem icon={<ShoppingCart className="w-4 h-4" />} label="Store" />
          <NavItem icon={<ShoppingBag className="w-4 h-4" />} label="My Purchases" />
          <NavItem icon={<Bell className="w-4 h-4" />} label="Notifications" />
          <NavItem icon={<Headphones className="w-4 h-4" />} label="Support" />
        </ul>

        <GroupLabel>Administration</GroupLabel>
        {/* 10 items dumped into a single flat list */}
        <ul className="space-y-0.5">
          <NavItem icon={<Users className="w-4 h-4" />} label="Members" />
          <NavItem icon={<Wallet className="w-4 h-4" />} label="Opening Balances" />
          <NavItem icon={<CreditCard className="w-4 h-4" />} label="All Loans" />
          <NavItem icon={<FileSpreadsheet className="w-4 h-4" />} label="Upload Deductions" />
          <NavItem icon={<CalendarRange className="w-4 h-4" />} label="Uploaded Months" />
          <NavItem icon={<ShoppingCart className="w-4 h-4" />} label="Store Admin" />
          <NavItem icon={<Building2 className="w-4 h-4" />} label="Organizations" />
          <NavItem icon={<FileSpreadsheet className="w-4 h-4" />} label="Cooperative Records" />
          <NavItem icon={<Megaphone className="w-4 h-4" />} label="Announcements" />
          <NavItem icon={<Headphones className="w-4 h-4" />} label="Support Queue" />
        </ul>

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

      {/* Annotation overlays */}
      <div className="absolute top-0 left-0 right-0 bottom-0 pointer-events-none">
        {/* Annotation: flat list */}
        <div className="absolute right-[-200px] top-[370px] flex items-start gap-2">
          <div className="w-2 h-px bg-rose-400 mt-2.5" />
          <div className="bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5 text-[10px] text-rose-700 max-w-[180px] leading-relaxed">
            <strong>10 items, no sub-groups</strong> — hard to scan, unrelated items mixed together
          </div>
        </div>
        {/* Annotation: duplicate icon */}
        <div className="absolute right-[-200px] top-[490px] flex items-start gap-2">
          <div className="w-2 h-px bg-amber-400 mt-2.5" />
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 text-[10px] text-amber-700 max-w-[180px] leading-relaxed">
            <strong>Duplicate icon</strong> — same FileSpreadsheet used twice
          </div>
        </div>
        {/* Annotation: wallet duplicate */}
        <div className="absolute right-[-200px] top-[412px] flex items-start gap-2">
          <div className="w-2 h-px bg-amber-400 mt-2.5" />
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 text-[10px] text-amber-700 max-w-[180px] leading-relaxed">
            <strong>Wallet used twice</strong> — My Savings and Opening Balances share the same icon
          </div>
        </div>
        {/* Annotation: vague label */}
        <div className="absolute right-[-200px] top-[453px] flex items-start gap-2">
          <div className="w-2 h-px bg-rose-400 mt-2.5" />
          <div className="bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5 text-[10px] text-rose-700 max-w-[180px] leading-relaxed">
            <strong>"Uploaded Months"</strong> — vague; mobile nav calls this "Upload History" (inconsistency)
          </div>
        </div>
        {/* Annotation: missing link */}
        <div className="absolute right-[-200px] top-[570px] flex items-start gap-2">
          <div className="w-2 h-px bg-rose-400 mt-2.5" />
          <div className="bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5 text-[10px] text-rose-700 max-w-[180px] leading-relaxed">
            <strong>Missing from desktop</strong> — "Upload History" exists on mobile "More" but has no desktop link
          </div>
        </div>
      </div>
    </div>
  );
}
