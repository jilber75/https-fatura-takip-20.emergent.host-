import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { CURRENCIES, today } from "@/lib/format";
import { Field, Pick } from "@/components/TxDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

function useFileUrl(inv) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!inv) return undefined;
    let u;
    api.get(`/invoices/${inv.id}/file`, { responseType: "blob" }).then((r) => { u = URL.createObjectURL(r.data); setUrl(u); }).catch(() => setUrl(null));
    return () => { if (u) URL.revokeObjectURL(u); setUrl(null); };
  }, [inv]);
  return url;
}

const fromInvoice = (inv) => {
  const x = inv.data || inv.extracted || {};
  return { vendor: x.vendor || "", tax_id: x.tax_id || "", invoice_no: x.invoice_no || "", date: x.date || today(), due_date: x.due_date || "",
    subtotal: x.subtotal ?? "", vat: x.vat ?? "", total: x.total ?? "", currency: x.currency || "TRY", category_id: x.category_id || "none",
    cari_id: "none", status: "pending", bank_account_id: "none", description: x.description || "" };
};

export default function InvoiceReview({ invoice, onClose, onDone }) {
  const { lookups, refreshLookups } = useApp();
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const url = useFileUrl(invoice);
  useEffect(() => { if (invoice) setF(fromInvoice(invoice)); }, [invoice]);
  if (!invoice || !f) return null;

  const isIn = invoice.direction === "incoming";
  const confirmed = invoice.status === "confirmed";
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v?.target ? v.target.value : v }));
  const matchCari = lookups.caris.find((c) => c.name.toLowerCase() === f.vendor.trim().toLowerCase());

  const confirm = async () => {
    const n = (v) => (v === "none" || v === "" ? null : v);
    const body = { ...f, subtotal: parseFloat(f.subtotal) || 0, vat: parseFloat(f.vat) || 0, total: parseFloat(f.total),
      due_date: n(f.due_date), category_id: n(f.category_id), cari_id: n(f.cari_id), bank_account_id: n(f.bank_account_id) };
    if (!body.total || !body.vendor) return toast.error("Firma ve toplam tutar zorunludur");
    setBusy(true);
    try {
      await api.post(`/invoices/${invoice.id}/confirm`, body);
      toast.success(`Fatura ${isIn ? "gider" : "gelir"} olarak kaydedildi`);
      refreshLookups(); onDone(); onClose();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!invoice} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl bg-[#12141c] max-h-[92vh] overflow-y-auto" data-testid="invoice-review-dialog">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles size={18} className="text-indigo-300" />{confirmed ? "Fatura Detayı" : "AI Analizini Onayla"}</DialogTitle></DialogHeader>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="rounded-xl border border-slate-800 bg-[#090a0f] min-h-[360px] overflow-hidden" data-testid="invoice-preview">
            {!url ? <div className="h-full grid place-items-center text-slate-500 text-sm p-10">Önizleme yükleniyor…</div>
              : invoice.content_type === "application/pdf" ? <iframe title="fatura" src={url} className="w-full h-[520px]" />
                : <img src={url} alt="fatura" className="w-full object-contain max-h-[520px]" />}
          </div>
          <div className="space-y-4">
            {invoice.ai_error && <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3" data-testid="invoice-ai-error">{invoice.ai_error}</div>}
            <div className={`text-xs px-3 py-2 rounded-lg ${isIn ? "bg-red-500/10 text-red-300" : "bg-emerald-500/10 text-emerald-300"}`}>
              {isIn ? "Gelen fatura → GİDER olarak kaydedilecek" : "Kesilen fatura → GELİR olarak kaydedilecek"}
            </div>
            <fieldset disabled={confirmed} className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Field label={isIn ? "Tedarikçi" : "Müşteri"}><Input value={f.vendor} onChange={set("vendor")} data-testid="inv-vendor-input" /></Field></div>
              <Field label="VKN / TCKN"><Input value={f.tax_id} onChange={set("tax_id")} className="num" data-testid="inv-taxid-input" /></Field>
              <Field label="Fatura No"><Input value={f.invoice_no} onChange={set("invoice_no")} className="num" data-testid="inv-no-input" /></Field>
              <Field label="Fatura Tarihi"><Input type="date" value={f.date} onChange={set("date")} data-testid="inv-date-input" /></Field>
              <Field label="Vade Tarihi"><Input type="date" value={f.due_date} onChange={set("due_date")} data-testid="inv-due-input" /></Field>
              <Field label="Matrah"><Input type="number" value={f.subtotal} onChange={set("subtotal")} className="num" data-testid="inv-subtotal-input" /></Field>
              <Field label="KDV"><Input type="number" value={f.vat} onChange={set("vat")} className="num" data-testid="inv-vat-input" /></Field>
              <Field label="Genel Toplam"><Input type="number" value={f.total} onChange={set("total")} className="num font-semibold" data-testid="inv-total-input" /></Field>
              <Field label="Para Birimi"><Pick value={f.currency} onChange={set("currency")} testid="inv-currency-select" options={CURRENCIES.map((c) => ({ value: c, label: c }))} /></Field>
              <div className="col-span-2"><Field label="Kategori"><Pick value={f.category_id} onChange={set("category_id")} allowNone testid="inv-category-select"
                options={lookups.categories.filter((c) => c.type === (isIn ? "expense" : "income")).map((c) => ({ value: c.id, label: c.name }))} /></Field></div>
              <div className="col-span-2"><Field label="Açıklama"><Input value={f.description} onChange={set("description")} data-testid="inv-description-input" /></Field></div>
              {!confirmed && <>
                <div className="col-span-2"><Field label="Cari Hesap">
                  <Pick value={f.cari_id} onChange={set("cari_id")} allowNone testid="inv-cari-select" options={lookups.caris.map((c) => ({ value: c.id, label: c.name }))} />
                  <p className="text-[11px] text-slate-500 mt-1">{f.cari_id !== "none" ? "Seçilen cariye bağlanacak." : matchCari ? `Mevcut cari "${matchCari.name}" ile eşleşecek.` : "Seçilmezse firma adıyla yeni cari oluşturulur."}</p>
                </Field></div>
                <Field label="Durum"><Pick value={f.status} onChange={set("status")} testid="inv-status-select" options={[{ value: "pending", label: "Vadeli / Bekliyor" }, { value: "paid", label: isIn ? "Ödendi" : "Tahsil Edildi" }]} /></Field>
                <Field label="Banka Hesabı"><Pick value={f.bank_account_id} onChange={set("bank_account_id")} allowNone testid="inv-bank-select" options={lookups.banks.map((b) => ({ value: b.id, label: b.name }))} /></Field>
              </>}
            </fieldset>
            {!confirmed && <button onClick={confirm} disabled={busy} data-testid="confirm-invoice-button"
              className={`w-full h-11 rounded-full font-semibold transition-colors disabled:opacity-60 ${isIn ? "bg-red-500 hover:bg-red-400" : "bg-emerald-500 hover:bg-emerald-400"}`}>
              {busy ? "Kaydediliyor…" : `Onayla ve ${isIn ? "Gider" : "Gelir"} Olarak Kaydet`}
            </button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
