import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { fmtDate, fmtMoney } from "@/lib/format";
import { Amount, Empty, PageHead, StatusBadge } from "@/components/common";
import { Field, Pick } from "@/components/TxDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";

const blank = { name: "", type: "customer", tax_id: "", phone: "", email: "", address: "" };

function CariDialog({ open, onOpenChange, initial, onSaved }) {
  const [f, setF] = useState(blank);
  useEffect(() => { if (open) setF(initial ? { ...blank, ...initial } : blank); }, [open, initial]);
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v?.target ? v.target.value : v }));
  const save = async () => {
    if (!f.name) return toast.error("Unvan zorunludur");
    const body = { name: f.name, type: f.type, tax_id: f.tax_id, phone: f.phone, email: f.email, address: f.address };
    try {
      if (initial?.id) await api.put(`/caris/${initial.id}`, body); else await api.post("/caris", body);
      toast.success("Cari kaydedildi"); onSaved(); onOpenChange(false);
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#12141c]" data-testid="cari-dialog">
        <DialogHeader><DialogTitle>{initial?.id ? "Cariyi Düzenle" : "Yeni Cari Hesap"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><Field label="Unvan"><Input value={f.name} onChange={set("name")} data-testid="cari-name-input" /></Field></div>
          <Field label="Tür"><Pick value={f.type} onChange={set("type")} testid="cari-type-select" options={[{ value: "customer", label: "Müşteri" }, { value: "supplier", label: "Tedarikçi" }]} /></Field>
          <Field label="VKN / TCKN"><Input value={f.tax_id} onChange={set("tax_id")} className="num" data-testid="cari-taxid-input" /></Field>
          <Field label="Telefon"><Input value={f.phone} onChange={set("phone")} data-testid="cari-phone-input" /></Field>
          <Field label="E-posta"><Input value={f.email} onChange={set("email")} data-testid="cari-email-input" /></Field>
          <div className="col-span-2"><Field label="Adres"><Input value={f.address} onChange={set("address")} data-testid="cari-address-input" /></Field></div>
        </div>
        <button onClick={save} className="h-11 rounded-full bg-indigo-500 hover:bg-indigo-400 font-semibold" data-testid="cari-save-button">Kaydet</button>
      </DialogContent>
    </Dialog>
  );
}

function CariDetail({ id, onClose }) {
  const [c, setC] = useState(null);
  useEffect(() => { setC(null); if (id) api.get(`/caris/${id}`).then((r) => setC(r.data)); }, [id]);
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg bg-[#0f1118] overflow-y-auto" data-testid="cari-detail-sheet">
        <SheetHeader><SheetTitle>{c?.name || "…"}</SheetTitle></SheetHeader>
        {c && (
          <div className="space-y-6 mt-6">
            <div className="text-sm text-slate-400 space-y-1">
              <div>{c.type === "customer" ? "Müşteri" : "Tedarikçi"} · VKN <span className="num">{c.tax_id || "—"}</span></div>
              <div>{c.phone} {c.email}</div><div>{c.address}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="fp-card p-4"><div className="text-xs text-slate-500">Alacak (bekleyen)</div><div className="num text-emerald-400 font-semibold mt-1">{fmtMoney(c.receivable)}</div></div>
              <div className="fp-card p-4"><div className="text-xs text-slate-500">Borç (bekleyen)</div><div className="num text-red-400 font-semibold mt-1">{fmtMoney(c.payable)}</div></div>
            </div>
            <div>
              <h4 className="font-semibold mb-2 text-sm">Hareketler</h4>
              {c.transactions.length === 0 && <Empty text="Hareket yok" />}
              {c.transactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2.5 border-b border-slate-800/60 text-sm">
                  <div><div>{t.description || "—"}</div><div className="text-xs text-slate-500">{fmtDate(t.date)} <StatusBadge status={t.status} type={t.type} /></div></div>
                  <Amount tx={t} />
                </div>
              ))}
            </div>
            <div>
              <h4 className="font-semibold mb-2 text-sm">Faturalar</h4>
              {c.invoices.length === 0 ? <Empty text="Fatura yok" /> : c.invoices.map((i) => (
                <div key={i.id} className="text-sm py-2 border-b border-slate-800/60 flex justify-between">
                  <span className="truncate">{i.filename}</span><span className="num text-xs text-slate-500">{i.data?.invoice_no}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function Caris() {
  const { refreshLookups, can } = useApp();
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState("all");
  const [dlg, setDlg] = useState({ open: false, initial: null });
  const [detail, setDetail] = useState(null);
  const load = () => { api.get("/caris").then((r) => setRows(r.data)); refreshLookups(); };
  useEffect(() => { api.get("/caris").then((r) => setRows(r.data)); }, []);
  const list = rows.filter((c) => tab === "all" || c.type === tab);
  const tot = (k) => rows.reduce((s, c) => s + c[k], 0);

  const del = async (c) => {
    if (!window.confirm(`${c.name} silinsin mi?`)) return;
    try { await api.delete(`/caris/${c.id}`); toast.success("Silindi"); load(); } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div>
      <PageHead title="Cari Hesaplar" sub="Müşteri ve tedarikçilerinizle alacak / borç durumunuz (TRY karşılığı).">
        <button onClick={() => setDlg({ open: true, initial: null })} data-testid="add-cari-button" className="h-10 px-4 rounded-full bg-indigo-500 hover:bg-indigo-400 text-sm font-semibold flex items-center gap-2"><Plus size={15} /> Cari Ekle</button>
      </PageHead>
      <div className="grid grid-cols-2 gap-4 mb-6 max-w-xl">
        <div className="fp-card p-5"><div className="text-xs text-slate-500 uppercase tracking-wider">Toplam Alacak</div><div className="num text-xl text-emerald-400 font-semibold mt-2" data-testid="cari-total-receivable">{fmtMoney(tot("receivable"))}</div></div>
        <div className="fp-card p-5"><div className="text-xs text-slate-500 uppercase tracking-wider">Toplam Borç</div><div className="num text-xl text-red-400 font-semibold mt-2" data-testid="cari-total-payable">{fmtMoney(tot("payable"))}</div></div>
      </div>
      <div className="flex gap-2 mb-4">
        {[["all", "Tümü"], ["customer", "Müşteriler"], ["supplier", "Tedarikçiler"]].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} data-testid={`cari-tab-${v}`} className={`px-4 py-1.5 rounded-full text-sm border transition-colors ${tab === v ? "bg-indigo-500/15 border-indigo-500/40 text-indigo-200" : "border-slate-800 text-slate-400 hover:text-white"}`}>{l}</button>
        ))}
      </div>
      <div className="fp-card overflow-x-auto">
        <table className="w-full text-sm" data-testid="caris-table">
          <thead><tr className="text-left text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
            <th className="px-4 py-3 font-medium">Unvan</th><th className="px-4 py-3 font-medium">Tür</th><th className="px-4 py-3 font-medium">VKN</th>
            <th className="px-4 py-3 font-medium text-right">Alacak</th><th className="px-4 py-3 font-medium text-right">Borç</th><th className="px-4 py-3" />
          </tr></thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id} className="border-b border-slate-800/60 hover:bg-white/[0.02] cursor-pointer" onClick={() => setDetail(c.id)} data-testid={`cari-row-${c.id}`}>
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-xs text-slate-400">{c.type === "customer" ? "Müşteri" : "Tedarikçi"}</td>
                <td className="px-4 py-3 num text-xs text-slate-400">{c.tax_id || "—"}</td>
                <td className="px-4 py-3 num text-right text-emerald-400">{fmtMoney(c.receivable)}</td>
                <td className="px-4 py-3 num text-right text-red-400">{fmtMoney(c.payable)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  {can("cari_accounts") && <>
                    <button onClick={() => setDlg({ open: true, initial: c })} className="p-1.5 text-slate-500 hover:text-indigo-300" data-testid={`edit-cari-${c.id}`}><Pencil size={14} /></button>
                    <button onClick={() => del(c)} className="p-1.5 text-slate-500 hover:text-red-400" data-testid={`delete-cari-${c.id}`}><Trash2 size={14} /></button>
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <Empty text="Cari hesap bulunamadı" testid="caris-empty" />}
      </div>
      <CariDialog open={dlg.open} onOpenChange={(o) => setDlg((p) => ({ ...p, open: o }))} initial={dlg.initial} onSaved={load} />
      <CariDetail id={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
