"""璞趣 PUQU 标签机 TSPL 指令生成。

珠宝吊牌「竖版 25×70」：纸张宽 25mm、长 70mm，沿走纸方向上下两区（对折后左右并排）。
"""
from __future__ import annotations

import re
from typing import Any

# 竖版 25×70：打印头方向宽 25mm，走纸长度 70mm
DEFAULT_WIDTH_MM = 25
DEFAULT_HEIGHT_MM = 70
DEFAULT_GAP_MM = 2

# 上区信息 / 下区条码（沿 70mm 走纸方向，单位 mm）
INFO_PANEL_X_MM = 2
INFO_PANEL_Y_MM = 2
BARCODE_PANEL_X_MM = 2
BARCODE_PANEL_Y_MM = 38
INFO_LINE_H_DOTS = 22

AQ00_PRESET = {
    "model": "PUQU_AQ00",
    "layout": "jewelry_tag_25x70",
    "widthMm": DEFAULT_WIDTH_MM,
    "heightMm": DEFAULT_HEIGHT_MM,
    "gapMm": DEFAULT_GAP_MM,
    "dpi": 203,
    "dotsPerMm": 8,
    "maxWidthDots": 384,
    "protocol": "TSPL",
}


def _escape_tspl_text(text: str) -> str:
    return str(text or "").replace('"', "'").replace("\r", " ").replace("\n", " ").strip()


def _line(text: str) -> str:
    return text.rstrip() + "\r\n"


def _dots(mm: float) -> int:
    return max(0, int(round(mm * AQ00_PRESET["dotsPerMm"])))


def _page_setup(width_mm: float, height_mm: float, gap_mm: float) -> str:
    return "".join(
        [
            _line(f"SIZE {width_mm:g} mm,{height_mm:g} mm"),
            _line(f"GAP {gap_mm:g} mm,0 mm"),
            _line("DIRECTION 1,0"),
            _line("REFERENCE 0,0"),
            _line("CODEPAGE 936"),
            _line("DENSITY 9"),
            _line("SPEED 4"),
            _line("CLS"),
        ]
    )


def _field_lines(
    data: dict[str, Any],
    fields: list[dict[str, Any]],
    *,
    start_x: int,
    start_y: int,
    line_h: int = INFO_LINE_H_DOTS,
) -> str:
    chunks: list[str] = []
    x = start_x
    y = start_y

    for field in fields:
        if not field.get("show"):
            continue
        key = str(field.get("key") or "")
        if key == "barcode":
            continue
        label = str(field.get("label") or key)
        value = _escape_tspl_text(str(data.get(key) or "—"))
        if not value or value == "—":
            continue
        text = f"{label} {value}" if label else value
        chunks.append(_line(f'TEXT {x},{y},"TSS24.BF2",0,1,1,"{text}"'))
        y += line_h
    return "".join(chunks)


def _barcode_line(cert_no: str) -> str:
    code = _escape_tspl_text(cert_no.upper())
    if not code:
        raise ValueError("编号为空，无法生成条码")
    if not re.match(r"^[A-Z0-9\-]+$", code):
        raise ValueError(f"编号 {code} 含非法字符，条码仅支持字母数字")
    x = _dots(BARCODE_PANEL_X_MM)
    y = _dots(BARCODE_PANEL_Y_MM)
    return _line(f'BARCODE {x},{y},"128",40,1,0,2,2,"{code}"')


def build_jewelry_tag_tspl(
    data: dict[str, Any],
    *,
    side: str = "both",
    width_mm: float = DEFAULT_WIDTH_MM,
    height_mm: float = DEFAULT_HEIGHT_MM,
    gap_mm: float = DEFAULT_GAP_MM,
    fields: list[dict[str, Any]] | None = None,
) -> str:
    """一张 25×70 吊牌：上区条码 + 下区信息。"""
    info_fields = fields or [
        {"key": "certNo", "label": "编号", "show": True},
        {"key": "ringSize", "label": "圈口", "show": True},
        {"key": "weightGram", "label": "克重", "show": True},
        {"key": "price", "label": "价格", "show": True},
    ]
    body = _page_setup(width_mm, height_mm, gap_mm)
    if side in ("front", "both"):
        body += _field_lines(
            data,
            info_fields,
            start_x=_dots(INFO_PANEL_X_MM),
            start_y=_dots(INFO_PANEL_Y_MM),
            line_h=INFO_LINE_H_DOTS,
        )
    if side in ("back", "both"):
        body += _barcode_line(data.get("certNo") or "")
    body += _line("PRINT 1,1")
    return body


def build_front_tspl(
    data: dict[str, Any],
    *,
    width_mm: float = DEFAULT_WIDTH_MM,
    height_mm: float = DEFAULT_HEIGHT_MM,
    gap_mm: float = DEFAULT_GAP_MM,
    fields: list[dict[str, Any]] | None = None,
) -> str:
    return build_jewelry_tag_tspl(
        data, side="front", width_mm=width_mm, height_mm=height_mm, gap_mm=gap_mm, fields=fields
    )


def build_back_tspl(
    cert_no: str,
    *,
    width_mm: float = DEFAULT_WIDTH_MM,
    height_mm: float = DEFAULT_HEIGHT_MM,
    gap_mm: float = DEFAULT_GAP_MM,
) -> str:
    return build_jewelry_tag_tspl(
        {"certNo": cert_no},
        side="back",
        width_mm=width_mm,
        height_mm=height_mm,
        gap_mm=gap_mm,
    )


def build_bracelet_tag_tspl(
    bracelet: dict[str, Any],
    *,
    side: str = "both",
    template: dict[str, Any] | None = None,
) -> list[tuple[str, str]]:
    tpl = template or {}
    width_mm = float(tpl.get("widthMm") or DEFAULT_WIDTH_MM)
    height_mm = float(tpl.get("heightMm") or DEFAULT_HEIGHT_MM)
    gap_mm = float(tpl.get("gapMm") or DEFAULT_GAP_MM)
    fields = tpl.get("fields")

    # 兼容旧版误填的 70×25
    if width_mm >= 60 and height_mm <= 30:
        width_mm, height_mm = height_mm, width_mm

    detail = bracelet.get("detail") or {}
    data = {
        "certNo": bracelet.get("certNo") or "",
        "ringSize": bracelet.get("ringSize") or "",
        "weightGram": detail.get("weightGram") or "",
        "price": bracelet.get("actualPrice") or bracelet.get("cost") or "",
        "batch": bracelet.get("batch") or "",
        "category": bracelet.get("category") or "",
        "cost": bracelet.get("cost") or "",
    }

    tspl = build_jewelry_tag_tspl(
        data,
        side=side,
        width_mm=width_mm,
        height_mm=height_mm,
        gap_mm=gap_mm,
        fields=fields,
    )
    label = {"both": "jewelry-tag", "front": "info-panel", "back": "barcode-panel"}.get(side, "jewelry-tag")
    return [(label, tspl)]
