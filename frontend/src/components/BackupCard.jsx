import { useState } from "react";
import { api, errMsg } from "@/lib/api";
import { toast } from "sonner";

export default function BackupCard() {
  const [accountPassword, setAccountPassword] = useState("");
  const [backupPassword, setBackupPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const download = async () => {
    if (backupPassword.length < 12 || !accountPassword) {
      toast.error("Yedek şifresi en az 12 karakter olmalıdır; hesap şifresi de gereklidir");
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append("backup_password", backupPassword);
      body.append("account_password", accountPassword);
      const result = await api.post("/backups/download", body, { responseType: "blob", timeout: 180000 });
      const file = new Blob([result.data], {type:"application/octet-stream"});
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = "finanspulse-" + new Date().toISOString().slice(0,10) + ".fpbackup";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast.success("Şifreli yedek indirildi");
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); setBackupPassword(""); setAccountPassword(""); }
  };
  return (
    <section className="fp-card p-5 mt-8 max-w-xl" data-testid="backup-card">
      <h3 className="font-semibold mb-2">Yedekleme ve Geri Yükleme</h3>
      <p className="text-xs text-slate-400 mb-3">Veritabanı ve fatura dosyalarının şifreli yedeğini bilgisayarınıza indirin. Şifreyi güvenli saklayın. Geri yükleme, canlı sistemde güvenlik nedeniyle kapalıdır; yalnızca ayrı test veritabanında etkinleştirilebilir.</p>
      <label className="text-sm block mb-2">Hesap şifresi
        <input type="password" autoComplete="current-password" value={accountPassword} onChange={e=>setAccountPassword(e.target.value)} className="block w-full mt-1 rounded bg-slate-900 border border-slate-600 p-2" />
      </label>
      <label className="text-sm block mb-3">Yedek şifresi (en az 12 karakter)
        <input type="password" autoComplete="new-password" value={backupPassword} onChange={e=>setBackupPassword(e.target.value)} className="block w-full mt-1 rounded bg-slate-900 border border-slate-600 p-2" />
      </label>
      <button type="button" onClick={download} disabled={busy} data-testid="download-backup" className="rounded-full bg-indigo-500 px-4 py-2 font-semibold disabled:opacity-50">{busy ? "Hazırlanıyor..." : "Şifreli Yedek İndir"}</button>
      <div className="mt-4 border-t border-slate-700 pt-3 text-sm">
        <strong>Yedekten Geri Yükle</strong>
        <p className="text-xs text-slate-400">Geri yükleme canlı verilerin üzerine yazmaz. Operatör tarafından ayrı bir test ortamında doğrulanmalıdır.</p>
        <button type="button" disabled className="mt-2 rounded-full border border-slate-600 px-4 py-2 opacity-50 cursor-not-allowed">Geri Yükle (test ortamı gerekli)</button>
      </div>
    </section>
  );
}
