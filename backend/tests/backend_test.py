"""FinansPulse backend API tests.

Covers: auth, permissions (403), users CRUD, rates, categories, banks (incl. transfer),
caris, transactions (incl. mark paid, due list), dashboard, reports, invoices listing.
Uses live backend via REACT_APP_BACKEND_URL. All test-created data uses TEST_ prefix.
"""
import os
import io
import time
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "jilber75@gmail.com", "password": "Finans2026!"}
U2 = {"email": "kullanici2@finanspulse.app", "password": "Kullanici2026!"}
U3 = {"email": "kullanici3@finanspulse.app", "password": "Kullanici2026!"}
U4 = {"email": "kullanici4@finanspulse.app", "password": "Kullanici2026!"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    return r


@pytest.fixture(scope="session")
def admin_token():
    r = _login(ADMIN)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}"})
    return s


@pytest.fixture(scope="session")
def u4_token():
    r = _login(U4)
    assert r.status_code == 200
    return r.json()["token"]


@pytest.fixture(scope="session")
def u4(u4_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {u4_token}"})
    return s


# ---------------- Auth ----------------
class TestAuth:
    def test_login_admin_ok(self):
        r = _login(ADMIN)
        assert r.status_code == 200
        j = r.json()
        assert j["user"]["role"] == "admin"
        assert all(j["user"]["permissions"].values())
        assert isinstance(j["token"], str) and len(j["token"]) > 20

    def test_login_bad_password(self):
        r = _login({"email": ADMIN["email"], "password": "wrong"})
        assert r.status_code == 401

    def test_me_requires_auth(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me_with_token(self, admin):
        r = admin.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN["email"]

    def test_seeded_users_login(self):
        for u in (U2, U3, U4):
            r = _login(u)
            assert r.status_code == 200, f"login failed for {u['email']}"


# ---------------- Permissions ----------------
class TestPermissions:
    def test_u4_cannot_list_users(self, u4):
        r = u4.get(f"{API}/users")
        assert r.status_code == 403

    def test_u4_cannot_list_transactions(self, u4):
        r = u4.get(f"{API}/transactions")
        assert r.status_code == 403

    def test_u4_can_list_caris(self, u4):
        r = u4.get(f"{API}/caris")
        assert r.status_code == 200

    def test_u4_cannot_access_reports(self, u4):
        r = u4.get(f"{API}/reports", params={"start": "2025-01-01", "end": "2025-12-31"})
        assert r.status_code == 403


# ---------------- Rates & categories ----------------
class TestRatesCats:
    def test_get_rates(self, admin):
        r = admin.get(f"{API}/settings/rates")
        assert r.status_code == 200
        d = r.json()
        assert d["TRY"] == 1.0
        assert d["USD"] > 0 and d["EUR"] > 0

    def test_update_rates_persists(self, admin):
        orig = admin.get(f"{API}/settings/rates").json()
        new_usd = round(orig["USD"] + 0.01, 4)
        r = admin.put(f"{API}/settings/rates", json={"USD": new_usd, "EUR": orig["EUR"]})
        assert r.status_code == 200
        assert admin.get(f"{API}/settings/rates").json()["USD"] == new_usd
        # restore
        admin.put(f"{API}/settings/rates", json={"USD": orig["USD"], "EUR": orig["EUR"]})

    def test_categories_8_expense_4_income(self, admin):
        r = admin.get(f"{API}/categories")
        assert r.status_code == 200
        cats = r.json()
        exp = [c for c in cats if c["type"] == "expense"]
        inc = [c for c in cats if c["type"] == "income"]
        assert len(exp) == 8
        assert len(inc) == 4

    def test_update_category(self, admin):
        cats = admin.get(f"{API}/categories").json()
        c = [x for x in cats if x["type"] == "expense"][0]
        orig_name, orig_color = c["name"], c["color"]
        r = admin.put(f"{API}/categories/{c['id']}", json={"name": "TEST_cat", "color": "#111111"})
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_cat"
        admin.put(f"{API}/categories/{c['id']}", json={"name": orig_name, "color": orig_color})


# ---------------- Users CRUD ----------------
_created_user_id = {}


class TestUsers:
    def test_create_user(self, admin):
        # Clean any leftover test user first
        for u in admin.get(f"{API}/users").json():
            if u["email"] == "test_user1@example.com":
                admin.delete(f"{API}/users/{u['id']}")
        payload = {"email": "test_user1@example.com", "name": "TEST_User1", "title": "Test",
                   "password": "Secret123!", "permissions": {"dashboard": True, "transactions": True}}
        r = admin.post(f"{API}/users", json=payload)
        assert r.status_code == 200
        u = r.json()
        assert u["email"] == payload["email"]
        assert u["permissions"]["dashboard"] is True
        assert u["permissions"]["users"] is False
        _created_user_id["uid"] = u["id"]

    def test_update_password_and_login(self, admin):
        uid = _created_user_id["uid"]
        r = admin.put(f"{API}/users/{uid}", json={"password": "NewSecret1!"})
        assert r.status_code == 200
        r = _login({"email": "test_user1@example.com", "password": "NewSecret1!"})
        assert r.status_code == 200

    def test_deactivate_blocks_login(self, admin):
        uid = _created_user_id["uid"]
        r = admin.put(f"{API}/users/{uid}", json={"active": False})
        assert r.status_code == 200
        r2 = _login({"email": "test_user1@example.com", "password": "NewSecret1!"})
        assert r2.status_code == 401

    def test_delete_user(self, admin):
        uid = _created_user_id["uid"]
        r = admin.delete(f"{API}/users/{uid}")
        assert r.status_code == 200
        users = admin.get(f"{API}/users").json()
        assert all(u["id"] != uid for u in users)


# ---------------- Banks + transfer ----------------
_bank_state = {}


class TestBanks:
    def test_create_two_banks(self, admin):
        r1 = admin.post(f"{API}/banks", json={"name": "TEST_TRY", "bank_name": "Testbank", "iban": "",
                                              "currency": "TRY", "opening_balance": 10000.0})
        r2 = admin.post(f"{API}/banks", json={"name": "TEST_USD", "bank_name": "Testbank", "iban": "",
                                              "currency": "USD", "opening_balance": 500.0})
        assert r1.status_code == 200 and r2.status_code == 200
        _bank_state["try_id"] = r1.json()["id"]
        _bank_state["usd_id"] = r2.json()["id"]

    def test_list_has_balance(self, admin):
        banks = admin.get(f"{API}/banks").json()
        try_b = next(b for b in banks if b["id"] == _bank_state["try_id"])
        assert try_b["balance"] == 10000.0

    def test_transfer_updates_balances(self, admin):
        rates = admin.get(f"{API}/settings/rates").json()
        r = admin.post(f"{API}/banks/transfer", json={"from_id": _bank_state["try_id"],
                                                     "to_id": _bank_state["usd_id"],
                                                     "amount": 1000.0, "date": "2025-06-01",
                                                     "description": "TEST_transfer"})
        assert r.status_code == 200, r.text
        banks = admin.get(f"{API}/banks").json()
        try_b = next(b for b in banks if b["id"] == _bank_state["try_id"])
        usd_b = next(b for b in banks if b["id"] == _bank_state["usd_id"])
        assert try_b["balance"] == round(10000.0 - 1000.0, 2)
        # USD gained TRY->USD converted amount
        expected_usd = 500.0 + round(1000.0 / rates["USD"], 2)
        assert abs(usd_b["balance"] - expected_usd) < 0.1


# ---------------- Caris ----------------
_cari_state = {}


class TestCaris:
    def test_create_cari(self, admin):
        r = admin.post(f"{API}/caris", json={"name": "TEST_Cari", "type": "supplier",
                                             "tax_id": "123", "phone": "", "email": "", "address": ""})
        assert r.status_code == 200
        _cari_state["id"] = r.json()["id"]

    def test_cari_detail(self, admin):
        r = admin.get(f"{API}/caris/{_cari_state['id']}")
        assert r.status_code == 200
        d = r.json()
        assert d["name"] == "TEST_Cari"
        assert "receivable" in d and "payable" in d
        assert isinstance(d["transactions"], list)


# ---------------- Transactions ----------------
_tx_state = {}


class TestTransactions:
    def test_create_expense_paid(self, admin):
        r = admin.post(f"{API}/transactions", json={
            "type": "expense", "amount": 250.0, "currency": "TRY", "date": "2025-06-05",
            "description": "TEST_exp", "bank_account_id": _bank_state["try_id"],
            "cari_id": _cari_state["id"], "status": "paid"})
        assert r.status_code == 200, r.text
        _tx_state["paid"] = r.json()["id"]

    def test_bank_balance_reflects_tx(self, admin):
        banks = admin.get(f"{API}/banks").json()
        try_b = next(b for b in banks if b["id"] == _bank_state["try_id"])
        assert try_b["balance"] == round(10000.0 - 1000.0 - 250.0, 2)

    def test_create_pending_income_due(self, admin):
        r = admin.post(f"{API}/transactions", json={
            "type": "income", "amount": 500.0, "currency": "TRY", "date": "2025-06-10",
            "description": "TEST_pending", "cari_id": _cari_state["id"],
            "status": "pending", "due_date": "2025-07-01"})
        assert r.status_code == 200
        _tx_state["pending"] = r.json()["id"]

    def test_due_list_contains_pending(self, admin):
        due = admin.get(f"{API}/due").json()
        assert any(t["id"] == _tx_state["pending"] for t in due)

    def test_mark_paid(self, admin):
        r = admin.post(f"{API}/transactions/{_tx_state['pending']}/pay",
                       json={"bank_account_id": _bank_state["try_id"], "paid_date": "2025-07-02"})
        assert r.status_code == 200
        assert r.json()["status"] == "paid"
        due = admin.get(f"{API}/due").json()
        assert not any(t["id"] == _tx_state["pending"] for t in due)

    def test_filter_tx(self, admin):
        r = admin.get(f"{API}/transactions", params={"type": "expense", "q": "TEST_exp"})
        assert r.status_code == 200
        assert any(t["id"] == _tx_state["paid"] for t in r.json())

    def test_update_tx(self, admin):
        r = admin.put(f"{API}/transactions/{_tx_state['paid']}", json={
            "type": "expense", "amount": 300.0, "currency": "TRY", "date": "2025-06-05",
            "description": "TEST_exp_upd", "bank_account_id": _bank_state["try_id"],
            "cari_id": _cari_state["id"], "status": "paid"})
        assert r.status_code == 200
        assert r.json()["amount"] == 300.0


# ---------------- Dashboard & reports ----------------
class TestDashboardReports:
    def test_dashboard_try(self, admin):
        r = admin.get(f"{API}/dashboard", params={"cur": "TRY"})
        assert r.status_code == 200
        d = r.json()
        for k in ("total_cash", "month_income", "month_expense", "cashflow", "banks", "recent", "upcoming"):
            assert k in d
        assert len(d["cashflow"]) == 9

    def test_dashboard_usd_differs(self, admin):
        try_cash = admin.get(f"{API}/dashboard", params={"cur": "TRY"}).json()["total_cash"]
        usd_cash = admin.get(f"{API}/dashboard", params={"cur": "USD"}).json()["total_cash"]
        assert try_cash != usd_cash or try_cash == 0

    def test_reports(self, admin):
        r = admin.get(f"{API}/reports", params={"start": "2025-01-01", "end": "2025-12-31", "cur": "TRY"})
        assert r.status_code == 200
        d = r.json()
        assert "total_income" in d and "expense_by_category" in d and "monthly" in d


# ---------------- Invoices (list only, upload exercises AI) ----------------
class TestInvoices:
    def test_list(self, admin):
        r = admin.get(f"{API}/invoices")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_upload_bad_mime(self, admin):
        files = {"file": ("bad.txt", io.BytesIO(b"hello"), "text/plain")}
        r = admin.post(f"{API}/invoices/upload", files=files, data={"direction": "incoming"})
        assert r.status_code == 400


# ---------------- Cleanup ----------------
class TestZCleanup:
    """Runs last due to Z prefix. Deletes test-created data."""

    def test_cleanup(self, admin):
        # delete txs
        for tid in list(_tx_state.values()):
            admin.delete(f"{API}/transactions/{tid}")
        # delete transfer-related txs via listing
        txs = admin.get(f"{API}/transactions").json()
        for t in txs:
            if t.get("description", "").startswith("TEST_") or "TEST_transfer" in (t.get("description") or ""):
                admin.delete(f"{API}/transactions/{t['id']}")
        # delete cari
        if _cari_state.get("id"):
            admin.delete(f"{API}/caris/{_cari_state['id']}")
        # delete banks
        for bid in (_bank_state.get("try_id"), _bank_state.get("usd_id")):
            if bid:
                admin.delete(f"{API}/banks/{bid}")
        # delete any TEST_ users remaining
        users = admin.get(f"{API}/users").json()
        for u in users:
            if u["email"].startswith("test_"):
                admin.delete(f"{API}/users/{u['id']}")
