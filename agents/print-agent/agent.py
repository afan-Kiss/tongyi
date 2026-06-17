"""标签打印 Agent — 璞趣 PUQU（GDI 位图 + TSPL RAW 双模式）。"""
from __future__ import annotations

import base64
import io
import logging
import os
import time
from typing import Any

from flask import Flask, jsonify, request

from label_gdi import print_jewelry_tag_gdi
from puqu_client import list_printers as pqapi_list_printers
from puqu_client import pqapi_available, print_jewelry_tag_pqapi
from tspl_aq00 import AQ00_PRESET, build_bracelet_tag_tspl

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)


def _default_printer_name() -> str:
    return os.environ.get("PRINTER_NAME", "").strip()


def _pick_puqu_printer() -> str:
    try:
        import win32print
    except ImportError:
        return _default_printer_name()

    flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
    names = [p[2] for p in win32print.EnumPrinters(flags)]
    preferred = _default_printer_name()
    if preferred and preferred in names:
        return preferred
    for name in names:
        upper = name.upper()
        if any(token in upper for token in ("AQ00", "PUQU", "璞趣", "Q00")):
            return name
    try:
        return win32print.GetDefaultPrinter()
    except Exception:
        return names[0] if names else ""


def _printer_driver_info(printer_name: str) -> dict[str, Any]:
    import win32print

    handle = win32print.OpenPrinter(printer_name)
    try:
        info = win32print.GetPrinter(handle, 2)
        driver_name = str(info.get("pDriverName") or "")
        driver_path = ""
        driver_version = 0
        for driver in win32print.EnumPrinterDrivers(None, None, 2):
            if driver.get("Name") == driver_name:
                driver_path = str(driver.get("DriverPath") or "")
                driver_version = int(driver.get("Version") or 0)
                break
        return {
            "driverName": driver_name,
            "driverPath": driver_path,
            "driverVersion": driver_version,
            "portName": str(info.get("pPortName") or ""),
        }
    finally:
        win32print.ClosePrinter(handle)


def _uses_gdi_driver(printer_name: str) -> bool:
    """UNIDRV/GPD 驱动无法透传 TSPL，必须走 GDI 位图。"""
    info = _printer_driver_info(printer_name)
    path = info["driverPath"].upper()
    name = info["driverName"].upper()
    if "UNIDRV" in path or ".GPD" in path.upper():
        return True
    if "PUQU" in name and info["driverVersion"] == 3:
        return True
    return os.environ.get("PRINT_MODE", "").strip().lower() == "gdi"


def _send_raw_tspl(printer_name: str, tspl: str) -> None:
    import win32print

    info = _printer_driver_info(printer_name)
    raw_type = "XPS_PASS" if info["driverVersion"] == 4 else "RAW"
    payload = tspl.encode("gb18030", errors="replace")
    handle = win32print.OpenPrinter(printer_name)
    try:
        win32print.StartDocPrinter(handle, 1, ("jade-bracelet-tag", None, raw_type))
        try:
            win32print.StartPagePrinter(handle)
            win32print.WritePrinter(handle, payload)
            win32print.EndPagePrinter(handle)
        finally:
            win32print.EndDocPrinter(handle)
    finally:
        win32print.ClosePrinter(handle)


def _make_label_devmode(printer_name: str, width_mm: float, height_mm: float):
    import win32con
    import win32print

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


def _print_bitmap(printer_name: str, image, *, width_mm: float = 25, height_mm: float = 70) -> None:
    import win32con
    import win32gui
    import win32ui
    from PIL import Image, ImageWin

    gray = image.convert("L")
    image = gray.point(lambda p: 0 if p < 240 else 255, mode="1").convert("RGB")

    devmode = _make_label_devmode(printer_name, width_mm, height_mm)
    hdc = win32ui.CreateDC()
    hdc.CreatePrinterDC(printer_name)
    try:
        win32gui.ResetDC(hdc.GetHandleOutput(), devmode)
        hdc.SetMapMode(win32con.MM_TEXT)

        page_w = hdc.GetDeviceCaps(110) or image.width
        page_h = hdc.GetDeviceCaps(111) or image.height
        if image.size != (page_w, page_h):
            image = image.resize((page_w, page_h), Image.Resampling.LANCZOS)

        hdc.StartDoc("jade-jewelry-tag")
        hdc.StartPage()
        dib = ImageWin.Dib(image)
        dib.draw(hdc.GetHandleOutput(), (0, 0, page_w, page_h))
        hdc.EndPage()
        hdc.EndDoc()
        logger.info("GDI bitmap %dx%d paper %.0fx%.0fmm on %s", page_w, page_h, width_mm, height_mm, printer_name)
    finally:
        hdc.DeleteDC()


DPI_FALLBACK = 203


def _bracelet_data(bracelet: dict[str, Any]) -> dict[str, Any]:
    detail = bracelet.get("detail") or {}
    return {
        "certNo": bracelet.get("certNo") or "",
        "title": bracelet.get("title") or bracelet.get("category") or "天然和田玉手镯",
        "category": bracelet.get("category") or bracelet.get("title") or "天然和田玉手镯",
        "ringSize": bracelet.get("ringSize") or "",
        "weightGram": detail.get("weightGram") or "",
        "price": bracelet.get("actualPrice") or bracelet.get("cost") or "",
        "batch": bracelet.get("batch") or "",
        "cost": bracelet.get("cost") or "",
        "remark": bracelet.get("remark") or "",
    }


def _template_offsets(template: dict[str, Any]) -> dict[str, float]:
    return {
        "top": float(template.get("offsetTopMm") or 0),
        "bottom": float(template.get("offsetBottomMm") or 0),
        "left": float(template.get("offsetLeftMm") or 0),
        "right": float(template.get("offsetRightMm") or 0),
    }


@app.get("/health")
def health():
    printer = _pick_puqu_printer()
    mode = "gdi"
    driver = None
    pqapi = pqapi_available()
    if printer:
        try:
            driver = _printer_driver_info(printer)
            if pqapi:
                mode = "pqapi"
            elif _uses_gdi_driver(printer):
                mode = "gdi"
            else:
                mode = "tspl"
        except Exception:
            pass
    return jsonify({
        "ok": True,
        "message": "print-agent ready",
        "preset": AQ00_PRESET,
        "printer": printer or None,
        "printMode": mode,
        "pqapi": pqapi,
        "pqapiUrl": os.environ.get("PUQU_PQAPI_URL", "http://127.0.0.1:6780/pqapi"),
        "driver": driver,
    })


@app.get("/printers")
def list_printers():
    try:
        import win32print

        flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
        names = [p[2] for p in win32print.EnumPrinters(flags)]
        recommended = _pick_puqu_printer()
        mode = "gdi" if recommended and _uses_gdi_driver(recommended) else "tspl"
        return jsonify({
            "ok": True,
            "printers": names,
            "recommended": recommended,
            "printMode": mode,
            "preset": AQ00_PRESET,
        })
    except Exception as e:
        return jsonify({"ok": False, "message": str(e)}), 500


@app.get("/preset/aq00")
def preset_aq00():
    return jsonify({"ok": True, "data": AQ00_PRESET})


@app.post("/print/bracelet-tag")
def print_bracelet_tag():
    data: dict[str, Any] = request.get_json(force=True) or {}
    bracelet = data.get("bracelet") or {}
    template = data.get("template") or {}
    side = str(data.get("side") or "both").lower()
    printer_name = str(data.get("printerName") or "").strip() or _pick_puqu_printer()

    if side not in ("front", "back", "both"):
        return jsonify({"ok": False, "message": "side 只能是 front / back / both"}), 400
    if not bracelet.get("certNo"):
        return jsonify({"ok": False, "message": "缺少 bracelet.certNo"}), 400
    if not printer_name:
        return jsonify({"ok": False, "message": "未找到打印机，请安装璞趣驱动或设置 PRINTER_NAME"}), 400

    try:
        from label_format import DEFAULT_LABEL_LINES

        lines = template.get("lines") or DEFAULT_LABEL_LINES
        width_mm = float(template.get("widthMm") or 25.0)
        height_mm = float(template.get("heightMm") or 70.0)
        offsets = _template_offsets(template)
        compact_feed = bool(template.get("compactFeed"))
        fields = template.get("fields")
        payload = _bracelet_data(bracelet)
        pqapi = pqapi_available()
        print_meta: dict[str, Any] = {}

        barcode_fmt = next(
            (str(l.get("format") or "") for l in lines if l.get("kind") == "barcode"),
            "",
        )
        logger.info(
            "print template: %d lines, barcode=%r, pqapi=%s",
            len(lines),
            barcode_fmt[:40],
            pqapi,
        )

        if pqapi:
            print_meta = print_jewelry_tag_pqapi(
                printer_name,
                payload,
                side=side,
                fields=fields,
                lines=lines,
                offsets=offsets,
                width_mm=width_mm,
                height_mm=height_mm,
                compact_feed=compact_feed,
            )
            logger.info(
                "PQAPI PrintImage once on %s, image %sx%s px (%.1fx%.1f mm), compact=%s",
                printer_name,
                print_meta.get("pixels", ("?", "?"))[0],
                print_meta.get("pixels", ("?", "?"))[1],
                print_meta.get("widthMm"),
                print_meta.get("heightMm"),
                compact_feed,
            )
            mode_label = "璞趣PQAPI"
        elif _uses_gdi_driver(printer_name):
            print_jewelry_tag_gdi(
                printer_name,
                payload,
                side=side,
                width_mm=width_mm,
                height_mm=height_mm,
                fields=fields,
            )
            mode_label = "GDI"
        else:
            jobs = build_bracelet_tag_tspl(bracelet, side=side, template=template)
            for idx, (label, tspl) in enumerate(jobs):
                if idx > 0:
                    time.sleep(1.2)
                _send_raw_tspl(printer_name, tspl)
                logger.info("TSPL %s on %s", label, printer_name)
            mode_label = "TSPL"

        if side == "both":
            msg = f"已打印 25×70 珠宝吊牌（{mode_label}，{printer_name}）"
            if print_meta:
                msg += f"，图像 {print_meta.get('widthMm')}×{print_meta.get('heightMm')}mm"
        elif side == "front":
            msg = f"已打印信息区（{mode_label}，{printer_name}）"
        else:
            msg = f"已打印条码区（{mode_label}，{printer_name}）"
        return jsonify({
            "ok": True,
            "message": msg,
            "printer": printer_name,
            "printMode": "pqapi" if pqapi else ("gdi" if _uses_gdi_driver(printer_name) else "tspl"),
            "preset": AQ00_PRESET,
        })
    except ImportError as e:
        return jsonify({"ok": False, "message": f"缺少依赖: {e}。请 pip install pywin32 pillow python-barcode"}), 500
    except Exception as e:
        logger.exception("bracelet tag print failed")
        return jsonify({"ok": False, "message": str(e)}), 500


@app.post("/print/label")
def print_label():
    """兼容旧接口：位图打印。"""
    data = request.get_json(force=True) or {}
    printer_name = data.get("printerName", "") or _pick_puqu_printer()
    image_b64 = data.get("imageBase64", "")

    if not image_b64:
        return jsonify({"ok": False, "message": "缺少 imageBase64"}), 400

    try:
        from PIL import Image

        img_bytes = base64.b64decode(image_b64)
        img = Image.open(io.BytesIO(img_bytes))
        _print_bitmap(printer_name, img, width_mm=25, height_mm=70)
        return jsonify({"ok": True, "message": "已发送到打印机"})
    except ImportError as e:
        return jsonify({"ok": False, "message": f"缺少依赖: {e}。请 pip install pillow pywin32"}), 500
    except Exception as e:
        logger.exception("print failed")
        return jsonify({"ok": False, "message": str(e)}), 500


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PRINT_AGENT_PORT", "4729")), debug=False)
