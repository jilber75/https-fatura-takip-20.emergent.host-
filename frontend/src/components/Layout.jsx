import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { LogOut, Menu } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { Sidebar, NAV } from "@/components/Sidebar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { CURRENCIES, SYMBOL } from "@/lib/format";

function CurrencyToggle() {
  const { currency, setCurrency } = useApp();
  return (
    <div className="flex bg-[#12141c] border border-slate-800 rounded-full p-1" data-testid="currency-toggle">
      {CURRENCIES.map((c) => (
        <button key={c} onClick={() => setCurrency(c)} data-testid={`currency-toggle-${c.toLowerCase()}`}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${currency === c ? "bg-indigo-500 text-white" : "text-slate-400 hover:text-white"}`}>
          {SYMBOL[c]} {c}
        </button>
      ))}
    </div>
  );
}

export default function Layout() {
  const { logout, rates } = useApp();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const title = NAV.find((n) => pathname.startsWith(n.path))?.label || "";
  return (
    <div className="min-h-screen flex fp-grid-bg">
      <aside className="hidden lg:block w-[260px] shrink-0 border-r border-slate-800/70 bg-[#0b0c12] fixed inset-y-0">
        <Sidebar />
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="p-0 w-[260px] bg-[#0b0c12]">
          <SheetTitle className="sr-only">Menü</SheetTitle>
          <Sidebar onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex-1 lg:ml-[260px] min-w-0">
        <header className="sticky top-0 z-30 h-16 backdrop-blur-md bg-[#090a0f]/80 border-b border-slate-800/70 flex items-center gap-3 px-4 sm:px-6">
          <button className="lg:hidden text-slate-300" onClick={() => setOpen(true)} data-testid="mobile-menu-button"><Menu /></button>
          <h1 className="font-bold text-base sm:text-lg truncate" data-testid="page-title">{title}</h1>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden md:flex gap-4 text-xs num text-slate-400" data-testid="rate-ticker">
              <span>USD/TRY <b className="text-slate-200">{rates.USD?.toFixed(2)}</b></span>
              <span>EUR/TRY <b className="text-slate-200">{rates.EUR?.toFixed(2)}</b></span>
            </div>
            <CurrencyToggle />
            <button onClick={logout} title="Çıkış" data-testid="logout-button"
              className="w-9 h-9 grid place-items-center rounded-full border border-slate-800 text-slate-400 hover:text-red-300 hover:border-red-500/40 transition-colors">
              <LogOut size={16} />
            </button>
          </div>
        </header>
        <main className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
