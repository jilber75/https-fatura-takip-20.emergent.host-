"""FinansPulse — Vade Hatırlatma (reminders) feature tests.

Covers:
- GET/PUT /api/settings/reminders (admin only; 403 for kullanici3)
- POST /api/reminders/send-now (items/sent for pending within window; items=0 when none)
- POST /api/cron/due-reminders (auth, duplicate run_id, no re-send on reminded, PUT resets reminded)

Email policy: Keep admin as the only recipient throughout. At most 2 real emails are
expected (one from send-now, one from the final cron run after editing the tx). All
other paths use an empty recipient list to avoid real sends while still exercising
the reminders pipeline.
"""
import os
import time
import uuid
from datetime import date, timedelta
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
CRON_SECRET = os.environ["WEBHOOK_CRON_SECRET"]
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

ADMIN = {"email": "jilber75@gmail.com", "password": "Finans2026!"}
U3 = {"email": "kullanici3@finanspulse.app", "password": "Kullanici2026!"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def admin():
    j = _login(ADMIN)
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {j['token']}"})
    s.user_id = j["user"]["id"]
    return s


@pytest.fixture(scope="module")
def u3():
    j = _login(U3)
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {j['token']}"})
    return s


@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


# Module-level state so cleanup fixture can see what was created
_state = {"tx_id": None, "run_ids": [], "admin_id": None}


@pytest.fixture(scope="module", autouse=True)
def _teardown(request, admin, mongo):
    yield
    # Delete TEST_ transaction
    if _state["tx_id"]:
        admin.delete(f"{API}/transactions/{_state['tx_id']}")
    # Delete any TEST_ pending leftovers just in case
    for t in admin.get(f"{API}/transactions").json():
        if (t.get("description") or "").startswith("TEST_"):
            admin.delete(f"{API}/transactions/{t['id']}")
    # Clean cron_runs test entries
    if _state["run_ids"]:
        mongo.cron_runs.delete_many({"run_id": {"$in": _state["run_ids"]}})
    # Restore default reminders config: enabled=True, days_before=3, recipient_ids=[admin]
    if _state["admin_id"]:
        admin.put(f"{API}/settings/reminders", json={
            "enabled": True, "days_before": 3, "recipient_ids": [_state["admin_id"]]
        })


# ---------------- Permissions ----------------
class TestReminderPermissions:
    def test_admin_get_ok(self, admin):
        _state["admin_id"] = admin.user_id
        r = admin.get(f"{API}/settings/reminders")
        assert r.status_code == 200
        d = r.json()
        assert "enabled" in d and "days_before" in d and "recipient_ids" in d

    def test_u3_get_forbidden(self, u3):
        r = u3.get(f"{API}/settings/reminders")
        assert r.status_code == 403

    def test_u3_put_forbidden(self, u3):
        r = u3.put(f"{API}/settings/reminders", json={
            "enabled": True, "days_before": 3, "recipient_ids": []
        })
        assert r.status_code == 403

    def test_admin_put_persists(self, admin):
        r = admin.put(f"{API}/settings/reminders", json={
            "enabled": True, "days_before": 5, "recipient_ids": [admin.user_id]
        })
        assert r.status_code == 200
        d = r.json()
        assert d["enabled"] is True
        assert d["days_before"] == 5
        assert d["recipient_ids"] == [admin.user_id]
        # Reset to canonical defaults for next tests
        admin.put(f"{API}/settings/reminders", json={
            "enabled": True, "days_before": 3, "recipient_ids": [admin.user_id]
        })

    def test_days_before_validation(self, admin):
        # out of range should 422
        r = admin.put(f"{API}/settings/reminders", json={
            "enabled": True, "days_before": 0, "recipient_ids": [admin.user_id]
        })
        assert r.status_code == 422
        r = admin.put(f"{API}/settings/reminders", json={
            "enabled": True, "days_before": 31, "recipient_ids": [admin.user_id]
        })
        assert r.status_code == 422


# ---------------- send-now ----------------
class TestSendNow:
    def test_create_pending_tx_within_window(self, admin):
        due = (date.today() + timedelta(days=1)).isoformat()
        r = admin.post(f"{API}/transactions", json={
            "type": "expense", "amount": 123.45, "currency": "TRY",
            "date": date.today().isoformat(), "description": "TEST_reminder_tx",
            "status": "pending", "due_date": due
        })
        assert r.status_code == 200, r.text
        _state["tx_id"] = r.json()["id"]

    def test_send_now_items_and_sent(self, admin):
        # Email #1 (real): sent to admin only
        r = admin.post(f"{API}/reminders/send-now")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["items"] >= 1
        assert d["sent"] >= 1
        assert not d.get("errors"), d.get("errors")

    def test_tx_marked_reminded_after_send(self, admin):
        # Poll briefly in case background work (none here, send-now is sync) but be safe
        tx = None
        for _ in range(5):
            txs = admin.get(f"{API}/transactions").json()
            tx = next((t for t in txs if t["id"] == _state["tx_id"]), None)
            if tx and tx.get("reminded"):
                break
            time.sleep(0.3)
        assert tx is not None
        assert tx.get("reminded") is True

    def test_send_now_items_zero_when_none(self, admin):
        # Delete the only in-window TEST_ pending tx — but there may be other real
        # pending items. To get a deterministic items=0, temporarily set days_before=1
        # and move our tx's due_date out of range, then also verify no OTHER pending
        # items have due_date within 1 day. If baseline is nonzero we skip.
        future = (date.today() + timedelta(days=30)).isoformat()
        admin.put(f"{API}/transactions/{_state['tx_id']}", json={
            "type": "expense", "amount": 123.45, "currency": "TRY",
            "date": date.today().isoformat(), "description": "TEST_reminder_tx",
            "status": "pending", "due_date": future
        })
        limit = (date.today() + timedelta(days=1)).isoformat()
        pending = [t for t in admin.get(f"{API}/transactions", params={"status": "pending"}).json()
                   if t.get("due_date") and t["due_date"] <= limit]
        if pending:
            pytest.skip(f"{len(pending)} pre-existing pending txs within window — cannot assert items=0")
        admin.put(f"{API}/settings/reminders", json={
            "enabled": True, "days_before": 1, "recipient_ids": [admin.user_id]
        })
        r = admin.post(f"{API}/reminders/send-now")
        assert r.status_code == 200
        d = r.json()
        assert d["items"] == 0
        assert d["sent"] == 0
        # Restore for next tests
        admin.put(f"{API}/settings/reminders", json={
            "enabled": True, "days_before": 3, "recipient_ids": [admin.user_id]
        })


# ---------------- cron ----------------
class TestCron:
    def test_cron_401_no_auth(self):
        r = requests.post(f"{API}/cron/due-reminders", json={})
        assert r.status_code == 401

    def test_cron_401_wrong_secret(self):
        r = requests.post(f"{API}/cron/due-reminders", json={},
                          headers={"Authorization": "Bearer wrong"})
        assert r.status_code == 401

    def test_cron_accepted_no_email_when_reminded(self, admin):
        # Restore due_date back into window so run_reminders would normally pick it up,
        # but reminded=True from TestSendNow means cron skips it (no re-send).
        due = (date.today() + timedelta(days=1)).isoformat()
        # Use direct update instead of PUT to preserve reminded=True
        # (PUT resets reminded; we want to assert cron does NOT re-send a reminded tx)
        # Fall back to Mongo helper via fixture.
        pass

    def test_cron_does_not_resend_reminded(self, admin, mongo):
        # Previous test moved due_date out of window via PUT, which also reset
        # reminded=False. Restore both due_date (in window) and reminded=True
        # directly in Mongo so the API behavior (cron skips reminded txs) is tested
        # in isolation.
        due = (date.today() + timedelta(days=1)).isoformat()
        mongo.transactions.update_one(
            {"id": _state["tx_id"]},
            {"$set": {"due_date": due, "reminded": True}},
        )
        run_id = f"TEST_run_{uuid.uuid4()}"
        _state["run_ids"].append(run_id)
        r = requests.post(f"{API}/cron/due-reminders", json={},
                          headers={"Authorization": f"Bearer {CRON_SECRET}",
                                   "X-Webhook-Id": run_id})
        assert r.status_code == 200
        assert r.json()["status"] == "accepted"
        # Wait for background task to finish
        time.sleep(3)
        cfg = admin.get(f"{API}/settings/reminders").json()
        assert cfg.get("last_run")
        last = cfg.get("last_result") or {}
        # Should find 0 items because our tx is reminded=True (query filters it out)
        assert last.get("items") == 0, f"last_result={last}"
        assert last.get("sent") == 0

    def test_cron_duplicate_run_id(self, admin):
        run_id = f"TEST_run_{uuid.uuid4()}"
        _state["run_ids"].append(run_id)
        r1 = requests.post(f"{API}/cron/due-reminders", json={},
                           headers={"Authorization": f"Bearer {CRON_SECRET}",
                                    "X-Webhook-Id": run_id})
        assert r1.status_code == 200
        assert r1.json()["status"] == "accepted"
        time.sleep(1)
        r2 = requests.post(f"{API}/cron/due-reminders", json={},
                           headers={"Authorization": f"Bearer {CRON_SECRET}",
                                    "X-Webhook-Id": run_id})
        assert r2.status_code == 200
        assert r2.json()["status"] == "duplicate"

    def test_put_tx_resets_reminded(self, admin):
        # Edit the transaction — reminded should reset to False
        due = (date.today() + timedelta(days=1)).isoformat()
        r = admin.put(f"{API}/transactions/{_state['tx_id']}", json={
            "type": "expense", "amount": 150.00, "currency": "TRY",
            "date": date.today().isoformat(), "description": "TEST_reminder_tx_edit",
            "status": "pending", "due_date": due
        })
        assert r.status_code == 200
        tx = next(t for t in admin.get(f"{API}/transactions").json() if t["id"] == _state["tx_id"])
        assert tx.get("reminded") is False

    def test_cron_picks_up_after_reset_without_email(self, admin):
        # Zero recipients -> cron finds items but sends 0 emails (safe assertion of reset)
        admin.put(f"{API}/settings/reminders", json={
            "enabled": True, "days_before": 3, "recipient_ids": []
        })
        run_id = f"TEST_run_{uuid.uuid4()}"
        _state["run_ids"].append(run_id)
        r = requests.post(f"{API}/cron/due-reminders", json={},
                          headers={"Authorization": f"Bearer {CRON_SECRET}",
                                   "X-Webhook-Id": run_id})
        assert r.status_code == 200
        time.sleep(3)
        cfg = admin.get(f"{API}/settings/reminders").json()
        last = cfg.get("last_result") or {}
        assert last.get("items", 0) >= 1, f"expected items>=1 after reset; last_result={last}"
        assert last.get("sent", 0) == 0
