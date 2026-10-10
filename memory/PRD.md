# FinansPulse — PRD

## Original problem statement
gelirleri giderleri banka hesaplarini cari hesaplari yaklasan odemeleri ve tahsilatlari tek yerden yonetebilecegim finansal raporlar hazirlayabilecegim nakit akisimi anlik takip edebilecegim modern bir finans yonetim uygulamasi olustur, 4 kullanicisi icin ayri ayri hesaplar olustur ve yetkiler ver gelen faturalari ve kesilen faturalari yukleyebilecegim ve tutarlarin gelir ve gider olarak katagorize olmasini sagla her bir gider icin benim belirleyebilecegim 8 kategori olustur.

User choices: JWT e-posta+şifre (hesapları yönetici açar), modül bazlı yetki checkbox'ları, Gemini ile fatura okuma + onay, TRY+USD+EUR, koyu tema.

## Architecture
- Backend: FastAPI (server.py routes, core.py auth/perm/db, ai.py object storage + Gemini gemini-3-flash-preview via emergentintegrations), MongoDB (uuid `id` fields).
- Frontend: React + shadcn + recharts, Bearer token in localStorage, AppContext (user, perms, currency, rates, lookups).
- Collections: users, categories, banks, caris, transactions, invoices, settings(rates), login_attempts.

## Personas
Yönetici (tam yetki), Finans Müdürü, Muhasebe, Satış & Cari.

## Implemented (2026-10-10)
- Login, 4 seeded accounts, admin permission matrix (9 modules), user CRUD/aktif-pasif/şifre
- Gelir & Gider CRUD, filtreler, CSV; Banka hesapları (bakiye, IBAN kopya, virman, çoklu döviz)
- Cari hesaplar (alacak/borç, detay); Vade takibi (gecikmiş/7 gün/sonra, ödendi işaretle)
- Fatura yükleme (gelen=gider, kesilen=gelir), AI çıkarım, onay ekranı, otomatik cari oluşturma
- 8 düzenlenebilir gider kategorisi (+4 gelir kategorisi)
- Dashboard KPI + nakit akışı (6 ay gerçekleşen + 3 ay vadeli), Raporlar (donut, aylık K/Z, KDV, cari, CSV, yazdır)
- Döviz kurları yönetici tarafından elle girilir (varsayılan 42 / 49 — güncellenmeli)

## Backlog
- P1: Otomatik TCMB kur çekme; tekrarlayan (aylık) giderler; e-posta vade hatırlatma
- P2: Excel (xlsx) export, bütçe hedefleri, çoklu fatura toplu yükleme
