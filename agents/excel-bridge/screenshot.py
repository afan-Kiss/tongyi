"""Excel 行区域截图 — CopyPicture + 剪贴板抓取。"""
from __future__ import annotations

import base64
import io
import logging
import time
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

COL_HEADERS = {
    1: "到货日期", 2: "批次", 3: "数量", 4: "编号", 5: "品类", 6: "圈口", 7: "成本",
    8: "备注", 9: "订单号", 10: "退货日期", 11: "售出日期", 12: "实际售价",
    13: "销售人员", 14: "销售渠道",
}


def _cell_str(v: Any) -> str:
    if v is None:
        return ""
    return str(v).strip()


def capture_scroll_column(app: Any) -> int:
    try:
        win = app.ActiveWindow
        if win is not None:
            return max(1, int(win.ScrollColumn))
    except Exception:
        pass
    return 1


def restore_excel_view(app: Any, ws: Any, row: int, old_scroll_column: Optional[int] = None) -> None:
    scroll = old_scroll_column if old_scroll_column and old_scroll_column >= 1 else 1
    try:
        wb = ws.Parent
        wb.Activate()
        ws.Activate()
    except Exception:
        pass
    try:
        ws.Cells(row, 4).Select()
    except Exception:
        try:
            ws.Rows(row).Select()
        except Exception:
            pass
    try:
        win = app.ActiveWindow
        if win is not None:
            win.ScrollRow = max(1, row - 3)
            win.ScrollColumn = max(1, int(scroll))
    except Exception:
        pass


def read_row_verify(ws: Any, row: int, col_start: int = 1, col_end: int = 14) -> Dict[str, str]:
    result: Dict[str, str] = {}
    for col in range(col_start, col_end + 1):
        label = COL_HEADERS.get(col, f"列{col}")
        try:
            result[label] = _cell_str(ws.Cells(row, col).Value)
        except Exception:
            result[label] = ""
    return result


def capture_row_snapshot(
    ws: Any,
    app: Any,
    row: int,
    *,
    col_start: int = 1,
    col_end: int = 14,
    include_header: bool = True,
) -> Tuple[Optional[str], Dict[str, str]]:
    """
    定位到目标行，复制为图片，返回 (base64_png, 行数据校验字典)。
    include_header=True 时截图含表头行，便于对照确认。
    """
    old_scroll = capture_scroll_column(app)
    restore_excel_view(app, ws, row, old_scroll)
    time.sleep(0.12)

    try:
        app.Visible = True
    except Exception:
        pass

    start_row = row - 1 if include_header and row > 1 else row
    rng = ws.Range(ws.Cells(start_row, col_start), ws.Cells(row, col_end))
    try:
        rng.CopyPicture(Appearance=1, Format=2)
    except Exception as e:
        logger.warning("CopyPicture failed: %s", e)
        return None, read_row_verify(ws, row, col_start, col_end)

    time.sleep(0.28)

    snapshot_b64: Optional[str] = None
    try:
        from PIL import ImageGrab

        img = ImageGrab.grabclipboard()
        if img is not None:
            buf = io.BytesIO()
            rgb = img.convert("RGB")
            rgb.save(buf, format="PNG", optimize=True)
            snapshot_b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    except Exception as e:
        logger.warning("clipboard grab failed: %s", e)

    verify = read_row_verify(ws, row, col_start, col_end)
    restore_excel_view(app, ws, row, old_scroll)
    return snapshot_b64, verify
