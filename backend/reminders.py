import hmac
import logging
import os
from datetime import datetime, timedelta
from html import escape
from typing import List
from zoneinfo import ZoneInfo

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from core import NO_ID, db, now_iso, require
from mailer import EMAIL_FROM_NAME, EmailError, send_email

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")
TZ = ZoneInfo("Europe/Istanbul")


class ReminderCfg(BaseModel):
    enabled: bool = True
    days_before: int = Field(3, ge=1, le=30)
    recipient_ids: List[str] = []


async def get_cfg() -> dict:
    cfg = await db.settings.find_one({"id": "reminders"}, NO_ID)
    if not cfg:
        admin = await db.users.find_one({"role": "admin"}, NO_ID)
        cfg = {"id": "reminders", "enabled": True, "days_before": 3,
               "recipient_ids": [admin["id"]] if admin else [], "last_run": None}
        await db.settings.insert_one(dict(cfg))
    return cfg


def money(v: float, cur: str) -> str:
    sym = {"TRY": "₺", "USD": "$", "EUR": "€"}.get(cur, "")
    s = f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{sym}{s}"


def render(items: list, caris: dict, today: str, days: int) -> str:
    rows = ""
    for t in items:
        due = t["due_date"]
        d = (datetime.fromisoformat(due).date() - datetime.fromisoformat(today).date()).days
        when = f"{-d} gün gecikti" if d < 0 else ("Bugün" if d == 0 else f"{d} gün kaldı")
        color = "#dc2626" if d < 0 else ("#d97706" if d <= 3 else "#2563eb")
        kind = "Tahsilat" if t["type"] == "income" else "Ödeme"
        amt_color = "#059669" if t["type"] == "income" else "#dc2626"
        rows += (f'<tr><td style="padding:10px;border-bottom:1px solid #e5e7eb">{escape(datetime.fromisoformat(due).strftime("%d.%m.%Y"))}'
                 f'<div style="font-size:11px;color:{color}">{when}</div></td>'
                 f'<td style="padding:10px;border-bottom:1px solid #e5e7eb">{kind}</td>'
                 f'<td style="padding:10px;border-bottom:1px solid #e5e7eb">{escape(t.get("description") or "-")}'
                 f'<div style="font-size:11px;color:#6b7280">{escape(caris.get(t.get("cari_id"), ""))}</div></td>'
                 f'<td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;color:{amt_color};font-weight:bold">'
                 f'{escape(money(t["amount"], t["currency"]))}</td></tr>')
    return (f'<table role="presentation" width="100%" style="font-family:Arial,sans-serif;background:#f3f4f6;padding:24px">'
            f'<tr><td><table role="presentation" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px">'
            f'<tr><td><h2 style="margin:0 0 4px;color:#111827">Vade Hatırlatması</h2>'
            f'<p style="margin:0 0 16px;color:#6b7280;font-size:14px">Önümüzdeki {days} gün içinde vadesi gelen veya gecikmiş '
            f'{len(items)} ödeme / tahsilat kaydınız var.</p>'
            f'<table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px;color:#111827">'
            f'<tr style="background:#f9fafb;text-align:left;font-size:12px;color:#6b7280">'
            f'<th style="padding:10px">Vade</th><th style="padding:10px">Tür</th><th style="padding:10px">Açıklama</th>'
            f'<th style="padding:10px;text-align:right">Tutar</th></tr>{rows}</table>'
            f'<p style="margin:20px 0 0;color:#6b7280;font-size:13px">Detaylar için uygulamada "Ödeme &amp; Tahsilat" sayfasını açın.</p>'
            f'<p style="margin:16px 0 0;font-size:11px;color:#9ca3af">Bu e-posta {escape(EMAIL_FROM_NAME)} tarafından otomatik gönderildi. '
            f'Sizden asla şifre veya kart bilgisi istemeyiz.</p></td></tr></table></td></tr></table>')


async def run_reminders(manual: bool = False) -> dict:
    cfg = await get_cfg()
    if not cfg["enabled"] and not manual:
        return {"sent": 0, "items": 0, "skipped": "disabled"}
    today = datetime.now(TZ).date()
    limit = (today + timedelta(days=cfg["days_before"])).isoformat()
    query = {"status": "pending", "due_date": {"$ne": None, "$lte": limit}}
    if not manual:
        query["reminded"] = {"$ne": True}
    items = await db.transactions.find(query, NO_ID).sort("due_date", 1).to_list(500)
    result = {"items": len(items), "sent": 0, "errors": []}
    if items:
        users = await db.users.find({"id": {"$in": cfg["recipient_ids"]}, "active": {"$ne": False}}, NO_ID).to_list(50)
        caris = {c["id"]: c["name"] async for c in db.caris.find({}, {"_id": 0, "id": 1, "name": 1})}
        html = render(items, caris, today.isoformat(), cfg["days_before"])
        subject = f"{EMAIL_FROM_NAME}: {len(items)} yaklaşan ödeme / tahsilat"
        for u in users:
            try:
                await send_email(to=u["email"], subject=subject, html=html)
                result["sent"] += 1
            except EmailError as e:
                result["errors"].append(f"{u['email']}: {e}")
        if result["sent"]:
            await db.transactions.update_many({"id": {"$in": [t["id"] for t in items]}},
                                              {"$set": {"reminded": True, "reminded_at": now_iso()}})
    await db.settings.update_one({"id": "reminders"}, {"$set": {"last_run": now_iso(), "last_result": result}})
    return result


@router.get("/settings/reminders")
async def reminders_cfg(_=Depends(require("users"))):
    return await get_cfg()


@router.put("/settings/reminders")
async def set_reminders_cfg(body: ReminderCfg, _=Depends(require("users"))):
    await get_cfg()
    await db.settings.update_one({"id": "reminders"}, {"$set": body.model_dump()})
    return await get_cfg()


@router.post("/reminders/send-now")
async def send_now(_=Depends(require("users"))):
    cfg = await get_cfg()
    if not cfg["recipient_ids"]:
        raise HTTPException(400, "En az bir alıcı seçin")
    return await run_reminders(manual=True)


@router.post("/cron/due-reminders")
async def cron_due_reminders(request: Request, background: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer ") or not hmac.compare_digest(auth[7:], os.environ["WEBHOOK_CRON_SECRET"]):
        raise HTTPException(401, "Unauthorized")
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid body")
    run_id = request.headers.get("X-Webhook-Id") or (body or {}).get("run_id")
    if run_id:
        if await db.cron_runs.find_one({"run_id": run_id}):
            return {"status": "duplicate"}
        await db.cron_runs.insert_one({"run_id": run_id, "created_at": now_iso()})
    background.add_task(run_reminders)
    return {"status": "accepted"}
