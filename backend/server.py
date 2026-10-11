from core import (CURRENCIES, MODULES, NO_ID, convert, create_token, db, get_current_user, get_rates,
                  hash_password, new_id, now_iso, public_user, require, verify_password)

import asyncio
import logging
import os
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Dict, Literal, Optional

from fastapi import APIRouter, Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

from ai import APP_NAME, extract_invoice, get_object, init_storage, put_object
from reminders import router as reminders_router
from backups import router as backups_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()
api = APIRouter(prefix="/api")

Cur = Literal["TRY", "USD", "EUR"]

# ---------- Seed data ----------
EXPENSE_CATS = [("Personel & Maaşlar", "#3b82f6"), ("Ofis & Kira Giderleri", "#8b5cf6"),
                ("Yazılım & Bilişim", "#06b6d4"), ("Pazarlama & Reklam", "#ec4899"),
                ("Lojistik & Ulaşım", "#f59e0b"), ("Danışmanlık & Hukuk", "#10b981"),
                ("Banka Giderleri & Komisyon", "#64748b"), ("Vergiler & Harçlar", "#ef4444")]
INCOME_CATS = [("Ürün Satışı", "#10b981"), ("Hizmet Geliri", "#22d3ee"),
               ("Faiz & Finansman Geliri", "#a3e635"), ("Diğer Gelirler", "#6366f1")]
SEED_USERS = [
    ("kullanici2@finanspulse.app", "Kullanıcı 2", "Finans Müdürü",
     {m: m != "users" for m in MODULES}),
    ("kullanici3@finanspulse.app", "Kullanıcı 3", "Muhasebe",
     {m: m in ("dashboard", "transactions", "bank_accounts", "invoices", "due_tracker") for m in MODULES}),
    ("kullanici4@finanspulse.app", "Kullanıcı 4", "Satış & Cari",
     {m: m in ("dashboard", "cari_accounts", "invoices", "due_tracker") for m in MODULES}),
]


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_pw = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({"id": new_id(), "email": admin_email, "name": "Yönetici", "title": "Genel Müdür",
                                   "role": "admin", "permissions": {m: True for m in MODULES}, "active": True,
                                   "password_hash": hash_password(admin_pw), "created_at": now_iso()})
    for email, name, title, perms in (SEED_USERS if os.environ.get("SEED_DEMO_USERS") == "true" else []):
        if not await db.users.find_one({"email": email}):
            await db.users.insert_one({"id": new_id(), "email": email, "name": name, "title": title, "role": "user",
                                       "permissions": perms, "active": True, "created_at": now_iso(),
                                       "password_hash": hash_password(os.environ["SEED_USER_PASSWORD"])})
    if await db.categories.count_documents({}) == 0:
        docs = [{"id": new_id(), "type": "expense", "name": n, "color": c, "order": i} for i, (n, c) in enumerate(EXPENSE_CATS)]
        docs += [{"id": new_id(), "type": "income", "name": n, "color": c, "order": i} for i, (n, c) in enumerate(INCOME_CATS)]
        await db.categories.insert_many(docs)
    if not await db.settings.find_one({"id": "rates"}):
        await db.settings.insert_one({"id": "rates", "USD": 42.0, "EUR": 49.0, "updated_at": now_iso()})
    try:
        await asyncio.to_thread(init_storage)
    except Exception as e:
        logger.error(f"Storage init failed: {e}")


# ---------- Auth ----------
class LoginIn(BaseModel):
    email: str
    password: str


@api.post("/auth/login")
async def login(body: LoginIn, request: Request, response: Response):
    email = body.email.strip().lower()
    ident = f"{request.client.host if request.client else 'x'}:{email}"
    att = await db.login_attempts.find_one({"identifier": ident})
    now = datetime.now(timezone.utc)
    if att and att.get("count", 0) >= 5 and att.get("locked_until") and datetime.fromisoformat(att["locked_until"]) > now:
        raise HTTPException(429, "Çok fazla başarısız deneme. 15 dakika sonra tekrar deneyin.")
    user = await db.users.find_one({"email": email}, NO_ID)
    if not user or not verify_password(body.password, user["password_hash"]) or not user.get("active", True):
        count = (att or {}).get("count", 0) + 1
        await db.login_attempts.update_one({"identifier": ident}, {"$set": {
            "count": count, "locked_until": (now + timedelta(minutes=15)).isoformat() if count >= 5 else None}}, upsert=True)
        raise HTTPException(401, "E-posta veya şifre hatalı")
    await db.login_attempts.delete_many({"identifier": ident})
    token = create_token(user["id"], email)
    response.set_cookie("access_token", token, httponly=True, secure=True, samesite="none", max_age=43200, path="/")
    return {"token": token, "user": public_user(user)}


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user


# ---------- Users ----------
class UserIn(BaseModel):
    email: str
    name: str
    title: str = ""
    password: str = Field(min_length=6)
    permissions: Dict[str, bool] = {}


class UserUpdate(BaseModel):
    name: Optional[str] = None
    title: Optional[str] = None
    password: Optional[str] = None
    permissions: Optional[Dict[str, bool]] = None
    active: Optional[bool] = None


def clean_perms(p: dict) -> dict:
    return {m: bool(p.get(m)) for m in MODULES}


@api.get("/users")
async def list_users(_=Depends(require("users"))):
    users = await db.users.find({}, NO_ID).sort("created_at", 1).to_list(100)
    return [public_user(u) for u in users]


@api.post("/users")
async def create_user(body: UserIn, _=Depends(require("users"))):
    email = body.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Bu e-posta zaten kayıtlı")
    doc = {"id": new_id(), "email": email, "name": body.name, "title": body.title, "role": "user",
           "permissions": clean_perms(body.permissions), "active": True,
           "password_hash": hash_password(body.password), "created_at": now_iso()}
    await db.users.insert_one(doc)
    return public_user(doc)


@api.put("/users/{uid}")
async def update_user(uid: str, body: UserUpdate, _=Depends(require("users"))):
    target = await db.users.find_one({"id": uid}, NO_ID)
    if not target:
        raise HTTPException(404, "Kullanıcı bulunamadı")
    upd = {}
    if body.name is not None:
        upd["name"] = body.name
    if body.title is not None:
        upd["title"] = body.title
    if body.password:
        if len(body.password) < 6:
            raise HTTPException(400, "Şifre en az 6 karakter olmalı")
        upd["password_hash"] = hash_password(body.password)
    if target["role"] != "admin":
        if body.permissions is not None:
            upd["permissions"] = clean_perms(body.permissions)
        if body.active is not None:
            upd["active"] = body.active
    if upd:
        await db.users.update_one({"id": uid}, {"$set": upd})
    return public_user(await db.users.find_one({"id": uid}, NO_ID))


@api.delete("/users/{uid}")
async def delete_user(uid: str, user=Depends(require("users"))):
    target = await db.users.find_one({"id": uid}, NO_ID)
    if not target:
        raise HTTPException(404, "Kullanıcı bulunamadı")
    if target["role"] == "admin" or uid == user["id"]:
        raise HTTPException(400, "Yönetici hesabı silinemez")
    await db.users.delete_one({"id": uid})
    return {"ok": True}


# ---------- Settings (rates) ----------
class RatesIn(BaseModel):
    USD: float = Field(gt=0)
    EUR: float = Field(gt=0)


@api.get("/settings/rates")
async def rates(_=Depends(get_current_user)):
    return await get_rates()


@api.put("/settings/rates")
async def set_rates(body: RatesIn, _=Depends(require("users"))):
    await db.settings.update_one({"id": "rates"}, {"$set": {"USD": body.USD, "EUR": body.EUR, "updated_at": now_iso()}})
    return await get_rates()


# ---------- Categories ----------
class CategoryUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    color: str = "#6366f1"


@api.get("/categories")
async def list_categories(_=Depends(get_current_user)):
    return await db.categories.find({}, NO_ID).sort([("type", 1), ("order", 1)]).to_list(100)


@api.put("/categories/{cid}")
async def update_category(cid: str, body: CategoryUpdate, _=Depends(require("categories"))):
    res = await db.categories.update_one({"id": cid}, {"$set": {"name": body.name.strip(), "color": body.color}})
    if not res.matched_count:
        raise HTTPException(404, "Kategori bulunamadı")
    return await db.categories.find_one({"id": cid}, NO_ID)


# ---------- Helpers ----------
async def all_transactions(query: Optional[dict] = None) -> list:
    return await db.transactions.find(query or {}, NO_ID).to_list(20000)


async def banks_with_balance(rates: dict) -> list:
    banks = await db.banks.find({}, NO_ID).sort("created_at", 1).to_list(500)
    txs = await all_transactions({"status": "paid", "bank_account_id": {"$ne": None}})
    for b in banks:
        bal = b.get("opening_balance", 0.0)
        for t in txs:
            if t["bank_account_id"] == b["id"]:
                amt = convert(t["amount"], t["currency"], b["currency"], rates)
                bal += amt if t["type"] == "income" else -amt
        b["balance"] = round(bal, 2)
    return banks


# ---------- Banks ----------
class BankIn(BaseModel):
    name: str
    bank_name: str
    iban: str = ""
    currency: Cur = "TRY"
    opening_balance: float = 0.0


@api.get("/banks")
async def list_banks(_=Depends(require("bank_accounts", "transactions", "invoices", "due_tracker", "dashboard"))):
    return await banks_with_balance(await get_rates())


@api.post("/banks")
async def create_bank(body: BankIn, _=Depends(require("bank_accounts"))):
    doc = {"id": new_id(), **body.model_dump(), "created_at": now_iso()}
    await db.banks.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/banks/{bid}")
async def update_bank(bid: str, body: BankIn, _=Depends(require("bank_accounts"))):
    res = await db.banks.update_one({"id": bid}, {"$set": body.model_dump()})
    if not res.matched_count:
        raise HTTPException(404, "Hesap bulunamadı")
    return await db.banks.find_one({"id": bid}, NO_ID)


@api.delete("/banks/{bid}")
async def delete_bank(bid: str, _=Depends(require("bank_accounts"))):
    if await db.transactions.find_one({"bank_account_id": bid}):
        raise HTTPException(400, "Bu hesaba bağlı işlemler var, önce işlemleri silin veya taşıyın")
    await db.banks.delete_one({"id": bid})
    return {"ok": True}


class TransferIn(BaseModel):
    from_id: str
    to_id: str
    amount: float = Field(gt=0)
    date: str
    description: str = "Hesaplar arası virman"


@api.post("/banks/transfer")
async def transfer(body: TransferIn, user=Depends(require("bank_accounts"))):
    src = await db.banks.find_one({"id": body.from_id}, NO_ID)
    dst = await db.banks.find_one({"id": body.to_id}, NO_ID)
    if not src or not dst or src["id"] == dst["id"]:
        raise HTTPException(400, "Geçersiz hesap seçimi")
    rates = await get_rates()
    group = new_id()
    base = {"date": body.date, "description": body.description, "status": "paid", "category_id": None,
            "cari_id": None, "due_date": None, "vat_amount": 0, "invoice_id": None, "transfer_id": group,
            "created_by": user["id"], "created_at": now_iso()}
    await db.transactions.insert_many([
        {**base, "id": new_id(), "type": "expense", "amount": body.amount, "currency": src["currency"], "bank_account_id": src["id"]},
        {**base, "id": new_id(), "type": "income", "amount": round(convert(body.amount, src["currency"], dst["currency"], rates), 2),
         "currency": dst["currency"], "bank_account_id": dst["id"]},
    ])
    return {"ok": True}


# ---------- Caris ----------
class CariIn(BaseModel):
    name: str
    type: Literal["customer", "supplier"] = "customer"
    tax_id: str = ""
    phone: str = ""
    email: str = ""
    address: str = ""


def cari_totals(cid: str, txs: list, rates: dict) -> dict:
    rec = pay = inc = exp = 0.0
    for t in txs:
        if t.get("cari_id") != cid:
            continue
        v = convert(t["amount"], t["currency"], "TRY", rates)
        if t["type"] == "income":
            inc += v
            rec += v if t["status"] == "pending" else 0
        else:
            exp += v
            pay += v if t["status"] == "pending" else 0
    return {"receivable": round(rec, 2), "payable": round(pay, 2), "total_income": round(inc, 2), "total_expense": round(exp, 2)}


@api.get("/caris")
async def list_caris(_=Depends(require("cari_accounts", "transactions", "invoices", "due_tracker"))):
    rates = await get_rates()
    caris = await db.caris.find({}, NO_ID).sort("name", 1).to_list(2000)
    txs = await all_transactions({"cari_id": {"$ne": None}})
    for c in caris:
        c.update(cari_totals(c["id"], txs, rates))
    return caris


@api.get("/caris/{cid}")
async def get_cari(cid: str, _=Depends(require("cari_accounts"))):
    cari = await db.caris.find_one({"id": cid}, NO_ID)
    if not cari:
        raise HTTPException(404, "Cari bulunamadı")
    txs = await db.transactions.find({"cari_id": cid}, NO_ID).sort("date", -1).to_list(2000)
    cari.update(cari_totals(cid, txs, await get_rates()))
    cari["transactions"] = txs
    cari["invoices"] = await db.invoices.find({"cari_id": cid, "is_deleted": False}, NO_ID).sort("created_at", -1).to_list(500)
    return cari


@api.post("/caris")
async def create_cari(body: CariIn, _=Depends(require("cari_accounts", "invoices"))):
    doc = {"id": new_id(), **body.model_dump(), "created_at": now_iso()}
    await db.caris.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/caris/{cid}")
async def update_cari(cid: str, body: CariIn, _=Depends(require("cari_accounts"))):
    res = await db.caris.update_one({"id": cid}, {"$set": body.model_dump()})
    if not res.matched_count:
        raise HTTPException(404, "Cari bulunamadı")
    return await db.caris.find_one({"id": cid}, NO_ID)


@api.delete("/caris/{cid}")
async def delete_cari(cid: str, _=Depends(require("cari_accounts"))):
    if await db.transactions.find_one({"cari_id": cid}):
        raise HTTPException(400, "Bu cariye bağlı işlemler var, silinemez")
    await db.caris.delete_one({"id": cid})
    return {"ok": True}


# ---------- Transactions ----------
class TxIn(BaseModel):
    type: Literal["income", "expense"]
    amount: float = Field(gt=0)
    currency: Cur = "TRY"
    date: str
    description: str = ""
    category_id: Optional[str] = None
    bank_account_id: Optional[str] = None
    cari_id: Optional[str] = None
    status: Literal["paid", "pending"] = "paid"
    due_date: Optional[str] = None
    vat_amount: float = 0.0


@api.get("/transactions")
async def list_transactions(type: Optional[str] = None, status: Optional[str] = None, currency: Optional[str] = None,
                            start: Optional[str] = None, end: Optional[str] = None, category_id: Optional[str] = None,
                            q: Optional[str] = None, _=Depends(require("transactions"))):
    query: dict = {}
    if type:
        query["type"] = type
    if status:
        query["status"] = status
    if currency:
        query["currency"] = currency
    if category_id:
        query["category_id"] = category_id
    if start or end:
        query["date"] = {k: v for k, v in (("$gte", start), ("$lte", end)) if v}
    if q:
        query["description"] = {"$regex": q, "$options": "i"}
    return await db.transactions.find(query, NO_ID).sort([("date", -1), ("created_at", -1)]).to_list(5000)


@api.post("/transactions")
async def create_tx(body: TxIn, user=Depends(require("transactions"))):
    doc = {"id": new_id(), **body.model_dump(), "invoice_id": None, "created_by": user["id"], "created_at": now_iso()}
    if doc["status"] == "pending" and not doc["due_date"]:
        doc["due_date"] = doc["date"]
    await db.transactions.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/transactions/{tid}")
async def update_tx(tid: str, body: TxIn, _=Depends(require("transactions"))):
    data = body.model_dump()
    if data["status"] == "pending" and not data["due_date"]:
        data["due_date"] = data["date"]
    data["reminded"] = False
    res = await db.transactions.update_one({"id": tid}, {"$set": data})
    if not res.matched_count:
        raise HTTPException(404, "İşlem bulunamadı")
    return await db.transactions.find_one({"id": tid}, NO_ID)


@api.delete("/transactions/{tid}")
async def delete_tx(tid: str, _=Depends(require("transactions"))):
    tx = await db.transactions.find_one({"id": tid}, NO_ID)
    if not tx:
        raise HTTPException(404, "İşlem bulunamadı")
    if tx.get("transfer_id"):
        await db.transactions.delete_many({"transfer_id": tx["transfer_id"]})
    else:
        await db.transactions.delete_one({"id": tid})
    return {"ok": True}


class PayIn(BaseModel):
    bank_account_id: Optional[str] = None
    paid_date: Optional[str] = None


@api.post("/transactions/{tid}/pay")
async def mark_paid(tid: str, body: PayIn, _=Depends(require("transactions", "due_tracker"))):
    tx = await db.transactions.find_one({"id": tid}, NO_ID)
    if not tx:
        raise HTTPException(404, "İşlem bulunamadı")
    upd = {"status": "paid", "paid_date": body.paid_date or date.today().isoformat()}
    if body.bank_account_id:
        upd["bank_account_id"] = body.bank_account_id
    await db.transactions.update_one({"id": tid}, {"$set": upd})
    return await db.transactions.find_one({"id": tid}, NO_ID)


@api.get("/due")
async def due_list(_=Depends(require("due_tracker"))):
    return await db.transactions.find({"status": "pending"}, NO_ID).sort("due_date", 1).to_list(5000)


# ---------- Dashboard ----------
def month_key(d: str) -> str:
    return d[:7]


def shift_month(ym: str, delta: int) -> str:
    y, m = int(ym[:4]), int(ym[5:7])
    m += delta
    y += (m - 1) // 12
    m = (m - 1) % 12 + 1
    return f"{y:04d}-{m:02d}"


@api.get("/dashboard")
async def dashboard(cur: Cur = "TRY", _=Depends(require("dashboard"))):
    rates = await get_rates()
    txs = await all_transactions({"transfer_id": {"$exists": False}})
    today = date.today()
    this_month = today.isoformat()[:7]
    in30 = (today + timedelta(days=30)).isoformat()
    cv = lambda t: convert(t["amount"], t["currency"], cur, rates)  # noqa: E731

    kpi = defaultdict(float)
    months = [shift_month(this_month, i) for i in range(-5, 4)]
    flow = {m: {"month": m, "income": 0.0, "expense": 0.0, "projected_income": 0.0, "projected_expense": 0.0} for m in months}
    for t in txs:
        v = cv(t)
        if t["status"] == "paid":
            if month_key(t["date"]) == this_month:
                kpi[f"month_{t['type']}"] += v
            if month_key(t["date"]) in flow:
                flow[month_key(t["date"])][t["type"]] += v
        else:
            due = t.get("due_date") or t["date"]
            if due <= in30:
                kpi["upcoming_receivable" if t["type"] == "income" else "upcoming_payable"] += v
            if due < today.isoformat():
                kpi["overdue"] += v
            if month_key(due) in flow:
                flow[month_key(due)]["projected_" + t["type"]] += v
    banks = await banks_with_balance(rates)
    total_cash = sum(convert(b["balance"], b["currency"], cur, rates) for b in banks)
    pending = sorted([t for t in txs if t["status"] == "pending"], key=lambda t: t.get("due_date") or t["date"])
    recent = sorted(txs, key=lambda t: (t["date"], t["created_at"]), reverse=True)[:8]
    return {
        "currency": cur,
        "total_cash": round(total_cash, 2),
        "month_income": round(kpi["month_income"], 2),
        "month_expense": round(kpi["month_expense"], 2),
        "month_net": round(kpi["month_income"] - kpi["month_expense"], 2),
        "upcoming_receivable": round(kpi["upcoming_receivable"], 2),
        "upcoming_payable": round(kpi["upcoming_payable"], 2),
        "overdue": round(kpi["overdue"], 2),
        "cashflow": [{k: (round(v, 2) if isinstance(v, float) else v) for k, v in f.items()} for f in flow.values()],
        "banks": banks,
        "recent": recent,
        "upcoming": pending[:8],
    }


# ---------- Reports ----------
@api.get("/reports")
async def reports(start: str, end: str, cur: Cur = "TRY", _=Depends(require("reports"))):
    rates = await get_rates()
    txs = await all_transactions({"transfer_id": {"$exists": False}, "date": {"$gte": start, "$lte": end}})
    cats = {c["id"]: c for c in await db.categories.find({}, NO_ID).to_list(100)}
    caris = {c["id"]: c for c in await db.caris.find({}, NO_ID).to_list(5000)}
    by_cat = defaultdict(float)
    monthly = defaultdict(lambda: {"income": 0.0, "expense": 0.0})
    by_cari = defaultdict(lambda: {"income": 0.0, "expense": 0.0})
    totals = defaultdict(float)
    for t in txs:
        v = convert(t["amount"], t["currency"], cur, rates)
        totals[t["type"]] += v
        totals["vat_" + t["type"]] += convert(t.get("vat_amount") or 0, t["currency"], cur, rates)
        if t["status"] == "pending":
            totals["pending_" + t["type"]] += v
        by_cat[(t["type"], t.get("category_id"))] += v
        monthly[month_key(t["date"])][t["type"]] += v
        if t.get("cari_id"):
            by_cari[t["cari_id"]][t["type"]] += v

    def cat_rows(kind):
        rows = []
        for (k, cid), v in by_cat.items():
            if k == kind:
                c = cats.get(cid, {"name": "Kategorisiz", "color": "#475569"})
                rows.append({"category_id": cid, "name": c["name"], "color": c["color"], "amount": round(v, 2)})
        return sorted(rows, key=lambda r: -r["amount"])

    months = sorted(monthly)
    return {
        "currency": cur,
        "total_income": round(totals["income"], 2),
        "total_expense": round(totals["expense"], 2),
        "net": round(totals["income"] - totals["expense"], 2),
        "vat_income": round(totals["vat_income"], 2),
        "vat_expense": round(totals["vat_expense"], 2),
        "pending_income": round(totals["pending_income"], 2),
        "pending_expense": round(totals["pending_expense"], 2),
        "expense_by_category": cat_rows("expense"),
        "income_by_category": cat_rows("income"),
        "monthly": [{"month": m, "income": round(monthly[m]["income"], 2), "expense": round(monthly[m]["expense"], 2),
                     "net": round(monthly[m]["income"] - monthly[m]["expense"], 2)} for m in months],
        "by_cari": sorted([{"cari_id": k, "name": caris.get(k, {}).get("name", "-"), "income": round(v["income"], 2),
                            "expense": round(v["expense"], 2)} for k, v in by_cari.items()],
                          key=lambda r: -(r["income"] + r["expense"]))[:15],
    }


# ---------- Invoices ----------
ALLOWED = {"application/pdf", "image/png", "image/jpeg", "image/webp"}


@api.get("/invoices")
async def list_invoices(_=Depends(require("invoices"))):
    return await db.invoices.find({"is_deleted": False}, NO_ID).sort("created_at", -1).to_list(2000)


@api.post("/invoices/upload")
async def upload_invoice(file: UploadFile = File(...), direction: Literal["incoming", "outgoing"] = Form(...),
                         user=Depends(require("invoices"))):
    mime = file.content_type or ""
    if mime == "image/jpg":
        mime = "image/jpeg"
    if mime not in ALLOWED:
        raise HTTPException(400, "Sadece PDF, PNG, JPG veya WEBP yükleyebilirsiniz")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(400, "Dosya 10 MB'dan büyük olamaz")
    inv_id = new_id()
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "bin"
    try:
        stored = await asyncio.to_thread(put_object, f"{APP_NAME}/invoices/{inv_id}.{ext}", data, mime)
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(502, "Dosya depolamaya yüklenemedi")
    ctype = "expense" if direction == "incoming" else "income"
    cats = await db.categories.find({"type": ctype}, NO_ID).sort("order", 1).to_list(20)
    extracted, ai_error = {}, None
    try:
        extracted = await extract_invoice(data, mime, direction, cats)
    except Exception as e:
        logger.error(f"AI extraction failed: {e}")
        ai_error = "Yapay zeka faturayı okuyamadı, bilgileri elle girebilirsiniz."
    doc = {"id": inv_id, "direction": direction, "filename": file.filename, "storage_path": stored["path"],
           "content_type": mime, "size": len(data), "status": "draft", "extracted": extracted, "ai_error": ai_error,
           "transaction_id": None, "cari_id": None, "uploaded_by": user["id"], "is_deleted": False, "created_at": now_iso()}
    await db.invoices.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/invoices/{iid}/file")
async def invoice_file(iid: str, _=Depends(require("invoices", "cari_accounts"))):
    inv = await db.invoices.find_one({"id": iid, "is_deleted": False}, NO_ID)
    if not inv:
        raise HTTPException(404, "Fatura bulunamadı")
    data, _ct = await asyncio.to_thread(get_object, inv["storage_path"])
    return Response(content=data, media_type=inv["content_type"])


class ConfirmIn(BaseModel):
    vendor: str
    tax_id: str = ""
    invoice_no: str = ""
    date: str
    due_date: Optional[str] = None
    subtotal: float = 0.0
    vat: float = 0.0
    total: float = Field(gt=0)
    currency: Cur = "TRY"
    category_id: Optional[str] = None
    cari_id: Optional[str] = None
    status: Literal["paid", "pending"] = "pending"
    bank_account_id: Optional[str] = None
    description: str = ""


@api.post("/invoices/{iid}/confirm")
async def confirm_invoice(iid: str, body: ConfirmIn, user=Depends(require("invoices"))):
    inv = await db.invoices.find_one({"id": iid, "is_deleted": False}, NO_ID)
    if not inv:
        raise HTTPException(404, "Fatura bulunamadı")
    if inv["status"] == "confirmed":
        raise HTTPException(400, "Bu fatura zaten onaylandı")
    cari_id = body.cari_id
    if not cari_id and body.vendor.strip():
        found = await db.caris.find_one({"name": {"$regex": f"^{body.vendor.strip()}$", "$options": "i"}}, NO_ID) \
            if body.vendor.strip().isprintable() else None
        if found:
            cari_id = found["id"]
        else:
            cari_id = new_id()
            await db.caris.insert_one({"id": cari_id, "name": body.vendor.strip(), "tax_id": body.tax_id,
                                       "type": "supplier" if inv["direction"] == "incoming" else "customer",
                                       "phone": "", "email": "", "address": "", "created_at": now_iso()})
    tx_type = "expense" if inv["direction"] == "incoming" else "income"
    desc = body.description or f"Fatura {body.invoice_no}".strip()
    tx = {"id": new_id(), "type": tx_type, "amount": body.total, "currency": body.currency, "date": body.date,
          "description": desc, "category_id": body.category_id, "bank_account_id": body.bank_account_id,
          "cari_id": cari_id, "status": body.status, "due_date": body.due_date or (body.date if body.status == "pending" else None),
          "vat_amount": body.vat, "invoice_id": iid, "created_by": user["id"], "created_at": now_iso()}
    await db.transactions.insert_one(tx)
    await db.invoices.update_one({"id": iid}, {"$set": {"status": "confirmed", "transaction_id": tx["id"], "cari_id": cari_id,
                                                        "data": body.model_dump(), "confirmed_at": now_iso()}})
    return await db.invoices.find_one({"id": iid}, NO_ID)


@api.delete("/invoices/{iid}")
async def delete_invoice(iid: str, _=Depends(require("invoices"))):
    await db.invoices.update_one({"id": iid}, {"$set": {"is_deleted": True}})
    return {"ok": True}


@api.get("/")
async def root():
    return {"message": "FinansPulse API"}


app.include_router(api)
app.include_router(reminders_router)
app.include_router(backups_router)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=os.environ.get("CORS_ORIGINS", "").split(","),
                   allow_methods=["*"], allow_headers=["*"])


@app.on_event("shutdown")
async def shutdown():
    from core import client
    client.close()
