from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

import os
import uuid
from datetime import datetime, timezone, timedelta

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorClient

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

MODULES = ["dashboard", "transactions", "bank_accounts", "cari_accounts", "invoices",
           "due_tracker", "reports", "categories", "users"]
CURRENCIES = ["TRY", "USD", "EUR"]
NO_ID = {"_id": 0}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "type": "access",
               "exp": datetime.now(timezone.utc) + timedelta(hours=12)}
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm="HS256")


def public_user(u: dict) -> dict:
    u = {k: v for k, v in u.items() if k not in ("_id", "password_hash")}
    if u.get("role") == "admin":
        u["permissions"] = {m: True for m in MODULES}
    return u


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
    if not token:
        raise HTTPException(401, "Oturum açılmamış")
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Oturum süresi doldu")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Geçersiz oturum")
    user = await db.users.find_one({"id": payload["sub"]}, NO_ID)
    if not user or not user.get("active", True):
        raise HTTPException(401, "Kullanıcı bulunamadı")
    return public_user(user)


def require(*mods):
    async def dep(user: dict = Depends(get_current_user)) -> dict:
        if any(user["permissions"].get(m) for m in mods):
            return user
        raise HTTPException(403, "Bu modüle erişim yetkiniz yok")
    return dep


async def get_rates() -> dict:
    doc = await db.settings.find_one({"id": "rates"}, NO_ID)
    return {"TRY": 1.0, "USD": doc["USD"], "EUR": doc["EUR"], "updated_at": doc.get("updated_at")}


def convert(amount: float, frm: str, to: str, rates: dict) -> float:
    return amount * rates.get(frm, 1.0) / rates.get(to, 1.0)
