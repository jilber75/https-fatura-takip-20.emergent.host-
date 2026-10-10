import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, FileUp, Plus, Wallet } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { daysUntil, fmtCompact, fmtDate, fmtMoney, monthLabel } from "@/lib/format";
import { Amount, Empty, Kpi, PageHead, nameOf } from "@/components/common";
import TxDialog from "@/components/TxDialog";

function ChartTip({ active, payload, label, cur }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="fp-card p-3 text-xs space-y-1">
      <div className="font-semibold mb-1">{monthLabel(label)}</div>
      {payload.filter((p) => p.value).map((p) => (
        <div key={p.dataKey} className="flex gap-3 justify-between"><span style={{ color: p.color }}>{p.name}</span><span className="num">{fmtMoney(p.value, cur)}</span></div>
      ))}
    </div>
  );
}

function CashflowChart({ data, cur }) {
  return (
    <div className="fp-card p-5 lg:col-span-2 fp-rise" data-testid="cashflow-chart">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="font-semibold">Nakit Akışı</h3>
        <span className="text-xs text-slate-500">Son 6 ay gerçekleşen · 3 ay vadeli tahmin</span>
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
            <CartesianGrid stroke="#1e293b" vertical={false} />
            <XAxis dataKey="month" tickFormatter={monthLabel} stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={(v) => fmtCompact(v, cur)} stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} width={64} />
            <Tooltip content={<ChartTip cur={cur} />} cursor={{ fill: "rgba(99,102,241,0.06)" }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="income" name="Gelir" stackId="i" fill="#10b981" radius={[0, 0, 0, 0]} />
            <Bar dataKey="projected_income" name="Beklenen Tahsilat" stackId="i" fill="#10b98155" radius={[6, 6, 0, 0]} />
            <Bar dataKey="expense" name="Gider" stackId="e" fill="#ef4444" />
            <Bar dataKey="projected_expense" name="Beklenen Ödeme" stackId="e" fill="#ef444455" radius={[6, 6, 0, 0]} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function BanksPanel({ banks, cur, rates }) {
  return (
    <div className="fp-card p-5 fp-rise" data-testid="dashboard-banks">
      <h3 className="font-semibold mb-4">Banka Hesapları</h3>
      <div className="space-y-3">
        {banks.length === 0 && <Empty text="Henüz banka hesabı yok" />}
        {banks.map((b) => (
          <div key={b.id} className="flex items-center justify-between bg-[#1a1e2e]/60 rounded-xl p-3">
            <div className="min-w-0"><div className="text-sm font-medium truncate">{b.name}</div><div className="text-xs text-slate-500">{b.bank_name}</div></div>
            <div className="text-right">
              <div className="num text-sm font-semibold">{fmtMoney(b.balance, b.currency)}</div>
              {b.currency !== cur && <div className="num text-[11px] text-slate-500">≈ {fmtMoney((b.balance * rates[b.currency]) / rates[cur], cur)}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TxList({ title, items, testid, due }) {
  const { lookups } = useApp();
  return (
    <div className="fp-card p-5 fp-rise" data-testid={testid}>
      <h3 className="font-semibold mb-4">{title}</h3>
      {items.length === 0 && <Empty text="Kayıt yok" />}
      <div className="divide-y divide-slate-800/70">
        {items.map((t) => {
          const d = due ? daysUntil(t.due_date || t.date) : null;
          return (
            <div key={t.id} className="flex items-center gap-3 py-3">
              <span className={`w-8 h-8 rounded-lg grid place-items-center ${t.type === "income" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                {t.type === "income" ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate">{t.description || nameOf(lookups.caris, t.cari_id)}</div>
                <div className="text-xs text-slate-500">
                  {due ? <span className={d < 0 ? "text-red-400" : d <= 3 ? "text-amber-400" : "text-sky-400"}>{d < 0 ? `${-d} gün gecikti` : d === 0 ? "Bugün" : `${d} gün kaldı`}</span> : fmtDate(t.date)}
                  {t.cari_id && ` · ${nameOf(lookups.caris, t.cari_id)}`}
                </div>
              </div>
              <Amount tx={t} className="text-sm" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { currency: cur, rates, can } = useApp();
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => api.get("/dashboard", { params: { cur } }).then((r) => setD(r.data)), [cur]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <PageHead title="Genel Bakış" sub="Nakit pozisyonunuz ve yaklaşan hareketler, anlık.">
        {can("invoices") && <Link to="/faturalar" data-testid="quick-upload-invoice" className="h-10 px-4 rounded-full border border-slate-700 hover:border-indigo-400 text-sm flex items-center gap-2 transition-colors"><FileUp size={15} /> Fatura Yükle</Link>}
        {can("transactions") && <button onClick={() => setOpen(true)} data-testid="add-transaction-button" className="h-10 px-4 rounded-full bg-indigo-500 hover:bg-indigo-400 text-sm font-semibold flex items-center gap-2 transition-colors"><Plus size={15} /> Yeni İşlem</button>}
      </PageHead>
      {!d ? <div className="text-slate-500" data-testid="dashboard-loading">Yükleniyor…</div> : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi label="Toplam Nakit" value={fmtMoney(d.total_cash, cur)} icon={Wallet} tone="indigo" testid="kpi-total-cash" hint={`Bu ay net: ${fmtMoney(d.month_net, cur)}`} />
            <Kpi label="Bu Ay Gelir" value={fmtMoney(d.month_income, cur)} icon={ArrowDownLeft} tone="emerald" testid="kpi-month-income" delay={60} />
            <Kpi label="Bu Ay Gider" value={fmtMoney(d.month_expense, cur)} icon={ArrowUpRight} tone="red" testid="kpi-month-expense" delay={120} />
            <Kpi label="30 Gün Vadeli" value={fmtMoney(d.upcoming_receivable - d.upcoming_payable, cur)} icon={AlertTriangle} tone="amber" testid="kpi-upcoming" delay={180}
              hint={`Tahsilat ${fmtMoney(d.upcoming_receivable, cur)} · Ödeme ${fmtMoney(d.upcoming_payable, cur)}${d.overdue ? ` · Gecikmiş ${fmtMoney(d.overdue, cur)}` : ""}`} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <CashflowChart data={d.cashflow} cur={cur} />
            <BanksPanel banks={d.banks} cur={cur} rates={rates} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TxList title="Yaklaşan Ödeme & Tahsilatlar" items={d.upcoming} testid="dashboard-upcoming" due />
            <TxList title="Son Hareketler" items={d.recent} testid="dashboard-recent" />
          </div>
        </div>
      )}
      <TxDialog open={open} onOpenChange={setOpen} onSaved={load} />
    </div>
  );
}
