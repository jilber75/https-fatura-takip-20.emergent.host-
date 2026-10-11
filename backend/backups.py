"""Manual encrypted portable backups. Restore is deliberately restricted to an empty staging database."""
import asyncio
import hashlib
import io
import json
import os
import re
import secrets
import zipfile
from datetime import datetime, timezone

from bson import json_util
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from ai import get_object, put_object
from core import client, db, get_current_user, now_iso, verify_password

router = APIRouter(prefix="/api/backups", tags=["backup"])
COLLECTIONS = ("users", "categories", "settings", "banks", "caris", "transactions", "invoices")
MAGIC = b"FPBACKUP1"
MAX_ARCHIVE = 100 * 1024 * 1024
MAX_ATTACHMENT = 12 * 1024 * 1024


def admin_only(user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(403, "Only administrators can manage backups")
    return user


def derive(password, salt):
    return Scrypt(salt=salt, length=32, n=2**15, r=8, p=1).derive(password.encode())


def encrypt(data, password):
    salt, nonce = secrets.token_bytes(16), secrets.token_bytes(12)
    return MAGIC + salt + nonce + AESGCM(derive(password, salt)).encrypt(nonce, data, MAGIC)


def decrypt(data, password):
    if len(data) < 53 or not data.startswith(MAGIC):
        raise ValueError("Invalid encrypted backup")
    i = len(MAGIC)
    return AESGCM(derive(password, data[i:i+16])).decrypt(data[i+16:i+28], data[i+28:], MAGIC)


async def archive_database():
    output = io.BytesIO()
    manifest = {"format": 1, "created_at": now_iso(), "consistency": "best_effort",
                "collections": {}, "files": {}}
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in COLLECTIONS:
            rows = await db[name].find({}).to_list(length=None)
            data = json_util.dumps(rows).encode()
            if len(data) > MAX_ARCHIVE:
                raise ValueError("Collection too large for manual backup")
            archive.writestr(f"collections/{name}.json", data)
            manifest["collections"][name] = {"count": len(rows), "sha256": hashlib.sha256(data).hexdigest()}
            if output.tell() > MAX_ARCHIVE:
                raise ValueError("Archive too large")
        for invoice in await db.invoices.find({"storage_path": {"$type": "string"}}).to_list(length=None):
            data, mime = await asyncio.to_thread(get_object, invoice["storage_path"])
            if len(data) > MAX_ATTACHMENT:
                raise ValueError("Invoice attachment too large")
            archive.writestr(f"attachments/{invoice['id']}", data)
            manifest["files"][invoice["id"]] = {
                "size": len(data), "sha256": hashlib.sha256(data).hexdigest(), "mime": mime}
            if output.tell() > MAX_ARCHIVE:
                raise ValueError("Archive too large")
        archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False))
    if output.tell() > MAX_ARCHIVE:
        raise ValueError("Archive too large")
    return output.getvalue()


def validate_archive(raw):
    if len(raw) > MAX_ARCHIVE:
        raise ValueError("Archive too large")
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        names = set(archive.namelist())
        if any(item.file_size > MAX_ARCHIVE for item in archive.infolist()):
            raise ValueError("Oversized archive member")
        manifest = json.loads(archive.read("manifest.json"))
        if manifest.get("format") != 1 or set(manifest.get("collections", {})) != set(COLLECTIONS):
            raise ValueError("Incomplete backup")
        documents = {}
        for name in COLLECTIONS:
            raw_collection = archive.read(f"collections/{name}.json")
            meta = manifest["collections"][name]
            if hashlib.sha256(raw_collection).hexdigest() != meta["sha256"]:
                raise ValueError("Collection integrity failure")
            rows = json_util.loads(raw_collection.decode())
            if not isinstance(rows, list) or len(rows) != meta["count"]:
                raise ValueError("Invalid collection")
            documents[name] = rows
        for iid, meta in manifest["files"].items():
            data = archive.read(f"attachments/{iid}")
            if len(data) > MAX_ATTACHMENT or len(data) != meta["size"] or hashlib.sha256(data).hexdigest() != meta["sha256"]:
                raise ValueError("Attachment integrity failure")
        expected = {"manifest.json"} | {f"collections/{x}.json" for x in COLLECTIONS} | {f"attachments/{x}" for x in manifest["files"]}
        if names != expected:
            raise ValueError("Unexpected archive members")
        return manifest, documents


@router.get("/status")
async def status(user=Depends(admin_only)):
    return {"download_enabled": True, "restore_enabled": os.getenv("BACKUP_RESTORE_ENABLED") == "true",
            "restore_mode": "isolated_new_database", "max_mb": 100}


@router.post("/download")
async def download(backup_password: str = Form(...), account_password: str = Form(...),
                   user=Depends(admin_only)):
    if len(backup_password) < 12:
        raise HTTPException(422, "Backup password must contain at least 12 characters")
    actual = await db.users.find_one({"id": user["id"]})
    if not actual or not verify_password(account_password, actual["password_hash"]):
        raise HTTPException(403, "Invalid account password")
    try:
        result = encrypt(await archive_database(), backup_password)
    except Exception:
        raise HTTPException(503, "Backup failed; review server logs")
    filename = datetime.now(timezone.utc).strftime("finanspulse-%Y%m%d-%H%M%S.fpbackup")
    return Response(content=result, media_type="application/octet-stream", headers={
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})


@router.post("/restore")
async def restore(file: UploadFile = File(...), backup_password: str = Form(...),
                  account_password: str = Form(...), target_database: str = Form(...),
                  confirmation: str = Form(...), user=Depends(admin_only)):
    if os.getenv("BACKUP_RESTORE_ENABLED") != "true":
        raise HTTPException(403, "Restore disabled by configuration")
    if confirmation != "RESTORE" or not re.fullmatch(r"finanspulse_restore_[a-z0-9_]{4,32}", target_database):
        raise HTTPException(422, "Confirmation or destination name invalid")
    if target_database == os.environ["DB_NAME"] or target_database in await client.list_database_names():
        raise HTTPException(409, "Restore requires a new empty staging database")
    actual = await db.users.find_one({"id": user["id"]})
    if not actual or not verify_password(account_password, actual["password_hash"]):
        raise HTTPException(403, "Invalid account password")
    encrypted = await file.read(MAX_ARCHIVE + 128)
    if len(encrypted) > MAX_ARCHIVE + 64:
        raise HTTPException(413, "Backup too large")
    try:
        plain = decrypt(encrypted, backup_password)
        manifest, docs = validate_archive(plain)
    except Exception:
        raise HTTPException(422, "Invalid password or damaged backup")
    target = client[target_database]
    try:
        # Restored attachments are copied to a separate namespace, leaving production files untouched.
        with zipfile.ZipFile(io.BytesIO(plain)) as archive:
            for invoice in docs["invoices"]:
                if invoice["id"] in manifest["files"]:
                    meta = manifest["files"][invoice["id"]]
                    data = archive.read(f"attachments/{invoice['id']}")
                    stored = await asyncio.to_thread(
                        put_object, f"finanspulse/restores/{target_database}/{invoice['id']}", data, meta["mime"])
                    invoice["storage_path"] = stored["path"]
        for name, rows in docs.items():
            if rows:
                await target[name].insert_many(rows)
        await target.users.create_index("email", unique=True)
    except Exception:
        await client.drop_database(target_database)
        raise HTTPException(503, "Restore failed; staging database cleanup attempted")
    return {"restored": True, "database": target_database,
            "counts": {name: len(rows) for name, rows in docs.items()},
            "notice": "Staging database only; live application was not modified"}
