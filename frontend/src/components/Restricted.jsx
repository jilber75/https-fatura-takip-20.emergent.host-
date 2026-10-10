import { ShieldOff } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { MODULE_LABELS } from "@/lib/format";

export function Guard({ module, children }) {
  const { can } = useApp();
  if (can(module)) return children;
  return (
    <div className="fp-card p-12 text-center max-w-lg mx-auto mt-16 fp-rise" data-testid="access-restricted">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-red-500/10 grid place-items-center mb-5">
        <ShieldOff className="text-red-400" />
      </div>
      <h2 className="text-xl font-bold mb-2">Erişim Kısıtlandı</h2>
      <p className="text-slate-400 text-sm">
        "{MODULE_LABELS[module]}" modülünü görüntüleme yetkiniz yok. Yöneticinizden yetki talep edebilirsiniz.
      </p>
    </div>
  );
}
