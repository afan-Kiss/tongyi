"""渲染 25×70mm 竖版珠宝吊牌 PNG（203dpi）。"""

from __future__ import annotations



import os

from io import BytesIO

from typing import Any



from PIL import Image, ImageDraw, ImageFont



from label_format import LABEL_CANVAS_REF_H, build_label_data, resolve_lines



DPI = 203

OFFICIAL_BARCODE_HEIGHT = 62
BARCODE_MAX_WIDTH = 196
BARCODE_QUIET_MODULES = 6
BARCODE_SIDE_MARGIN = 4



FONT_REGISTRY: dict[str, tuple[str, str]] = {

    "msyh": (r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\msyhbd.ttc"),

    "simhei": (r"C:\Windows\Fonts\simhei.ttf", r"C:\Windows\Fonts\simhei.ttf"),

    "simsun": (r"C:\Windows\Fonts\simsun.ttc", r"C:\Windows\Fonts\simsunb.ttf"),

    "simkai": (r"C:\Windows\Fonts\simkai.ttf", r"C:\Windows\Fonts\simkai.ttf"),

    "fangsong": (r"C:\Windows\Fonts\simfang.ttf", r"C:\Windows\Fonts\simfang.ttf"),

}





def _mm_to_px(mm: float) -> int:

    return max(1, int(round(float(mm) * DPI / 25.4)))





def _canvas_size(width_mm: float, height_mm: float) -> tuple[int, int]:
    # 与璞趣官方 PrintImage 一致：200×560（203dpi 下 25×70mm）
    if width_mm <= 30 and height_mm >= 50:
        return 200, LABEL_CANVAS_REF_H
    return _mm_to_px(width_mm), _mm_to_px(height_mm)





def _resolve_offsets(offsets: dict[str, Any] | None) -> tuple[int, int]:

    if not offsets:

        return 0, 0

    left = _mm_to_px(float(offsets.get("left") or offsets.get("offsetLeftMm") or 0))

    right = _mm_to_px(float(offsets.get("right") or offsets.get("offsetRightMm") or 0))

    top = _mm_to_px(float(offsets.get("top") or offsets.get("offsetTopMm") or 0))

    bottom = _mm_to_px(float(offsets.get("bottom") or offsets.get("offsetBottomMm") or 0))

    return left - right, top - bottom





def _font(

    size: int,

    *,

    font_family: str = "simhei",

    bold: bool = False,

) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:

    regular, bold_path = FONT_REGISTRY.get(font_family, FONT_REGISTRY["simhei"])

    path = bold_path if bold else regular

    if bold and not os.path.isfile(path):

        path = regular

    if os.path.isfile(path):

        try:

            return ImageFont.truetype(path, size, index=0)

        except OSError:

            pass

    if os.path.isfile(regular):

        try:

            return ImageFont.truetype(regular, size, index=0)

        except OSError:

            pass

    return ImageFont.load_default()





def _text_width(draw: ImageDraw.ImageDraw, text: str, font) -> int:

    box = draw.textbbox((0, 0), text, font=font)

    return box[2] - box[0]





def _text_height(draw: ImageDraw.ImageDraw, text: str, font) -> int:

    box = draw.textbbox((0, 0), text, font=font)

    return box[3] - box[1]





def _draw_centered(

    draw: ImageDraw.ImageDraw,

    y: int,

    text: str,

    font,

    canvas_w: int,

    dx: int = 0,

    offset_x: int = 0,
    bold: bool = False,
) -> int:

    box = draw.textbbox((0, 0), text, font=font)

    text_w = box[2] - box[0]

    text_h = box[3] - box[1]

    x = max(4, (canvas_w - text_w) // 2 + dx + offset_x)

    stroke = 1 if bold else 0
    draw.text(
        (x, y - box[1]),
        text,
        fill="black",
        font=font,
        stroke_width=stroke,
        stroke_fill="black",
    )

    return y + text_h


def _draw_left(
    draw: ImageDraw.ImageDraw,
    y: int,
    text: str,
    font,
    canvas_w: int,
    dx: int = 0,
    margin_x: int = 8,
    offset_x: int = 0,
    bold: bool = False,
) -> int:
    box = draw.textbbox((0, 0), text, font=font)
    text_h = box[3] - box[1]
    x = max(4, margin_x + dx + offset_x)
    stroke = 1 if bold else 0
    draw.text(
        (x, y - box[1]),
        text,
        fill="black",
        font=font,
        stroke_width=stroke,
        stroke_fill="black",
    )
    return y + text_h


def _line_text_align(line: dict[str, Any]) -> str:
    align = str(line.get("textAlign") or "").lower()
    if align in ("left", "center"):
        return align
    if line.get("id") in ("cert", "ring", "price"):
        return "center"
    return "center"


def _line_offset_x(line: dict[str, Any]) -> int:
    return int(line.get("offsetXPx") or 0)


def _line_offset_y(line: dict[str, Any]) -> int:
    return int(line.get("offsetYPx") or 0)





def _scale_y_px(y_px: int | float, canvas_h: int, dy: int) -> int:
    scale = canvas_h / LABEL_CANVAS_REF_H
    return int(round(float(y_px) * scale)) + dy


def _binarize_barcode(img: Image.Image) -> Image.Image:
    """热敏/标签机需要纯黑纯白，禁止抗锯齿灰边。"""
    gray = img.convert("L")
    return gray.point(lambda p: 0 if p < 160 else 255, mode="1").convert("RGB")


def _barcode_for_label(
    code: str,
    *,
    max_width: int = BARCODE_MAX_WIDTH,
    target_height: int = OFFICIAL_BARCODE_HEIGHT,
) -> Image.Image:
    """203dpi Code128：在标签宽度内取最大条宽（最易扫描），纯黑白无插值。"""
    import barcode
    from barcode.writer import ImageWriter

    text = (code or "").strip()
    if not text:
        raise ValueError("empty barcode")

    module_height = round(4.5 * target_height / 51, 2)
    best: Image.Image | None = None
    best_mw = 0.0

    mw = 0.30
    while mw >= 0.14:
        quiet_zone = mw * BARCODE_QUIET_MODULES
        try:
            buf = BytesIO()
            bc = barcode.get("code128", text, writer=ImageWriter())
            bc.write(
                buf,
                options={
                    "module_width": mw,
                    "module_height": module_height,
                    "font_size": 0,
                    "text_distance": 0,
                    "quiet_zone": quiet_zone,
                    "write_text": False,
                    "dpi": DPI,
                },
            )
            img = Image.open(buf)
        except ValueError:
            mw = round(mw - 0.01, 2)
            continue
        if img.width <= max_width and mw >= best_mw:
            best = img
            best_mw = mw
        mw = round(mw - 0.01, 2)

    if best is None:
        buf = BytesIO()
        bc = barcode.get("code128", text, writer=ImageWriter())
        bc.write(
            buf,
            options={
                "module_width": 0.2,
                "module_height": module_height,
                "font_size": 0,
                "text_distance": 0,
                "quiet_zone": 0.2 * BARCODE_QUIET_MODULES,
                "write_text": False,
                "dpi": DPI,
            },
        )
        best = Image.open(buf)
        if best.width > max_width:
            factor = max(2, (best.width + max_width - 1) // max_width)
            best = best.resize(
                (max(1, best.width // factor), best.height),
                Image.Resampling.NEAREST,
            )

    best = _binarize_barcode(best)
    if best.height < target_height:
        padded = Image.new("RGB", (best.width, target_height), (255, 255, 255))
        padded.paste(best, (0, 0))
        best = padded
    elif best.height > target_height:
        best = best.crop((0, 0, best.width, target_height))

    return best





def _crop_trailing_blank(img: Image.Image, *, pad_px: int = 16) -> Image.Image:

    """裁掉内容下方大块留白，避免驱动按 ~25mm 步进时一次走纸多张。"""

    gray = img.convert("L")

    w, h = gray.size

    pixels = gray.load()

    last_content = -1

    for y in range(h):

        if any(pixels[x, y] < 250 for x in range(w)):

            last_content = y

    if last_content < 0:

        return img

    blank_px = h - last_content - 1

    if blank_px < 30:

        return img

    new_h = min(h, last_content + 1 + pad_px)

    return img.crop((0, 0, w, new_h))





def render_jewelry_tag_png(

    data: dict[str, Any],

    *,

    side: str = "both",

    fields: list[dict[str, Any]] | None = None,

    lines: list[dict[str, Any]] | None = None,

    offsets: dict[str, Any] | None = None,

    width_mm: float = 25,

    height_mm: float = 70,

    compact_feed: bool = False,

) -> Image.Image:

    """按模板 lines 顺序渲染条码与文字。"""

    if width_mm >= 60 and height_mm <= 30:

        width_mm, height_mm = height_mm, width_mm

    if height_mm < 50:

        height_mm = 70

        width_mm = 25



    canvas_w, canvas_h = _canvas_size(width_mm, height_mm)

    img = Image.new("RGBA", (canvas_w, canvas_h), (255, 255, 255, 255))

    draw = ImageDraw.Draw(img)

    dx, dy = _resolve_offsets(offsets)

    label_data = build_label_data(data)

    template_lines = resolve_lines(lines, fields)



    y = 8 + dy
    flow_bottom = y

    fixed_lines = [l for l in template_lines if l.get("show", True) and l.get("yPx") is not None]
    flow_lines = [l for l in template_lines if l.get("show", True) and l.get("yPx") is None]

    def _render_barcode(line: dict[str, Any], y_pos: int) -> int:
        barcode_data = str(line.get("format") or "").strip()
        if not barcode_data:
            return y_pos
        size = max(int(line.get("size") or 12), 10)
        bold = bool(line.get("bold", True))
        font_family = str(line.get("fontFamily") or "simhei")
        side_margin = BARCODE_SIDE_MARGIN
        max_w = max(40, canvas_w - side_margin * 2)
        target_h = int(line.get("barcodeHeight") or OFFICIAL_BARCODE_HEIGHT)
        bc = _barcode_for_label(barcode_data, max_width=max_w, target_height=target_h)
        stretch = float(line.get("barcodeStretchX") or 1)
        if stretch > 1.01:
            new_w = min(int(bc.width * stretch), max_w)
            if new_w > bc.width:
                bc = bc.resize((new_w, bc.height), Image.Resampling.NEAREST)
                bc = _binarize_barcode(bc)
        paste_x = max(side_margin, (canvas_w - bc.width) // 2 + dx)
        if line.get("xPx") is not None:
            paste_x = max(side_margin, int(line.get("xPx") or side_margin) + dx)
        img.paste(bc, (paste_x, y_pos + _line_offset_y(line)))
        cap_gap = max(0, int(line.get("captionGapPx") or 1))
        cap_y = y_pos + bc.height + cap_gap
        if barcode_data:
            cap_y = _draw_centered(
                draw,
                cap_y,
                barcode_data,
                _font(size, font_family=font_family, bold=bold),
                canvas_w,
                dx,
                _line_offset_x(line),
                bold=bold,
            )
        return cap_y

    def _render_text(line: dict[str, Any], y_pos: int) -> int:
        size = max(int(line.get("size") or 14), 10)
        bold = bool(line.get("bold", True))
        font_family = str(line.get("fontFamily") or "simhei")
        text = str(line.get("format") or "").strip()
        if not text:
            return y_pos
        font = _font(size, font_family=font_family, bold=bold)
        y = y_pos + _line_offset_y(line)
        ox = _line_offset_x(line)
        if _line_text_align(line) == "left":
            return _draw_left(draw, y, text, font, canvas_w, dx, margin_x=8, offset_x=ox, bold=bold)
        return _draw_centered(draw, y, text, font, canvas_w, dx, ox, bold=bold)

    for line in fixed_lines:
        kind = str(line.get("kind") or "text")
        y_pos = _scale_y_px(line["yPx"], canvas_h, dy)

        if kind == "barcode":
            if side not in ("back", "both"):
                continue
            _render_barcode(line, y_pos)
            continue

        if side not in ("front", "both"):
            continue
        _render_text(line, y_pos)

    for line in flow_lines:
        kind = str(line.get("kind") or "text")
        size = max(int(line.get("size") or 14), 10)
        bold = bool(line.get("bold"))
        font_family = str(line.get("fontFamily") or "simhei")

        if kind == "barcode":
            if side not in ("back", "both"):
                continue
            flow_bottom = _render_barcode(line, flow_bottom) + 10
            continue

        if side not in ("front", "both"):
            continue

        text = str(line.get("format") or "").strip()
        if not text:
            continue
        font = _font(size, font_family=font_family, bold=bold)
        if _line_text_align(line) == "left":
            flow_bottom = _draw_left(draw, flow_bottom, text, font, canvas_w, dx, margin_x=8, bold=bold) + 6
        else:
            flow_bottom = _draw_centered(draw, flow_bottom, text, font, canvas_w, dx, bold=bold) + 6



    rgb = img.convert("RGB")
    return rgb





def png_to_data_url(image: Image.Image) -> str:

    import base64



    buf = BytesIO()
    image.save(buf, format="PNG", dpi=(DPI, DPI))
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


