import { NavLink } from "react-router-dom";
import { ArrowLeftRight, CalendarClock, FileText, Landmark, LayoutDashboard, PieChart, Tags, Users, UsersRound, Activity } from "lucide-react";
import { useApp } from "@/context/AppContext";

export const NAV = [
  { module: "dashboard", path: "/genel-bakis", label: "Genel Bakış", icon: LayoutDashboard, tid: "nav-dashboard-link" },
  { module: "transactions", path: "/gelir-gider", label: "Gelir & Gider", icon: ArrowLeftRight, tid: "nav-transactions-link" },
  { module: "bank_accounts", path: "/bankalar", label: "Banka Hesapları", icon: Landmark, tid: "nav-bank-accounts-link" },
  { module: "cari_accounts", path: "/cariler", label: "Cari Hesaplar", icon: UsersRound, tid: "nav-cari-accounts-link" },
  { module: "invoices", path: "/faturalar", label: "Faturalar", icon: FileText, tid: "nav-invoices-link" },
  { module: "due_tracker", path: "/vade-takibi", label: "Ödeme & Tahsilat", icon: CalendarClock, tid: "nav-due-tracker-link" },
  { module: "reports", path: "/raporlar", label: "Raporlar", icon: PieChart, tid: "nav-reports-link" },
  { module: "categories", path: "/kategoriler", label: "Kategoriler", icon: Tags, tid: "nav-categories-link" },
  { module: "users", path: "/kullanicilar", label: "Kullanıcılar", icon: Users, tid: "nav-user-management-link" },
];

export function Sidebar({ onNavigate }) {
  const { can, user } = useApp();
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 h-16 border-b border-slate-800/70">
        <div className="w-9 h-9 rounded-xl bg-indigo-500 grid place-items-center shadow-[0_0_24px_rgba(99,102,241,0.5)]">
          <Activity size={18} className="text-white" />
        </div>
        <div>
          <div className="font-extrabold tracking-tight leading-none">FinansPulse</div>
          <div className="text-[11px] text-slate-500 mt-1">Nakit akışı kontrol merkezi</div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV.filter((n) => can(n.module)).map((n) => (
          <NavLink key={n.module} to={n.path} onClick={onNavigate} data-testid={n.tid}
            className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors duration-200 ${
              isActive ? "bg-indigo-500/15 text-indigo-200 border border-indigo-500/30" : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.03] border border-transparent"}`}>
            <n.icon size={17} />
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-slate-800/70">
        <div className="flex items-center gap-3" data-testid="sidebar-user-badge">
          <div className="w-9 h-9 rounded-full bg-emerald-500/15 text-emerald-300 grid place-items-center font-bold text-sm">
            {user?.name?.[0] || "?"}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{user?.name}</div>
            <div className="text-xs text-slate-500 truncate">{user?.role === "admin" ? "Yönetici" : user?.title}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
