import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { CURRENCIES, today } from "@/lib/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const blank = (type) => ({ type, amount: "", currency: "TRY", date: today(), description: "", category_id: "none",
  bank_account_id: "none", cari_id: "none", status: "paid", due_date: "", vat_amount: "" });

export function Field({ label, children }) {
  return <div className="space-y-1.5"><Label className="text-xs text-slate-400">{label}</Label>{children}</div>;
}

export function Pick({ value, onChange, options, testid, placeholder, allowNone }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger data-testid={testid}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value="none">— Seçilmedi —</SelectItem>}
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export default function TxDialog({ open, onOpenChange, initial, defaultType = "income", onSaved }) {
  const { lookups, refreshLookups } = useApp();
  const [f, setF] = useState(blank(defaultType));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setF(initial ? { ...blank(initial.type), ...initial, category_id: initial.category_id || "none",
      bank_account_id: initial.bank_account_id || "none", cari_id: initial.cari_id || "none", due_date: initial.due_date || "" } : blank(defaultType));
  }, [open, initial, defaultType]);

  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v?.target ? v.target.value : v }));
  const cats = lookups.categories.filter((c) => c.type === f.type);

  const save = async () => {
    const n = (v) => (v === "none" || v === "" ? null : v);
    const body = { type: f.type, amount: parseFloat(f.amount), currency: f.currency, date: f.date, description: f.description,
      category_id: n(f.category_id), bank_account_id: n(f.bank_account_id), cari_id: n(f.cari_id), status: f.status,
      due_date: f.status === "pending" ? n(f.due_date) : null, vat_amount: parseFloat(f.vat_amount) || 0 };
    if (!body.amount || body.amount <= 0) return toast.error("Geçerli bir tutar girin");
    setBusy(true);
    try {
      if (initial?.id) await api.put(`/transactions/${initial.id}`, body);
      else await api.post("/transactions", body);
      toast.success("İşlem kaydedildi");
      refreshLookups();
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl bg-[#12141c]" data-testid="transaction-dialog">
        <DialogHeader><DialogTitle>{initial?.id ? "İşlemi Düzenle" : "Yeni İşlem"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-1 p-1 bg-[#090a0f] rounded-full border border-slate-800">
          {[["income", "Gelir"], ["expense", "Gider"]].map(([v, l]) => (
            <button key={v} onClick={() => setF((p) => ({ ...p, type: v, category_id: "none" }))} data-testid={`tx-type-${v}`}
              className={`py-2 rounded-full text-sm font-semibold transition-colors ${f.type === v ? (v === "income" ? "bg-emerald-500 text-white" : "bg-red-500 text-white") : "text-slate-400"}`}>{l}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Tutar"><Input type="number" step="0.01" value={f.amount} onChange={set("amount")} className="num" data-testid="tx-amount-input" /></Field>
          <Field label="Para Birimi"><Pick value={f.currency} onChange={set("currency")} testid="tx-currency-select" options={CURRENCIES.map((c) => ({ value: c, label: c }))} /></Field>
          <Field label="İşlem Tarihi"><Input type="date" value={f.date} onChange={set("date")} data-testid="tx-date-input" /></Field>
          <Field label="KDV Tutarı"><Input type="number" step="0.01" value={f.vat_amount} onChange={set("vat_amount")} className="num" data-testid="tx-vat-input" /></Field>
          <div className="col-span-2"><Field label="Açıklama"><Input value={f.description} onChange={set("description")} data-testid="tx-description-input" /></Field></div>
          <Field label="Kategori"><Pick value={f.category_id} onChange={set("category_id")} allowNone testid="tx-category-select" options={cats.map((c) => ({ value: c.id, label: c.name }))} /></Field>
          <Field label="Cari Hesap"><Pick value={f.cari_id} onChange={set("cari_id")} allowNone testid="tx-cari-select" options={lookups.caris.map((c) => ({ value: c.id, label: c.name }))} /></Field>
          <Field label="Banka Hesabı"><Pick value={f.bank_account_id} onChange={set("bank_account_id")} allowNone testid="tx-bank-select" options={lookups.banks.map((b) => ({ value: b.id, label: `${b.name} (${b.currency})` }))} /></Field>
          <Field label="Durum"><Pick value={f.status} onChange={set("status")} testid="tx-status-select" options={[{ value: "paid", label: f.type === "income" ? "Tahsil Edildi" : "Ödendi" }, { value: "pending", label: "Bekliyor (vadeli)" }]} /></Field>
          {f.status === "pending" && <Field label="Vade Tarihi"><Input type="date" value={f.due_date} onChange={set("due_date")} data-testid="tx-due-date-input" /></Field>}
        </div>
        <button onClick={save} disabled={busy} data-testid="tx-save-button"
          className="h-11 rounded-full bg-indigo-500 hover:bg-indigo-400 font-semibold transition-colors disabled:opacity-60">
          {busy ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </DialogContent>
    </Dialog>
  );
}
