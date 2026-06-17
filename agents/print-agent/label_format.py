"""标签文字格式渲染（与前端 labelFormat.ts 一致）。"""
from __future__ import annotations

import re
from typing import Any

LABEL_CANVAS_REF_H = 560

DEFAULT_LABEL_LINES: list[dict[str, Any]] = [
    {
        "id": "warning",
        "kind": "text",
        "name": "退换提示",
        "format": "标签撕毁 不予退换",
        "show": True,
        "size": 15,
        "fontFamily": "msyh",
        "bold": True,
        "yPx": 13,
        "offsetXPx": 3,
    },
    {
        "id": "barcode",
        "kind": "barcode",
        "name": "条形码",
        "format": "{certNo}",
        "show": True,
        "size": 14,
        "fontFamily": "msyh",
        "bold": True,
        "yPx": 28,
        "xPx": 11,
        "barcodeHeight": 62,
        "captionGapPx": 1,
    },
    {
        "id": "title",
        "kind": "text",
        "name": "标题行",
        "format": "{category}",
        "show": True,
        "size": 16,
        "fontFamily": "msyh",
        "bold": True,
        "yPx": 136,
        "offsetXPx": 2,
        "offsetYPx": 2,
    },
    {
        "id": "cert",
        "kind": "text",
        "name": "编号",
        "format": "编号:{certNo}",
        "show": True,
        "size": 16,
        "fontFamily": "msyh",
        "bold": False,
        "yPx": 160,
    },
    {
        "id": "ring",
        "kind": "text",
        "name": "圈口",
        "format": "圈口:{ringSize}",
        "show": True,
        "size": 15,
        "fontFamily": "msyh",
        "bold": False,
        "yPx": 185,
    },
    {
        "id": "price",
        "kind": "text",
        "name": "售价",
        "format": "售价{price}元",
        "show": True,
        "size": 15,
        "fontFamily": "msyh",
        "bold": False,
        "yPx": 208,
    },
]

_PLACEHOLDER_RE = re.compile(r"\{(\w+)\}")
_BLOCK_RE = re.compile(r"\[([^\]]+)\]")


def build_label_data(data: dict[str, Any]) -> dict[str, str]:
    category = str(data.get("category") or data.get("title") or "天然和田玉手镯").strip()
    return {
        "certNo": str(data.get("certNo") or "").strip().upper(),
        "category": category or "天然和田玉手镯",
        "title": category or "天然和田玉手镯",
        "ringSize": str(data.get("ringSize") or "").strip(),
        "weightGram": str(data.get("weightGram") or "").strip(),
        "price": str(data.get("price") or data.get("cost") or "").strip(),
        "batch": str(data.get("batch") or "").strip(),
        "cost": str(data.get("cost") or "").strip(),
        "remark": str(data.get("remark") or "").strip(),
    }


def render_label_format(fmt: str, label_data: dict[str, str]) -> str | None:
    text = (fmt or "").strip()
    if not text:
        return None

    if "[" in text:
        def _block(m: re.Match[str]) -> str:
            block = m.group(1)
            keys = _PLACEHOLDER_RE.findall(block)
            if any(not label_data.get(k, "").strip() for k in keys):
                return ""
            seg = block
            for k in keys:
                seg = seg.replace(f"{{{k}}}", label_data[k].strip())
            return seg

        out = _BLOCK_RE.sub(_block, text)
        out = _PLACEHOLDER_RE.sub(lambda m: label_data.get(m.group(1), "").strip(), out)
        out = re.sub(r"\s+", " ", out).strip()
        return out or None

    keys = _PLACEHOLDER_RE.findall(text)
    if not keys:
        return text
    if any(not label_data.get(k, "").strip() for k in keys):
        return None
    out = text
    for k in keys:
        out = out.replace(f"{{{k}}}", label_data[k].strip())
    return out.strip() or None


def resolve_lines(
    lines: list[dict[str, Any]] | None,
    fields: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    if lines:
        return lines
    if fields:
        return _migrate_fields_to_lines(fields)
    return DEFAULT_LABEL_LINES


def _migrate_fields_to_lines(fields: list[dict[str, Any]]) -> list[dict[str, Any]]:
    def size(key: str, fallback: int) -> int:
        for f in fields:
            if f.get("key") == key:
                return int(f.get("size") or fallback)
        return fallback

    def show(key: str, fallback: bool) -> bool:
        for f in fields:
            if f.get("key") == key:
                return bool(f.get("show", fallback))
        return fallback

    lines = [dict(line) for line in DEFAULT_LABEL_LINES]
    for line in lines:
        if line["id"] == "barcode":
            line["show"] = show("barcode", True)
            line["size"] = size("barcode", 12)
        elif line["id"] == "title":
            line["show"] = show("category", True)
            line["size"] = size("category", 16)
        elif line["id"] == "cert":
            line["show"] = show("certNo", True)
            line["size"] = size("certNo", 16)
        elif line["id"] == "ring":
            line["show"] = show("ringSize", True)
            line["size"] = size("ringSize", 15)
        elif line["id"] == "price":
            line["show"] = show("price", True)
            line["size"] = size("price", 15)
    return lines
