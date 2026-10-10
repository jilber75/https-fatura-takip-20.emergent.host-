import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AppProvider, useApp } from "@/context/AppContext";
import Layout from "@/components/Layout";
import { Guard } from "@/components/Restricted";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Transactions from "@/pages/Transactions";
import Banks from "@/pages/Banks";
import Caris from "@/pages/Caris";
import Invoices from "@/pages/Invoices";
import DueTracker from "@/pages/DueTracker";
import Reports from "@/pages/Reports";
import Categories from "@/pages/Categories";
import Users from "@/pages/Users";
import { NAV } from "@/components/Sidebar";

const PAGES = { dashboard: Dashboard, transactions: Transactions, bank_accounts: Banks, cari_accounts: Caris,
  invoices: Invoices, due_tracker: DueTracker, reports: Reports, categories: Categories, users: Users };

function Protected({ children }) {
  const { user } = useApp();
  if (user === null) return <div className="min-h-screen grid place-items-center text-slate-500" data-testid="app-loading">Yükleniyor…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function Home() {
  const { user } = useApp();
  const first = NAV.find((n) => user.permissions[n.module]);
  return <Navigate to={first ? first.path : "/genel-bakis"} replace />;
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Protected><Layout /></Protected>}>
            <Route index element={<Home />} />
            {NAV.map((n) => {
              const Page = PAGES[n.module];
              return <Route key={n.module} path={n.path} element={<Guard module={n.module}><Page /></Guard>} />;
            })}
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster theme="dark" position="top-right" richColors />
    </AppProvider>
  );
}
