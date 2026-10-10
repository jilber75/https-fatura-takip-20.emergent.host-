import { useApp } from "@/context/AppContext";
import { fmtMoney } from "@/lib/format";

export function PageHead({ title, sub, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between mb-8 fp-rise">
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{title}</h2>
        {sub && <p className="text-sm text-slate-400 mt-1">{sub}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function Kpi({ label, value, tone = "slate", icon: Icon, testid, hint, delay = 0 }) {
  const tones = { emerald: "text-emerald-400 bg-emerald-500/10", red: "text-red-400 bg-red-500/10",
    amber: "text-amber-400 bg-amber-500/10", indigo: "text-indigo-300 bg-indigo-500/10", slate: "text-slate-300 bg-slate-500/10" };
  return (
    <div className="fp-card p-5 fp-rise hover:border-slate-700 transition-colors" style={{ animationDelay: `${delay}ms` }} data-testid={testid}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</span>
        {Icon && <span className={`w-8 h-8 rounded-lg grid place-items-center ${tones[tone]}`}><Icon size={16} /></span>}
      </div>
      <div className="num text-2xl font-semibold text-slate-50 truncate" data-testid={`${testid}-value`}>{value}</div>
      {hint && <div className="text-xs text-slate-500 mt-2">{hint}</div>}
    </div>
  );
}

export function TypeBadge({ type }) {
  return type === "income"
    ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">Gelir</span>
    : <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-300 border border-red-500/20">Gider</span>;
}

export function StatusBadge({ status, type }) {
  if (status === "paid")
    return <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-300 border border-slate-600/40">{type === "income" ? "Tahsil Edildi" : "Ödendi"}</span>;
  return <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">Bekliyor</span>;
}

export function CategoryTag({ id }) {
  const { lookups } = useApp();
  const c = lookups.categories.find((x) => x.id === id);
  if (!c) return <span className="text-slate-600 text-xs">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-300">
      <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />{c.name}
    </span>
  );
}

export function Amount({ tx, className = "" }) {
  const sign = tx.type === "income" ? "+" : "−";
  return (
    <span className={`num font-semibold ${tx.type === "income" ? "text-emerald-400" : "text-red-400"} ${className}`}>
      {sign}{fmtMoney(tx.amount, tx.currency)}
    </span>
  );
}

export function Empty({ text, testid }) {
  return <div className="text-center text-sm text-slate-500 py-10" data-testid={testid}>{text}</div>;
}

export const nameOf = (list, id) => list.find((x) => x.id === id)?.name || "—";
