import { useCallback, useEffect, useState } from "react";
import { Download, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { CURRENCIES, downloadCSV, fmtDate, fmtMoney } from "@/lib/format";
import { Amount, CategoryTag, Empty, PageHead, StatusBadge, TypeBadge, nameOf } from "@/components/common";
import TxDialog, { Pick } from "@/components/TxDialog";
import { Input } from "@/components/ui/input";

export default function Transactions() {
  const { lookups, refreshLookups } = useApp();
  const [rows, setRows] = useState([]);
  const [flt, setFlt] = useState({ type: "all", status: "all", currency: "all", start: "", end: "", q: "" });
  const [dlg, setDlg] = useState({ open: false, initial: null, type: "income" });

  const load = useCallback(() => {
    const params = Object.fromEntries(Object.entries(flt).filter(([, v]) => v && v !== "all"));
    api.get("/transactions", { params }).then((r) => setRows(r.data));
  }, [flt]);
  useEffect(() => { load(); }, [load]);

  const del = async (t) => {
    if (!window.confirm("Bu işlemi silmek istediğinize emin misiniz?")) return;
    try { await api.delete(`/transactions/${t.id}`); toast.success("Silindi"); load(); refreshLookups(); } catch (e) { toast.error(errMsg(e)); }
  };

  const exportCsv = () => downloadCSV("gelir-gider.csv", [["Tarih", "Tür", "Açıklama", "Kategori", "Cari", "Banka", "Tutar", "Para Birimi", "KDV", "Durum", "Vade"],
    ...rows.map((t) => [t.date, t.type === "income" ? "Gelir" : "Gider", t.description, nameOf(lookups.categories, t.category_id), nameOf(lookups.caris, t.cari_id),
      nameOf(lookups.banks, t.bank_account_id), t.amount, t.currency, t.vat_amount, t.status === "paid" ? "Gerçekleşti" : "Bekliyor", t.due_date || ""])]);

  const set = (k) => (v) => setFlt((p) => ({ ...p, [k]: v?.target ? v.target.value : v }));
  const sumBy = (type) => rows.filter((t) => t.type === type).reduce((a, t) => ({ ...a, [t.currency]: (a[t.currency] || 0) + t.amount }), {});
  const fmtSums = (o) => Object.entries(o).map(([c, v]) => fmtMoney(v, c)).join(" · ") || "—";

  return (
    <div>
      <PageHead title="Gelir & Gider" sub="Tüm finansal hareketleriniz, filtrelenebilir tek listede.">
        <button onClick={exportCsv} data-testid="export-transactions-csv" className="h-10 px-4 rounded-full border border-slate-700 hover:border-slate-500 text-sm flex items-center gap-2"><Download size={15} /> CSV</button>
        <button onClick={() => setDlg({ open: true, initial: null, type: "expense" })} data-testid="add-expense-button" className="h-10 px-4 rounded-full bg-red-500/90 hover:bg-red-500 text-sm font-semibold flex items-center gap-2"><Plus size={15} /> Gider</button>
        <button onClick={() => setDlg({ open: true, initial: null, type: "income" })} data-testid="add-income-button" className="h-10 px-4 rounded-full bg-emerald-500/90 hover:bg-emerald-500 text-sm font-semibold flex items-center gap-2"><Plus size={15} /> Gelir</button>
      </PageHead>

      <div className="fp-card p-4 mb-4 grid grid-cols-2 md:grid-cols-6 gap-3" data-testid="transaction-filters">
        <Input placeholder="Açıklamada ara…" value={flt.q} onChange={set("q")} className="col-span-2" data-testid="filter-search-input" />
        <Pick value={flt.type} onChange={set("type")} testid="filter-type-select" options={[{ value: "all", label: "Tüm Türler" }, { value: "income", label: "Gelir" }, { value: "expense", label: "Gider" }]} />
        <Pick value={flt.status} onChange={set("status")} testid="filter-status-select" options={[{ value: "all", label: "Tüm Durumlar" }, { value: "paid", label: "Gerçekleşti" }, { value: "pending", label: "Bekliyor" }]} />
        <Pick value={flt.currency} onChange={set("currency")} testid="filter-currency-select" options={[{ value: "all", label: "Tüm Dövizler" }, ...CURRENCIES.map((c) => ({ value: c, label: c }))]} />
        <div className="flex gap-2 col-span-2 md:col-span-1">
          <Input type="date" value={flt.start} onChange={set("start")} data-testid="filter-start-date" />
          <Input type="date" value={flt.end} onChange={set("end")} data-testid="filter-end-date" />
        </div>
      </div>

      <div className="flex flex-wrap gap-6 text-sm mb-4 px-1" data-testid="transaction-totals">
        <span className="text-slate-400">Gelir: <b className="num text-emerald-400">{fmtSums(sumBy("income"))}</b></span>
        <span className="text-slate-400">Gider: <b className="num text-red-400">{fmtSums(sumBy("expense"))}</b></span>
        <span className="text-slate-500">{rows.length} kayıt</span>
      </div>

      <div className="fp-card overflow-x-auto">
        <table className="w-full text-sm" data-testid="transactions-table">
          <thead><tr className="text-left text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
            {["Tarih", "Tür", "Açıklama", "Kategori", "Cari / Banka", "Durum", "Tutar", ""].map((h, i) => <th key={i} className={`px-4 py-3 font-medium ${h === "Tutar" ? "text-right" : ""}`}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-b border-slate-800/60 hover:bg-white/[0.02] transition-colors" data-testid={`tx-row-${t.id}`}>
                <td className="px-4 py-3 num text-xs text-slate-400 whitespace-nowrap">{fmtDate(t.date)}</td>
                <td className="px-4 py-3"><TypeBadge type={t.type} /></td>
                <td className="px-4 py-3 max-w-[240px] truncate">{t.description || "—"}{t.transfer_id && <span className="text-[10px] ml-2 text-indigo-300">VİRMAN</span>}</td>
                <td className="px-4 py-3"><CategoryTag id={t.category_id} /></td>
                <td className="px-4 py-3 text-xs text-slate-400"><div>{nameOf(lookups.caris, t.cari_id)}</div><div className="text-slate-600">{nameOf(lookups.banks, t.bank_account_id)}</div></td>
                <td className="px-4 py-3"><StatusBadge status={t.status} type={t.type} />{t.status === "pending" && <div className="text-[11px] text-slate-500 mt-1">Vade {fmtDate(t.due_date)}</div>}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap"><Amount tx={t} /></td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {!t.transfer_id && <button onClick={() => setDlg({ open: true, initial: t, type: t.type })} className="p-1.5 text-slate-500 hover:text-indigo-300" data-testid={`edit-tx-${t.id}`}><Pencil size={14} /></button>}
                  <button onClick={() => del(t)} className="p-1.5 text-slate-500 hover:text-red-400" data-testid={`delete-tx-${t.id}`}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty text="Filtrelere uyan işlem bulunamadı" testid="transactions-empty" />}
      </div>
      <TxDialog open={dlg.open} onOpenChange={(o) => setDlg((p) => ({ ...p, open: o }))} initial={dlg.initial} defaultType={dlg.type} onSaved={load} />
    </div>
  );
}
