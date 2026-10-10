import { useEffect, useState } from "react";
import { Download, Printer } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { downloadCSV, fmtCompact, fmtMoney, monthLabel, today } from "@/lib/format";
import { Empty, Kpi, PageHead } from "@/components/common";
import { Input } from "@/components/ui/input";

const y = new Date().getFullYear();
const PRESETS = {
  month: () => [today().slice(0, 8) + "01", today()],
  q: () => { const d = new Date(); d.setMonth(d.getMonth() - 2); return [`${d.toISOString().slice(0, 7)}-01`, today()]; },
  year: () => [`${y}-01-01`, `${y}-12-31`],
};

function CatBreakdown({ title, rows, cur, testid }) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <div className="fp-card p-5" data-testid={testid}>
      <h3 className="font-semibold mb-4">{title}</h3>
      {rows.length === 0 ? <Empty text="Bu dönemde kayıt yok" /> : (
        <div className="grid sm:grid-cols-2 gap-4 items-center">
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={rows} dataKey="amount" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={2} stroke="none">
                  {rows.map((r) => <Cell key={r.name} fill={r.color} />)}
                </Pie>
                <Tooltip formatter={(v) => fmtMoney(v, cur)} contentStyle={{ background: "#12141c", border: "1px solid #1e293b", borderRadius: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.name} className="flex items-center gap-2 text-sm">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.color }} />
                <span className="flex-1 truncate text-slate-300">{r.name}</span>
                <span className="num text-xs text-slate-500">{((r.amount / total) * 100).toFixed(1)}%</span>
                <span className="num text-xs w-28 text-right">{fmtMoney(r.amount, cur)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Reports() {
  const { currency: cur } = useApp();
  const [range, setRange] = useState(PRESETS.year());
  const [preset, setPreset] = useState("year");
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/reports", { params: { start: range[0], end: range[1], cur } }).then((r) => setD(r.data)); }, [range, cur]);

  const pick = (k) => { setPreset(k); setRange(PRESETS[k]()); };
  const exportCsv = () => downloadCSV(`rapor-${range[0]}-${range[1]}.csv`, [
    ["Rapor Dönemi", range[0], range[1], cur], [],
    ["Toplam Gelir", d.total_income], ["Toplam Gider", d.total_expense], ["Net", d.net], ["Tahsil Edilen KDV", d.vat_income], ["Ödenen KDV", d.vat_expense], [],
    ["Ay", "Gelir", "Gider", "Net"], ...d.monthly.map((m) => [m.month, m.income, m.expense, m.net]), [],
    ["Gider Kategorisi", "Tutar"], ...d.expense_by_category.map((r) => [r.name, r.amount]), [],
    ["Gelir Kategorisi", "Tutar"], ...d.income_by_category.map((r) => [r.name, r.amount]), [],
    ["Cari", "Gelir", "Gider"], ...d.by_cari.map((r) => [r.name, r.income, r.expense])]);

  return (
    <div>
      <PageHead title="Finansal Raporlar" sub={`Dönem: ${range[0]} → ${range[1]} · ${cur} karşılığı`}>
        <button onClick={exportCsv} disabled={!d} data-testid="export-report-csv" className="no-print h-10 px-4 rounded-full border border-slate-700 hover:border-slate-500 text-sm flex items-center gap-2"><Download size={15} /> Excel (CSV)</button>
        <button onClick={() => window.print()} data-testid="print-report-button" className="no-print h-10 px-4 rounded-full border border-slate-700 hover:border-slate-500 text-sm flex items-center gap-2"><Printer size={15} /> PDF / Yazdır</button>
      </PageHead>
      <div className="no-print flex flex-wrap items-center gap-2 mb-6" data-testid="report-range">
        {[["month", "Bu Ay"], ["q", "Son 3 Ay"], ["year", "Bu Yıl"]].map(([k, l]) => (
          <button key={k} onClick={() => pick(k)} data-testid={`report-preset-${k}`} className={`px-4 py-1.5 rounded-full text-sm border transition-colors ${preset === k ? "bg-indigo-500/15 border-indigo-500/40 text-indigo-200" : "border-slate-800 text-slate-400 hover:text-white"}`}>{l}</button>
        ))}
        <Input type="date" value={range[0]} onChange={(e) => { setPreset(""); setRange([e.target.value, range[1]]); }} className="w-40" data-testid="report-start-date" />
        <Input type="date" value={range[1]} onChange={(e) => { setPreset(""); setRange([range[0], e.target.value]); }} className="w-40" data-testid="report-end-date" />
      </div>
      {!d ? <div className="text-slate-500">Yükleniyor…</div> : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi label="Toplam Gelir" value={fmtMoney(d.total_income, cur)} testid="report-total-income" hint={`Bekleyen: ${fmtMoney(d.pending_income, cur)}`} />
            <Kpi label="Toplam Gider" value={fmtMoney(d.total_expense, cur)} testid="report-total-expense" hint={`Bekleyen: ${fmtMoney(d.pending_expense, cur)}`} />
            <Kpi label="Net Kâr / Zarar" value={fmtMoney(d.net, cur)} testid="report-net" tone={d.net >= 0 ? "emerald" : "red"} />
            <Kpi label="KDV Farkı" value={fmtMoney(d.vat_income - d.vat_expense, cur)} testid="report-vat" hint={`Hesaplanan ${fmtMoney(d.vat_income, cur)} · İndirilecek ${fmtMoney(d.vat_expense, cur)}`} />
          </div>
          <div className="fp-card p-5" data-testid="report-monthly-chart">
            <h3 className="font-semibold mb-4">Aylık Kâr / Zarar</h3>
            {d.monthly.length === 0 ? <Empty text="Bu dönemde kayıt yok" /> : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.monthly}>
                    <CartesianGrid stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="month" tickFormatter={monthLabel} stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={(v) => fmtCompact(v, cur)} stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} width={64} />
                    <Tooltip formatter={(v) => fmtMoney(v, cur)} labelFormatter={monthLabel} contentStyle={{ background: "#12141c", border: "1px solid #1e293b", borderRadius: 12 }} cursor={{ fill: "rgba(99,102,241,0.06)" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="income" name="Gelir" fill="#10b981" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="expense" name="Gider" fill="#ef4444" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="net" name="Net" fill="#6366f1" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          <div className="grid lg:grid-cols-2 gap-6">
            <CatBreakdown title="Gider Dağılımı (8 Kategori)" rows={d.expense_by_category} cur={cur} testid="report-expense-categories" />
            <CatBreakdown title="Gelir Dağılımı" rows={d.income_by_category} cur={cur} testid="report-income-categories" />
          </div>
          <div className="fp-card overflow-x-auto" data-testid="report-cari-table">
            <h3 className="font-semibold p-5 pb-2">Cari Bazında Hareketler</h3>
            {d.by_cari.length === 0 ? <Empty text="Cari bağlantılı işlem yok" /> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800"><th className="px-5 py-3 font-medium">Cari</th><th className="px-5 py-3 font-medium text-right">Gelir</th><th className="px-5 py-3 font-medium text-right">Gider</th></tr></thead>
                <tbody>{d.by_cari.map((r) => (
                  <tr key={r.cari_id} className="border-b border-slate-800/60"><td className="px-5 py-3">{r.name}</td><td className="px-5 py-3 num text-right text-emerald-400">{fmtMoney(r.income, cur)}</td><td className="px-5 py-3 num text-right text-red-400">{fmtMoney(r.expense, cur)}</td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
