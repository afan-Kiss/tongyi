"""25×70 珠宝吊牌位图渲染（供 GDI 驱动打印）。"""
from __future__ import annotations

import os
from io import BytesIO
from typing import Any

from PIL import Image, ImageDraw, ImageFont

DPI = 203


def _mm_to_px(mm: float) -> int:
    return max(1, round(mm / 25.4 * DPI))


def _load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        (r"C:\Windows\Fonts\msyhbd.ttc", 0),
        (r"C:\Windows\Fonts\msyh.ttc", 0),
        (r"C:\Windows\Fonts\simhei.ttf", None),
        (r"C:\Windows\Fonts\simsun.ttc", 0),
    ]
    for path, index in candidates:
        if os.path.isfile(path):
            try:
                if index is not None:
                    return ImageFont.truetype(path, size, index=index)
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def _make_barcode_image(code: str, max_width: int, max_height: int) -> Image.Image:
    try:
        import barcode
        from barcode.writer import ImageWriter

        bc = barcode.get("code128", code, writer=ImageWriter())
        buf = BytesIO()
        bc.write(
            buf,
            options={
                "module_width": 0.22,
                "module_height": max(8, max_height - 18),
                "font_size": 9,
                "text_distance": 2,
                "quiet_zone": 1,
                "write_text": True,
            },
        )
        img = Image.open(buf).convert("RGB")
    except Exception:
        img = Image.new("RGB", (max_width, max_height), "white")
        draw = ImageDraw.Draw(img)
        draw.text((4, 4), code, fill="black", font=_load_font(12))
        return img

    if img.width > max_width or img.height > max_height:
        img.thumbnail((max_width, max_height), Image.Resampling.LANCZOS)
    return img


def render_jewelry_tag_bitmap(
    data: dict[str, Any],
    *,
    side: str = "both",
    width_mm: float = 25,
    height_mm: float = 70,
    fields: list[dict[str, Any]] | None = None,
) -> Image.Image:
    if width_mm >= 60 and height_mm <= 30:
        width_mm, height_mm = height_mm, width_mm

    w = _mm_to_px(width_mm)
    h = _mm_to_px(height_mm)
    img = Image.new("RGB", (w, h), "white")
    draw = ImageDraw.Draw(img)

    info_fields = fields or [
        {"key": "certNo", "label": "编号", "show": True, "size": 12},
        {"key": "ringSize", "label": "圈口", "show": True, "size": 10},
        {"key": "weightGram", "label": "克重", "show": True, "size": 10},
        {"key": "price", "label": "价格", "show": True, "size": 10},
    ]

    mid_y = h // 2
    if side == "both":
        draw.line([(0, mid_y), (w, mid_y)], fill="#cccccc", width=1)

    if side in ("back", "both"):
        zone_h = mid_y if side == "both" else h
        code = str(data.get("certNo") or "").strip()
        if code:
            bc = _make_barcode_image(code.upper(), w - 8, max(40, zone_h - 8))
            bx = (w - bc.width) // 2
            by = max(2, (zone_h - bc.height) // 2)
            img.paste(bc, (bx, by))

    if side in ("front", "both"):
        y0 = mid_y + 4 if side == "both" else 4
        y = y0
        for field in info_fields:
            if not field.get("show"):
                continue
            key = str(field.get("key") or "")
            if key == "barcode":
                continue
            label = str(field.get("label") or key)
            value = str(data.get(key) or "—").strip()
            if not value or value == "—":
                continue
            size = max(int(field.get("size") or 10), 14)
            font = _load_font(size)
            text = f"{label} {value}" if label else value
            draw.text((4, y), text, fill="black", font=font)
            y += size + 6
            if y >= h - 2:
                break

    return img
