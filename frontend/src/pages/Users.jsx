import { useEffect, useState } from "react";
import { KeyRound, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { MODULE_LABELS } from "@/lib/format";
import { PageHead } from "@/components/common";
import { Field } from "@/components/TxDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const MODS = Object.keys(MODULE_LABELS);

function UserDialog({ open, onOpenChange, initial, onSaved }) {
  const [f, setF] = useState({});
  useEffect(() => { if (open) setF(initial ? { name: initial.name, title: initial.title || "", password: "" } : { email: "", name: "", title: "", password: "" }); }, [open, initial]);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const save = async () => {
    try {
      if (initial) await api.put(`/users/${initial.id}`, { name: f.name, title: f.title, password: f.password || null });
      else await api.post("/users", { ...f, permissions: { dashboard: true } });
      toast.success("Kullanıcı kaydedildi"); onSaved(); onOpenChange(false);
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#12141c]" data-testid="user-dialog">
        <DialogHeader><DialogTitle>{initial ? "Kullanıcıyı Düzenle" : "Yeni Kullanıcı"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          {!initial && <div className="col-span-2"><Field label="E-posta"><Input type="email" value={f.email || ""} onChange={set("email")} data-testid="user-email-input" /></Field></div>}
          <Field label="Ad Soyad"><Input value={f.name || ""} onChange={set("name")} data-testid="user-name-input" /></Field>
          <Field label="Ünvan"><Input value={f.title || ""} onChange={set("title")} data-testid="user-title-input" /></Field>
          <div className="col-span-2"><Field label={initial ? "Yeni Şifre (boş bırakılırsa değişmez)" : "Şifre (min. 6)"}><Input type="password" value={f.password || ""} onChange={set("password")} data-testid="user-password-input" /></Field></div>
        </div>
        <button onClick={save} className="h-11 rounded-full bg-indigo-500 hover:bg-indigo-400 font-semibold" data-testid="user-save-button">Kaydet</button>
      </DialogContent>
    </Dialog>
  );
}

function RatesCard() {
  const { rates, reloadRates } = useApp();
  const [r, setR] = useState({ USD: "", EUR: "" });
  useEffect(() => setR({ USD: rates.USD, EUR: rates.EUR }), [rates]);
  const save = async () => {
    try { await api.put("/settings/rates", { USD: parseFloat(r.USD), EUR: parseFloat(r.EUR) }); toast.success("Kurlar güncellendi"); reloadRates(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="fp-card p-5 mt-8 max-w-xl" data-testid="rates-card">
      <h3 className="font-semibold">Döviz Kurları</h3>
      <p className="text-xs text-slate-500 mb-4">Raporlar ve çevrimler bu kurlarla hesaplanır. Güncel kurları buradan girin.</p>
      <div className="flex items-end gap-3">
        <Field label="1 USD = ₺"><Input type="number" step="0.0001" value={r.USD} onChange={(e) => setR({ ...r, USD: e.target.value })} className="num" data-testid="rate-usd-input" /></Field>
        <Field label="1 EUR = ₺"><Input type="number" step="0.0001" value={r.EUR} onChange={(e) => setR({ ...r, EUR: e.target.value })} className="num" data-testid="rate-eur-input" /></Field>
        <button onClick={save} className="h-10 px-4 rounded-full bg-indigo-500 hover:bg-indigo-400 text-sm font-semibold" data-testid="save-rates-button">Kaydet</button>
      </div>
    </div>
  );
}

function UserRow({ u, me, onEdit, onChanged }) {
  const [perms, setPerms] = useState(u.permissions);
  useEffect(() => setPerms(u.permissions), [u]);
  const admin = u.role === "admin";
  const dirty = JSON.stringify(perms) !== JSON.stringify(u.permissions);
  const put = async (body, msg) => { try { await api.put(`/users/${u.id}`, body); toast.success(msg); onChanged(); } catch (e) { toast.error(errMsg(e)); } };
  const del = async () => {
    if (!window.confirm(`${u.name} silinsin mi?`)) return;
    try { await api.delete(`/users/${u.id}`); onChanged(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <tr className="border-b border-slate-800/60" data-testid={`user-row-${u.email}`}>
      <td className="px-4 py-3 min-w-[200px]">
        <div className="font-medium">{u.name} {u.id === me && <span className="text-[10px] text-indigo-300 ml-1">(siz)</span>}</div>
        <div className="text-xs text-slate-500">{u.email}</div>
        <div className="text-[11px] text-slate-600">{admin ? "Yönetici · tam yetki" : u.title}</div>
      </td>
      {MODS.map((m) => (
        <td key={m} className="px-2 py-3 text-center">
          <Checkbox checked={!!perms[m]} disabled={admin} onCheckedChange={(v) => setPerms((p) => ({ ...p, [m]: !!v }))} data-testid={`permission-checkbox-${u.email}-${m}`} />
        </td>
      ))}
      <td className="px-3 py-3"><Switch checked={u.active !== false} disabled={admin} onCheckedChange={(v) => put({ active: v }, v ? "Hesap aktif" : "Hesap pasif")} data-testid={`user-active-switch-${u.email}`} /></td>
      <td className="px-3 py-3 whitespace-nowrap text-right">
        {dirty && <button onClick={() => put({ permissions: perms }, "Yetkiler kaydedildi")} className="h-8 px-3 rounded-full bg-indigo-500 text-xs font-semibold inline-flex items-center gap-1 mr-1" data-testid={`save-permissions-${u.email}`}><Save size={12} /> Kaydet</button>}
        <button onClick={() => onEdit(u)} className="p-1.5 text-slate-500 hover:text-indigo-300" title="Düzenle / şifre" data-testid={`edit-user-${u.email}`}><KeyRound size={14} /></button>
        {!admin && <button onClick={del} className="p-1.5 text-slate-500 hover:text-red-400" data-testid={`delete-user-${u.email}`}><Trash2 size={14} /></button>}
      </td>
    </tr>
  );
}

export default function Users() {
  const { user } = useApp();
  const [rows, setRows] = useState([]);
  const [dlg, setDlg] = useState({ open: false, initial: null });
  const load = () => api.get("/users").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);
  return (
    <div>
      <PageHead title="Kullanıcılar & Yetkiler" sub="Her kullanıcının erişebileceği modülleri tek tek işaretleyin.">
        <button onClick={() => setDlg({ open: true, initial: null })} data-testid="add-user-button" className="h-10 px-4 rounded-full bg-indigo-500 hover:bg-indigo-400 text-sm font-semibold flex items-center gap-2"><Plus size={15} /> Kullanıcı Ekle</button>
      </PageHead>
      <div className="fp-card overflow-x-auto">
        <table className="w-full text-sm" data-testid="permission-matrix">
          <thead><tr className="text-xs text-slate-500 border-b border-slate-800">
            <th className="px-4 py-3 text-left font-medium">Kullanıcı</th>
            {MODS.map((m) => <th key={m} className="px-2 py-3 font-medium text-[11px] leading-tight w-20">{MODULE_LABELS[m]}</th>)}
            <th className="px-3 py-3 font-medium">Aktif</th><th />
          </tr></thead>
          <tbody>{rows.map((u) => <UserRow key={u.id} u={u} me={user.id} onEdit={(x) => setDlg({ open: true, initial: x })} onChanged={load} />)}</tbody>
        </table>
      </div>
      <RatesCard />
      <UserDialog open={dlg.open} onOpenChange={(o) => setDlg((p) => ({ ...p, open: o }))} initial={dlg.initial} onSaved={load} />
    </div>
  );
}
