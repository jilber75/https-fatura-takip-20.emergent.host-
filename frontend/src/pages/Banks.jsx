import { useEffect, useState } from "react";
import { ArrowRightLeft, Copy, Landmark, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { CURRENCIES, fmtMoney, today } from "@/lib/format";
import { Empty, PageHead } from "@/components/common";
import { Field, Pick } from "@/components/TxDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const blank = { name: "", bank_name: "", iban: "", currency: "TRY", opening_balance: "" };

function BankDialog({ open, onOpenChange, initial, onSaved }) {
  const [f, setF] = useState(blank);
  useEffect(() => { if (open) setF(initial ? { ...initial } : blank); }, [open, initial]);
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v?.target ? v.target.value : v }));
  const save = async () => {
    if (!f.name || !f.bank_name) return toast.error("Hesap adı ve banka zorunludur");
    const body = { name: f.name, bank_name: f.bank_name, iban: f.iban, currency: f.currency, opening_balance: parseFloat(f.opening_balance) || 0 };
    try {
      if (initial?.id) await api.put(`/banks/${initial.id}`, body); else await api.post("/banks", body);
      toast.success("Hesap kaydedildi"); onSaved(); onOpenChange(false);
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#12141c]" data-testid="bank-dialog">
        <DialogHeader><DialogTitle>{initial?.id ? "Hesabı Düzenle" : "Yeni Banka Hesabı"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Hesap Adı"><Input value={f.name} onChange={set("name")} placeholder="Ana TL Hesabı" data-testid="bank-name-input" /></Field>
          <Field label="Banka"><Input value={f.bank_name} onChange={set("bank_name")} data-testid="bank-bankname-input" /></Field>
          <div className="col-span-2"><Field label="IBAN"><Input value={f.iban} onChange={set("iban")} className="num" placeholder="TR00 0000 …" data-testid="bank-iban-input" /></Field></div>
          <Field label="Para Birimi"><Pick value={f.currency} onChange={set("currency")} testid="bank-currency-select" options={CURRENCIES.map((c) => ({ value: c, label: c }))} /></Field>
          <Field label="Açılış Bakiyesi"><Input type="number" step="0.01" value={f.opening_balance} onChange={set("opening_balance")} className="num" data-testid="bank-opening-input" /></Field>
        </div>
        <button onClick={save} className="h-11 rounded-full bg-indigo-500 hover:bg-indigo-400 font-semibold" data-testid="bank-save-button">Kaydet</button>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({ open, onOpenChange, banks, onSaved }) {
  const [f, setF] = useState({ from_id: "", to_id: "", amount: "", date: today(), description: "Hesaplar arası virman" });
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v?.target ? v.target.value : v }));
  const opts = banks.map((b) => ({ value: b.id, label: `${b.name} (${b.currency})` }));
  const save = async () => {
    try { await api.post("/banks/transfer", { ...f, amount: parseFloat(f.amount) }); toast.success("Virman yapıldı"); onSaved(); onOpenChange(false); }
    catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#12141c]" data-testid="transfer-dialog">
        <DialogHeader><DialogTitle>Hesaplar Arası Virman</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Kaynak Hesap"><Pick value={f.from_id} onChange={set("from_id")} options={opts} placeholder="Seçin" testid="transfer-from-select" /></Field>
          <Field label="Hedef Hesap"><Pick value={f.to_id} onChange={set("to_id")} options={opts} placeholder="Seçin" testid="transfer-to-select" /></Field>
          <Field label="Tutar (kaynak döviz)"><Input type="number" value={f.amount} onChange={set("amount")} className="num" data-testid="transfer-amount-input" /></Field>
          <Field label="Tarih"><Input type="date" value={f.date} onChange={set("date")} data-testid="transfer-date-input" /></Field>
        </div>
        <p className="text-xs text-slate-500">Farklı döviz cinsinden hesaplar arasında güncel kur kullanılır.</p>
        <button onClick={save} className="h-11 rounded-full bg-indigo-500 hover:bg-indigo-400 font-semibold" data-testid="transfer-save-button">Virman Yap</button>
      </DialogContent>
    </Dialog>
  );
}

export default function Banks() {
  const { refreshLookups, currency, rates } = useApp();
  const [banks, setBanks] = useState([]);
  const [dlg, setDlg] = useState({ open: false, initial: null });
  const [tr, setTr] = useState(false);
  const load = () => { api.get("/banks").then((r) => setBanks(r.data)); refreshLookups(); };
  useEffect(() => { api.get("/banks").then((r) => setBanks(r.data)); }, []);
  const total = banks.reduce((s, b) => s + (b.balance * rates[b.currency]) / rates[currency], 0);

  const del = async (b) => {
    if (!window.confirm(`${b.name} silinsin mi?`)) return;
    try { await api.delete(`/banks/${b.id}`); toast.success("Silindi"); load(); } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div>
      <PageHead title="Banka Hesapları" sub={<>Toplam bakiye: <span className="num text-slate-100 font-semibold" data-testid="banks-total">{fmtMoney(total, currency)}</span></>}>
        <button onClick={() => setTr(true)} disabled={banks.length < 2} data-testid="open-transfer-button" className="h-10 px-4 rounded-full border border-slate-700 hover:border-indigo-400 text-sm flex items-center gap-2 disabled:opacity-40"><ArrowRightLeft size={15} /> Virman</button>
        <button onClick={() => setDlg({ open: true, initial: null })} data-testid="add-bank-button" className="h-10 px-4 rounded-full bg-indigo-500 hover:bg-indigo-400 text-sm font-semibold flex items-center gap-2"><Plus size={15} /> Hesap Ekle</button>
      </PageHead>
      {banks.length === 0 && <div className="fp-card"><Empty text="Henüz banka hesabı eklenmedi" testid="banks-empty" /></div>}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {banks.map((b, i) => (
          <div key={b.id} className="relative overflow-hidden rounded-2xl p-6 border border-slate-800 bg-gradient-to-br from-[#1a1e2e] to-[#0f1118] fp-rise" style={{ animationDelay: `${i * 60}ms` }} data-testid={`bank-card-${b.id}`}>
            <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-indigo-500/10 blur-2xl" />
            <div className="flex items-start justify-between relative">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-white/5 grid place-items-center"><Landmark size={18} className="text-indigo-300" /></span>
                <div><div className="font-semibold">{b.name}</div><div className="text-xs text-slate-500">{b.bank_name}</div></div>
              </div>
              <span className="text-xs num px-2 py-1 rounded-md bg-white/5 text-slate-300">{b.currency}</span>
            </div>
            <div className={`num text-3xl font-semibold mt-8 relative ${b.balance < 0 ? "text-red-400" : ""}`} data-testid={`bank-balance-${b.id}`}>{fmtMoney(b.balance, b.currency)}</div>
            <div className="flex items-center justify-between mt-4 relative">
              <button onClick={() => { navigator.clipboard?.writeText(b.iban); toast.success("IBAN kopyalandı"); }} className="num text-xs text-slate-400 hover:text-white flex items-center gap-1.5 truncate" data-testid={`copy-iban-${b.id}`}>
                {b.iban || "IBAN yok"} {b.iban && <Copy size={12} />}
              </button>
              <div className="flex shrink-0">
                <button onClick={() => setDlg({ open: true, initial: b })} className="p-1.5 text-slate-500 hover:text-indigo-300" data-testid={`edit-bank-${b.id}`}><Pencil size={14} /></button>
                <button onClick={() => del(b)} className="p-1.5 text-slate-500 hover:text-red-400" data-testid={`delete-bank-${b.id}`}><Trash2 size={14} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <BankDialog open={dlg.open} onOpenChange={(o) => setDlg((p) => ({ ...p, open: o }))} initial={dlg.initial} onSaved={load} />
      <TransferDialog open={tr} onOpenChange={setTr} banks={banks} onSaved={load} />
    </div>
  );
}
