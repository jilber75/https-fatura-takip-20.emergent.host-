import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { convert, daysUntil, fmtDate, fmtMoney, today } from "@/lib/format";
import { Amount, Empty, PageHead, TypeBadge, nameOf } from "@/components/common";
import { Field, Pick } from "@/components/TxDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

function PayDialog({ tx, onClose, onDone }) {
  const { lookups } = useApp();
  const [bank, setBank] = useState("none");
  const [d, setD] = useState(today());
  useEffect(() => { if (tx) { setBank(tx.bank_account_id || "none"); setD(today()); } }, [tx]);
  if (!tx) return null;
  const save = async () => {
    try {
      await api.post(`/transactions/${tx.id}/pay`, { bank_account_id: bank === "none" ? null : bank, paid_date: d });
      toast.success(tx.type === "income" ? "Tahsil edildi" : "Ödendi"); onDone(); onClose();
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#12141c]" data-testid="pay-dialog">
        <DialogHeader><DialogTitle>{tx.type === "income" ? "Tahsil Edildi İşaretle" : "Ödendi İşaretle"}</DialogTitle></DialogHeader>
        <div className="text-sm text-slate-400">{tx.description} · <Amount tx={tx} /></div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Banka Hesabı"><Pick value={bank} onChange={setBank} allowNone testid="pay-bank-select" options={lookups.banks.map((b) => ({ value: b.id, label: `${b.name} (${b.currency})` }))} /></Field>
          <Field label="Tarih"><Input type="date" value={d} onChange={(e) => setD(e.target.value)} data-testid="pay-date-input" /></Field>
        </div>
        <button onClick={save} className="h-11 rounded-full bg-emerald-500 hover:bg-emerald-400 font-semibold" data-testid="pay-confirm-button">Onayla</button>
      </DialogContent>
    </Dialog>
  );
}

const GROUPS = [
  { key: "overdue", label: "Gecikmiş", tone: "text-red-400", test: (d) => d < 0 },
  { key: "soon", label: "7 gün içinde", tone: "text-amber-400", test: (d) => d >= 0 && d <= 7 },
  { key: "later", label: "Daha sonra", tone: "text-sky-400", test: (d) => d > 7 },
];

export default function DueTracker() {
  const { lookups, currency, rates } = useApp();
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState("all");
  const [pay, setPay] = useState(null);
  const load = () => api.get("/due").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);
  const list = rows.filter((t) => tab === "all" || t.type === tab);
  const sum = (type) => rows.filter((t) => t.type === type).reduce((s, t) => s + convert(t.amount, t.currency, currency, rates), 0);

  return (
    <div>
      <PageHead title="Yaklaşan Ödeme & Tahsilatlar" sub="Vadesi gelen alacak ve borçlarınızı kaçırmayın." />
      <div className="grid grid-cols-2 gap-4 mb-6 max-w-xl">
        <div className="fp-card p-5"><div className="text-xs text-slate-500 uppercase tracking-wider">Bekleyen Tahsilat</div><div className="num text-xl text-emerald-400 font-semibold mt-2" data-testid="due-total-receivable">{fmtMoney(sum("income"), currency)}</div></div>
        <div className="fp-card p-5"><div className="text-xs text-slate-500 uppercase tracking-wider">Bekleyen Ödeme</div><div className="num text-xl text-red-400 font-semibold mt-2" data-testid="due-total-payable">{fmtMoney(sum("expense"), currency)}</div></div>
      </div>
      <div className="flex gap-2 mb-6">
        {[["all", "Tümü"], ["income", "Tahsilatlar"], ["expense", "Ödemeler"]].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} data-testid={`due-tab-${v}`} className={`px-4 py-1.5 rounded-full text-sm border transition-colors ${tab === v ? "bg-indigo-500/15 border-indigo-500/40 text-indigo-200" : "border-slate-800 text-slate-400 hover:text-white"}`}>{l}</button>
        ))}
      </div>
      {list.length === 0 && <div className="fp-card"><Empty text="Bekleyen ödeme veya tahsilat yok" testid="due-empty" /></div>}
      <div className="space-y-8">
        {GROUPS.map((g) => {
          const items = list.filter((t) => g.test(daysUntil(t.due_date || t.date)));
          if (!items.length) return null;
          return (
            <section key={g.key} data-testid={`due-group-${g.key}`}>
              <h3 className={`text-sm font-semibold mb-3 ${g.tone}`}>{g.label} <span className="text-slate-500">({items.length})</span></h3>
              <div className="fp-card divide-y divide-slate-800/60">
                {items.map((t) => {
                  const d = daysUntil(t.due_date || t.date);
                  return (
                    <div key={t.id} className="flex flex-wrap items-center gap-4 p-4" data-testid={`due-item-${t.id}`}>
                      <div className={`num text-xs w-24 ${g.tone}`}>{fmtDate(t.due_date)}<div className="text-[11px] opacity-80">{d < 0 ? `${-d} gün geçti` : d === 0 ? "Bugün" : `${d} gün`}</div></div>
                      <div className="flex-1 min-w-[160px]"><div className="text-sm">{t.description || "—"}</div><div className="text-xs text-slate-500 flex gap-2 items-center mt-0.5"><TypeBadge type={t.type} /> {nameOf(lookups.caris, t.cari_id)}</div></div>
                      <Amount tx={t} />
                      <button onClick={() => setPay(t)} data-testid={`mark-paid-${t.id}`} className="h-9 px-3 rounded-full border border-slate-700 hover:border-emerald-400 hover:text-emerald-300 text-xs flex items-center gap-1.5 transition-colors">
                        <CheckCircle2 size={14} /> {t.type === "income" ? "Tahsil Edildi" : "Ödendi"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <PayDialog tx={pay} onClose={() => setPay(null)} onDone={load} />
    </div>
  );
}
