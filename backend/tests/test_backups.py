"""Pure backup cryptographic and archive validation smoke tests."""
import io
import json
import zipfile
import hashlib
import pytest

from backups import COLLECTIONS, MAGIC, decrypt, encrypt, validate_archive

def test_encrypted_roundtrip():
    data = b"private financial records"
    encrypted = encrypt(data, "test-password-with-length")
    assert encrypted.startswith(MAGIC)
    assert data not in encrypted
    assert decrypt(encrypted, "test-password-with-length") == data

def test_wrong_password_rejected():
    encrypted = encrypt(b"secret", "correct-password-123")
    with pytest.raises(Exception):
        decrypt(encrypted, "incorrect-password")

def test_archive_integrity():
    buff = io.BytesIO()
    manifest = {"format": 1, "collections": {}, "files": {}}
    with zipfile.ZipFile(buff, "w") as z:
        for name in COLLECTIONS:
            data = b"[]"
            z.writestr(f"collections/{name}.json", data)
            manifest["collections"][name] = {"count": 0, "sha256": hashlib.sha256(data).hexdigest()}
        z.writestr("manifest.json", json.dumps(manifest))
    m, records = validate_archive(buff.getvalue())
    assert all(records[name] == [] for name in COLLECTIONS)
    assert m["format"] == 1

def test_tampered_archive_rejected():
    with pytest.raises(Exception):
        validate_archive(b"not an archive")
