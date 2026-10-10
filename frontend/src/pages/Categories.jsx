import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { PageHead } from "@/components/common";
import { Input } from "@/components/ui/input";

function CatRow({ cat, index, onSaved }) {
  const [name, setName] = useState(cat.name);
  const [color, setColor] = useState(cat.color);
  useEffect(() => { setName(cat.name); setColor(cat.color); }, [cat]);
  const dirty = name !== cat.name || color !== cat.color;
  const save = async () => {
    try { await api.put(`/categories/${cat.id}`, { name, color }); toast.success("Kategori güncellendi"); onSaved(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="fp-card p-4 flex items-center gap-3 fp-rise" style={{ animationDelay: `${index * 40}ms` }} data-testid={`category-row-${cat.type}-${index + 1}`}>
      <span className="num text-xs text-slate-600 w-5">{String(index + 1).padStart(2, "0")}</span>
      <label className="relative w-9 h-9 rounded-lg shrink-0 cursor-pointer border border-white/10" style={{ background: color }}>
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" data-testid={`category-color-${cat.type}-${index + 1}`} />
      </label>
      <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && dirty && save()} data-testid={`category-name-input-${cat.type}-${index + 1}`} />
      <button onClick={save} disabled={!dirty || !name.trim()} data-testid={`edit-category-${cat.type}-${index + 1}-button`}
        className="w-9 h-9 shrink-0 grid place-items-center rounded-lg bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 transition-colors"><Check size={16} /></button>
    </div>
  );
}

export default function Categories() {
  const { lookups, refreshLookups } = useApp();
  useEffect(() => { refreshLookups(); }, [refreshLookups]);
  const exp = lookups.categories.filter((c) => c.type === "expense");
  const inc = lookups.categories.filter((c) => c.type === "income");
  return (
    <div>
      <PageHead title="Kategoriler" sub="8 gider kategorinizin adını ve rengini kendiniz belirleyin. Faturalar bu kategorilere göre sınıflandırılır." />
      <h3 className="text-sm font-semibold text-red-300 mb-3">Gider Kategorileri ({exp.length})</h3>
      <div className="grid md:grid-cols-2 gap-3 mb-10" data-testid="expense-categories">
        {exp.map((c, i) => <CatRow key={c.id} cat={c} index={i} onSaved={refreshLookups} />)}
      </div>
      <h3 className="text-sm font-semibold text-emerald-300 mb-3">Gelir Kategorileri</h3>
      <div className="grid md:grid-cols-2 gap-3" data-testid="income-categories">
        {inc.map((c, i) => <CatRow key={c.id} cat={c} index={i} onSaved={refreshLookups} />)}
      </div>
    </div>
  );
}
