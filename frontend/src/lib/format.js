export const CURRENCIES = ["TRY", "USD", "EUR"];
export const SYMBOL = { TRY: "₺", USD: "$", EUR: "€" };

export const fmtMoney = (v, cur = "TRY") =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(v || 0);

export const fmtCompact = (v, cur = "TRY") =>
  `${SYMBOL[cur]}${new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 }).format(v || 0)}`;

export const fmtDate = (d) => (d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("tr-TR") : "-");

export const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const daysUntil = (d) =>
  Math.round((new Date(`${d}T00:00:00`) - new Date(`${today()}T00:00:00`)) / 86400000);

export const monthLabel = (ym) =>
  new Date(`${ym}-01T00:00:00`).toLocaleDateString("tr-TR", { month: "short", year: "2-digit" });

export const convert = (amount, from, to, rates) =>
  ((amount || 0) * (rates?.[from] || 1)) / (rates?.[to] || 1);

export const MODULE_LABELS = {
  dashboard: "Genel Bakış",
  transactions: "Gelir & Gider",
  bank_accounts: "Banka Hesapları",
  cari_accounts: "Cari Hesaplar",
  invoices: "Faturalar",
  due_tracker: "Vade Takibi",
  reports: "Raporlar",
  categories: "Kategoriler",
  users: "Kullanıcılar & Yetkiler",
};

export function downloadCSV(filename, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
