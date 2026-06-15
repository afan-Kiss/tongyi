"""璞趣桌面端本地 pqapi（127.0.0.1:6780）。"""
from __future__ import annotations

import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from label_png import png_to_data_url, render_jewelry_tag_png

PQAPI_BASE = os.environ.get("PUQU_PQAPI_URL", "http://127.0.0.1:6780/pqapi")


def pqapi_available(timeout: float = 1.5) -> bool:
    try:
        req = urllib.request.Request(
            f"{PQAPI_BASE}/GetPrinters?onlyLocal=true&onlyOnline=true&onlySupported=true",
            data=b"",
            method="POST",
            headers={"Content-Type": "text/plain;charset=UTF-8"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return '"statusCode":"10001"' in body or '"statusCode": "10001"' in body
    except Exception:
        return False


def list_printers(timeout: float = 3.0) -> list[str]:
    req = urllib.request.Request(
        f"{PQAPI_BASE}/GetPrinters?onlyLocal=true&onlyOnline=true&onlySupported=true",
        data=b"",
        method="POST",
        headers={"Content-Type": "text/plain;charset=UTF-8"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        import json

        data = json.loads(resp.read().decode("utf-8"))
    printers = data.get("resultInfo", {}).get("printers") or []
    return [str(p.get("name") or "") for p in printers if p.get("name")]


def print_image(printer_name: str, data_url: str, timeout: float = 30.0) -> None:
    url = f"{PQAPI_BASE}/PrintImage?printName={urllib.parse.quote(printer_name)}"
    req = urllib.request.Request(
        url,
        data=data_url.encode("utf-8"),
        method="POST",
        headers={"Content-Type": "text/plain;charset=UTF-8"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        import json

        result = json.loads(resp.read().decode("utf-8"))
    code = str(result.get("statusCode") or "")
    if code != "10001":
        raise RuntimeError(result.get("resultInfo") or result.get("message") or "PrintImage 失败")


def print_jewelry_tag_pqapi(
    printer_name: str,
    data: dict[str, Any],
    *,
    side: str = "both",
    fields: list[dict[str, Any]] | None = None,
    lines: list[dict[str, Any]] | None = None,
    offsets: dict[str, Any] | None = None,
    width_mm: float = 25,
    height_mm: float = 70,
    compact_feed: bool = False,
) -> dict[str, Any]:
    image = render_jewelry_tag_png(
        data,
        side=side,
        fields=fields,
        lines=lines,
        offsets=offsets,
        width_mm=width_mm,
        height_mm=height_mm,
        compact_feed=compact_feed,
    )
    print_image(printer_name, png_to_data_url(image))
    return {
        "pixels": image.size,
        "widthMm": round(image.size[0] * 25.4 / 203, 1),
        "heightMm": round(image.size[1] * 25.4 / 203, 1),
        "compactFeed": compact_feed,
    }
