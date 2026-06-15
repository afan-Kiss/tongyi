"""25×70 珠宝吊牌 — GDI 矢量绘制（TextOut + PatBlt，兼容 PUQU UNIDRV）。"""
from __future__ import annotations

from io import BytesIO
from typing import Any

import win32con
import win32gui
import win32print
import win32ui


def make_label_devmode(printer_name: str, width_mm: float, height_mm: float):
    handle = win32print.OpenPrinter(printer_name)
    try:
        dm = win32print.GetPrinter(handle, 2)["pDevMode"]
        dm.Fields = (
            dm.Fields
            | win32con.DM_PAPERSIZE
            | win32con.DM_PAPERWIDTH
            | win32con.DM_PAPERLENGTH
            | win32con.DM_ORIENTATION
        )
        dm.PaperSize = win32con.DMPAPER_USER
        dm.PaperWidth = int(round(width_mm * 10))
        dm.PaperLength = int(round(height_mm * 10))
        dm.Orientation = win32con.DMORIENT_PORTRAIT
        win32print.DocumentProperties(
            0,
            handle,
            printer_name,
            dm,
            dm,
            win32con.DM_IN_BUFFER | win32con.DM_OUT_BUFFER,
        )
        return dm
    finally:
        win32print.ClosePrinter(handle)


def _create_font(size: int):
    return win32ui.CreateFont(
        {
            "name": "Microsoft YaHei",
            "height": size,
            "weight": 600,
        }
    )


def _barcode_raster(code: str, max_width: int, max_height: int):
    from PIL import Image

    try:
        import barcode
        from barcode.writer import ImageWriter

        bc = barcode.get("code128", code.upper(), writer=ImageWriter())
        buf = BytesIO()
        bc.write(
            buf,
            options={
                "module_width": 0.28,
                "module_height": 10,
                "font_size": 10,
                "text_distance": 2,
                "quiet_zone": 1,
                "write_text": True,
            },
        )
        img = Image.open(buf).convert("L")
        img = img.point(lambda p: 0 if p < 128 else 255, mode="1")
    except Exception:
        return None

    w, h = img.size
    if w <= 0 or h <= 0:
        return None
    scale = min(max_width / w, max_height / h, 2.5)
    if scale <= 0:
        scale = 1
    bw = max(1, int(w * scale))
    bh = max(1, int(h * scale))
    if (bw, bh) != (w, h):
        img = img.resize((bw, bh), Image.Resampling.NEAREST)
    return img


def _draw_barcode(hdc, code: str, x: int, y: int, max_width: int, max_height: int) -> int:
    img = _barcode_raster(code, max_width, max_height)
    if img is None:
        hdc.TextOut(x, y, code.upper())
        return y + 24

    brush = win32ui.CreateBrush(win32con.BS_SOLID, 0, 0)
    old_brush = hdc.SelectObject(brush)
    pixels = img.load()
    for row in range(img.height):
        col = 0
        while col < img.width:
            if pixels[col, row] == 0:
                start = col
                while col < img.width and pixels[col, row] == 0:
                    col += 1
                hdc.FillRect((x + start, y + row, x + col, y + row + 1), brush)
            else:
                col += 1
    hdc.SelectObject(old_brush)
    return y + img.height


def print_jewelry_tag_gdi(
    printer_name: str,
    data: dict[str, Any],
    *,
    side: str = "both",
    width_mm: float = 25,
    height_mm: float = 70,
    fields: list[dict[str, Any]] | None = None,
) -> None:
    if width_mm >= 60 and height_mm <= 30:
        width_mm, height_mm = height_mm, width_mm

    info_fields = fields or [
        {"key": "ringSize", "label": "圈口", "show": True, "size": 12},
        {"key": "weightGram", "label": "克重", "show": True, "size": 10},
        {"key": "price", "label": "价格", "show": True, "size": 10},
        {"key": "batch", "label": "批次", "show": True, "size": 9},
    ]

    devmode = make_label_devmode(printer_name, width_mm, height_mm)
    hdc = win32ui.CreateDC()
    hdc.CreatePrinterDC(printer_name)
    try:
        win32gui.ResetDC(hdc.GetHandleOutput(), devmode)
        hdc.SetMapMode(win32con.MM_TEXT)

        page_w = hdc.GetDeviceCaps(110)
        page_h = hdc.GetDeviceCaps(111)
        mid_y = page_h // 2

        hdc.StartDoc("jade-jewelry-tag")
        hdc.StartPage()

        if side == "both":
            pen = win32ui.CreatePen(win32con.PS_DASH, 1, 0xAAAAAA)
            old_pen = hdc.SelectObject(pen)
            hdc.MoveTo((4, mid_y))
            hdc.LineTo((page_w - 4, mid_y))
            hdc.SelectObject(old_pen)

        if side in ("front", "both"):
            y = 10
            limit_y = mid_y - 6 if side == "both" else page_h - 6
            for field in info_fields:
                if not field.get("show"):
                    continue
                key = str(field.get("key") or "")
                if key == "barcode" or (side == "both" and key == "certNo"):
                    continue
                label = str(field.get("label") or key)
                value = str(data.get(key) or "").strip()
                if not value or value == "—":
                    continue
                size = max(int(field.get("size") or 10), 16)
                font = _create_font(size)
                hdc.SelectObject(font)
                text = f"{label} {value}" if label else value
                hdc.TextOut(6, y, text)
                y += size + 8
                if y >= limit_y:
                    break

        if side in ("back", "both"):
            zone_top = mid_y + 6 if side == "both" else 6
            zone_h = page_h - zone_top - 6 if side == "both" else page_h - 12
            code = str(data.get("certNo") or "").strip().upper()
            if code:
                img = _barcode_raster(code, page_w - 12, zone_h)
                bh = img.height if img is not None else 24
                bx = 6
                by = zone_top + max(0, (zone_h - bh) // 2)
                _draw_barcode(hdc, code, bx, by, page_w - 12, zone_h)

        hdc.EndPage()
        hdc.EndDoc()
    finally:
        hdc.DeleteDC()
