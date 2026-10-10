import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Activity, ArrowRight, Loader2 } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { errMsg } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Login() {
  const { user, login } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await login(email, password);
    } catch (e2) {
      setErr(errMsg(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 fp-grid-bg">
      <div className="hidden lg:flex flex-col justify-between p-14 border-r border-slate-800/70 relative overflow-hidden">
        <div className="absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[380px] h-[380px] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="flex items-center gap-3 relative">
          <div className="w-10 h-10 rounded-xl bg-indigo-500 grid place-items-center"><Activity size={20} /></div>
          <span className="font-extrabold text-lg">FinansPulse</span>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.05]">
            Nakit akışınız,<br /><span className="text-emerald-400">tek ekranda.</span>
          </h1>
          <p className="text-slate-400 mt-6 leading-relaxed">
            Gelir, gider, banka ve cari hesaplarınızı yönetin; faturalarınızı yapay zeka ile okutun, yaklaşan ödemeleri kaçırmayın.
          </p>
        </div>
        <div className="relative grid grid-cols-3 gap-4 num text-sm">
          {[["₺", "TRY"], ["$", "USD"], ["€", "EUR"]].map(([s, c]) => (
            <div key={c} className="fp-card p-4"><div className="text-2xl text-indigo-300">{s}</div><div className="text-slate-500 text-xs mt-1">{c}</div></div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm fp-rise" data-testid="login-form">
          <h2 className="text-2xl font-extrabold tracking-tight">Giriş yap</h2>
          <p className="text-sm text-slate-400 mt-1 mb-8">Hesabınız yöneticiniz tarafından oluşturulur.</p>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-posta</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-11" data-testid="login-email-input" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Şifre</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="h-11" data-testid="login-password-input" />
            </div>
            {err && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3" data-testid="login-error">{err}</div>}
            <button disabled={busy} data-testid="login-submit-button"
              className="w-full h-11 rounded-full bg-indigo-500 hover:bg-indigo-400 transition-colors font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
              {busy ? <Loader2 className="animate-spin" size={18} /> : <>Giriş Yap <ArrowRight size={16} /></>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
