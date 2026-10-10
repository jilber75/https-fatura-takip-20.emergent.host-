import json
import logging
import os
import re
import tempfile
import uuid

import requests
from emergentintegrations.llm.chat import FileContentWithMimeType, LlmChat, StreamDone, TextDelta, UserMessage

logger = logging.getLogger(__name__)

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = "finanspulse"
_storage_key = None


def init_storage(force: bool = False) -> str:
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": os.environ["EMERGENT_LLM_KEY"]}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": init_storage(), "Content-Type": content_type},
                        data=data, timeout=120)
    if resp.status_code == 404:
        resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                            headers={"X-Storage-Key": init_storage(True), "Content-Type": content_type},
                            data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def get_object(path: str) -> tuple:
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": init_storage()}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


SYSTEM = ("Sen bir Türk muhasebe asistanısın. Faturaları okuyup yapılandırılmış veriye dönüştürürsün. "
          "Sadece geçerli JSON döndür, başka hiçbir metin yazma.")


def build_prompt(direction: str, categories: list) -> str:
    kind = "GELEN fatura (bizim tedarikçiden aldığımız, gider)" if direction == "incoming" \
        else "KESİLEN fatura (bizim müşteriye kestiğimiz, gelir)"
    cats = "\n".join(f'- id: "{c["id"]}" ad: "{c["name"]}"' for c in categories)
    return f"""Bu belge bir {kind}.
Aşağıdaki alanları çıkar ve SADECE şu JSON formatında döndür:
{{"vendor": "karşı firmanın adı (gelen faturada satıcı, kesilen faturada alıcı)",
"tax_id": "karşı firmanın VKN/TCKN veya boş",
"invoice_no": "fatura numarası",
"date": "YYYY-MM-DD",
"due_date": "YYYY-MM-DD veya null",
"subtotal": sayı (KDV hariç matrah),
"vat": sayı (KDV tutarı),
"total": sayı (genel toplam),
"currency": "TRY" | "USD" | "EUR",
"category_id": "aşağıdaki listeden en uygun kategorinin id'si",
"description": "kısa açıklama (ne satın alındı/satıldı)"}}
Kategoriler:
{cats}
Sayılarda binlik ayırıcı kullanma, ondalık için nokta kullan."""


async def extract_invoice(data: bytes, mime: str, direction: str, categories: list) -> dict:
    ext = {"application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}.get(mime, ".bin")
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as f:
        f.write(data)
        path = f.name
    try:
        chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"inv-{uuid.uuid4()}",
                       system_message=SYSTEM).with_model("gemini", "gemini-3-flash-preview")
        text = ""
        msg = UserMessage(text=build_prompt(direction, categories),
                          file_contents=[FileContentWithMimeType(file_path=path, mime_type=mime)])
        async for ev in chat.stream_message(msg):
            if isinstance(ev, TextDelta):
                text += ev.content
            elif isinstance(ev, StreamDone):
                break
    finally:
        os.unlink(path)
    match = re.search(r"\{.*\}", text, re.S)
    if not match:
        raise ValueError("AI yanıtı çözümlenemedi")
    result = json.loads(match.group(0))
    if result.get("category_id") not in {c["id"] for c in categories}:
        result["category_id"] = None
    if result.get("currency") not in ("TRY", "USD", "EUR"):
        result["currency"] = "TRY"
    return result
