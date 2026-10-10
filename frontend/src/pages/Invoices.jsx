import { useEffect, useRef, useState } from "react";
import { FileDown, FileUp, ScanLine, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { fmtDate, fmtMoney } from "@/lib/format";
import { Empty, PageHead } from "@/components/common";
import InvoiceReview from "@/components/InvoiceReview";

function Dropzone({ direction, onUploaded }) {
  const ref = useRef();
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const isIn = direction === "incoming";

  const upload = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("direction", direction);
    setBusy(true);
    try {
      const { data } = await api.post("/invoices/upload", fd);
      toast.success(data.ai_error ? "Yüklendi, bilgileri elle kontrol edin" : "Fatura yapay zeka ile okundu");
      onUploaded(data);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); if (ref.current) ref.current.value = ""; }
  };

  return (
    <div onClick={() => !busy && ref.current.click()} data-testid={`invoice-upload-dropzone-${direction}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files[0]); }}
      className={`relative overflow-hidden fp-card p-8 cursor-pointer border-dashed border-2 transition-colors min-h-[210px] flex flex-col justify-center ${drag ? "border-indigo-400 bg-indigo-500/5" : "hover:border-slate-600"}`}>
      <input ref={ref} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" hidden onChange={(e) => upload(e.target.files[0])} data-testid={`invoice-file-input-${direction}`} />
      {busy && <div className="fp-scanline" />}
      <div className={`w-12 h-12 rounded-xl grid place-items-center mb-4 ${isIn ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}>
        {busy ? <ScanLine className="animate-pulse" /> : isIn ? <FileDown /> : <FileUp />}
      </div>
      <div className="font-semibold">{isIn ? "Gelen Fatura Yükle" : "Kesilen Fatura Yükle"}</div>
      <div className="text-sm text-slate-400 mt-1">
        {busy ? "Yapay zeka faturayı okuyor… firma, tutar, KDV ve kategori çıkarılıyor" : `Sürükleyip bırakın veya tıklayın · PDF / JPG / PNG · ${isIn ? "Gider" : "Gelir"} olarak kategorize edilir`}
      </div>
    </div>
  );
}

export default function Invoices() {
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState("all");
  const [review, setReview] = useState(null);
  const load = () => api.get("/invoices").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);
  const list = rows.filter((i) => tab === "all" || (tab === "draft" ? i.status === "draft" : i.direction === tab));

  const del = async (i) => {
    if (!window.confirm("Fatura kaydı silinsin mi? (Oluşturulan gelir/gider kaydı silinmez)")) return;
    try { await api.delete(`/invoices/${i.id}`); load(); } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div>
      <PageHead title="Faturalar" sub="Faturanızı yükleyin; yapay zeka (Gemini) bilgileri çıkarsın, siz onaylayın." />
      <div className="grid md:grid-cols-2 gap-5 mb-8">
        <Dropzone direction="incoming" onUploaded={(d) => { load(); setReview(d); }} />
        <Dropzone direction="outgoing" onUploaded={(d) => { load(); setReview(d); }} />
      </div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {[["all", "Tümü"], ["draft", "Onay Bekleyen"], ["incoming", "Gelen"], ["outgoing", "Kesilen"]].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} data-testid={`invoice-tab-${v}`} className={`px-4 py-1.5 rounded-full text-sm border transition-colors ${tab === v ? "bg-indigo-500/15 border-indigo-500/40 text-indigo-200" : "border-slate-800 text-slate-400 hover:text-white"}`}>{l}</button>
        ))}
      </div>
      <div className="fp-card overflow-x-auto">
        <table className="w-full text-sm" data-testid="invoices-table">
          <thead><tr className="text-left text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
            {["Dosya", "Tür", "Firma", "Fatura No", "Tarih", "Tutar", "Durum", ""].map((h, i) => <th key={i} className="px-4 py-3 font-medium">{h}</th>)}
          </tr></thead>
          <tbody>
            {list.map((i) => {
              const x = i.data || i.extracted || {};
              return (
                <tr key={i.id} onClick={() => setReview(i)} className="border-b border-slate-800/60 hover:bg-white/[0.02] cursor-pointer" data-testid={`invoice-row-${i.id}`}>
                  <td className="px-4 py-3 max-w-[200px] truncate">{i.filename}</td>
                  <td className="px-4 py-3 text-xs">{i.direction === "incoming" ? <span className="text-red-300">Gelen</span> : <span className="text-emerald-300">Kesilen</span>}</td>
                  <td className="px-4 py-3">{x.vendor || "—"}</td>
                  <td className="px-4 py-3 num text-xs text-slate-400">{x.invoice_no || "—"}</td>
                  <td className="px-4 py-3 num text-xs text-slate-400">{fmtDate(x.date)}</td>
                  <td className="px-4 py-3 num">{x.total ? fmtMoney(x.total, x.currency || "TRY") : "—"}</td>
                  <td className="px-4 py-3">{i.status === "confirmed"
                    ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300">Onaylandı</span>
                    : <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300">Onay Bekliyor</span>}</td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => del(i)} className="p-1.5 text-slate-500 hover:text-red-400" data-testid={`delete-invoice-${i.id}`}><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && <Empty text="Henüz fatura yüklenmedi" testid="invoices-empty" />}
      </div>
      <InvoiceReview invoice={review} onClose={() => setReview(null)} onDone={load} />
    </div>
  );
}
