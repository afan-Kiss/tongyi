"""Excel COM 桥接服务 — 常驻后台，出入库同步 + 截图快照回传。"""
from __future__ import annotations

import datetime
import logging
import os
import re
import threading
from typing import Any, Callable, Optional, TypeVar

from flask import Flask, jsonify, request

from screenshot import capture_row_snapshot, read_row_verify, restore_excel_view

T = TypeVar("T")

_com_lock = threading.RLock()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [excel-bridge] %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

COL_ARRIVAL_DATE = 1
COL_BATCH = 2
COL_QTY = 3
COL_CERT_NO = 4
COL_CATEGORY = 5
COL_RING_SIZE = 6
COL_COST = 7
COL_REMARK = 8
COL_ORDER_NO = 9
COL_RETURN_DATE = 10
COL_SOLD_DATE = 11
COL_ACTUAL_PRICE = 12
COL_SALES_PERSON = 13
COL_SALES_CHANNEL = 14
DATA_START_ROW = 2

CERT_PREFIXES = (
    "DA", "DB", "DC", "DD", "DE", "DF", "DG", "DH", "DI", "DK", "DL", "DM", "DN", "DP", "DQ", "DR", "DW",
    "ZF", "ZQ", "F", "D",
)


def _default_digit_width(prefix: str) -> int:
    if prefix == "F":
        return 5
    if prefix in ("ZQ", "ZF"):
        return 4
    return 3


def _parse_cert_parts(cert_no: str) -> Optional[tuple[str, int, int]]:
    code = _cell_str(cert_no).upper()
    if not code:
        return None
    for prefix in CERT_PREFIXES:
        if not code.startswith(prefix):
            continue
        rest = code[len(prefix) :]
        if not rest.isdigit():
            continue
        return prefix, int(rest), len(rest)
    return None


def _max_cert_in_column(ws, prefix: str) -> tuple[int, int]:
    last_row = int(ws.Cells(ws.Rows.Count, COL_CERT_NO).End(-4162).Row)
    max_num = 0
    max_width = _default_digit_width(prefix)
    pattern = re.compile(rf"^{re.escape(prefix)}(\d+)$", re.I)
    for row in range(DATA_START_ROW, last_row + 1):
        val = _cell_str(ws.Cells(row, COL_CERT_NO).Value).upper()
        m = pattern.match(val)
        if not m:
            continue
        num = int(m.group(1))
        max_num = max(max_num, num)
        max_width = max(max_width, len(m.group(1)))
    return max_num, max_width


def _format_cert(prefix: str, num: int, width: int) -> str:
    w = max(width, _default_digit_width(prefix))
    return f"{prefix}{str(num).zfill(w)}"

_connector: Any = None
_bound_sheet: str = ""

# 编号索引（参考辅助出库软件 ReadWhitelistWorker：批量读 D 列）
_cert_index_entries: list[dict[str, Any]] = []
_cert_index_ready = False
_cert_index_loading = False
_cert_index_built_at: Optional[str] = None
_cert_index_workbook: str = ""


def _today() -> str:
    return datetime.datetime.now().strftime("%Y-%m-%d")


def _cell_str(v: Any) -> str:
    if v is None:
        return ""
    return str(v).strip()


def _cert_matches_search_query(cert_no: str, query: str) -> bool:
    q = _cell_str(query).upper()
    cert = _cell_str(cert_no).upper()
    if not q or not cert.startswith(q):
        return False
    for prefix in CERT_PREFIXES:
        if len(prefix) <= len(q):
            continue
        if not prefix.startswith(q):
            continue
        if cert.startswith(prefix):
            return False
    return True


def _cert_matches_contains_search_query(cert_no: str, query: str) -> bool:
    q = _cell_str(query).upper()
    cert = _cell_str(cert_no).upper()
    if not q or q not in cert:
        return False
    if cert.startswith(q):
        return _cert_matches_search_query(cert, q)
    # 仅纯数字片段模糊匹配，避免 F000 命中 ZF00001
    if not q.isdigit():
        return False
    return True


_com_tls = threading.local()


def _ensure_com() -> None:
    import pythoncom

    if not getattr(_com_tls, "ready", False):
        pythoncom.CoInitializeEx(pythoncom.COINIT_APARTMENTTHREADED)
        _com_tls.ready = True


def _with_com(fn: Callable[[], T]) -> T:
    _ensure_com()
    with _com_lock:
        try:
            return fn()
        except Exception as e:
            err = str(e)
            if "-2147417842" in err or "已为另一线程整理" in err:
                _reset_connector()
                return fn()
            raise


def _get_connector_unlocked():
    global _connector
    if _connector is not None:
        return _connector
    import win32com.client  # type: ignore

    app_excel = win32com.client.GetActiveObject("Excel.Application")
    _connector = app_excel
    return _connector


def _reset_connector():
    global _connector
    _connector = None


def _get_ws_unlocked(sheet_name: Optional[str] = None):
    app_excel = _get_connector_unlocked()
    if sheet_name:
        return app_excel.Workbooks(app_excel.ActiveWorkbook.Name).Worksheets(sheet_name)
    return app_excel.ActiveWorkbook.ActiveSheet


def _get_ws(sheet_name: Optional[str] = None):
    return _with_com(lambda: _get_ws_unlocked(sheet_name))


def _get_connector():
    return _with_com(_get_connector_unlocked)


def _parse_qty(v: Any) -> int:
    if v is None or v == "":
        return 1
    try:
        return 0 if float(v) == 0 else 1
    except (TypeError, ValueError):
        return 0 if _cell_str(v) == "0" else 1


def _read_row_bracelet(ws, row: int, sheet_name: str) -> dict[str, Any]:
    return {
        "certNo": _cell_str(ws.Cells(row, COL_CERT_NO).Value).upper(),
        "arrivalDate": _cell_str(ws.Cells(row, COL_ARRIVAL_DATE).Value),
        "batch": _cell_str(ws.Cells(row, COL_BATCH).Value),
        "qty": _parse_qty(ws.Cells(row, COL_QTY).Value),
        "category": _cell_str(ws.Cells(row, COL_CATEGORY).Value),
        "ringSize": _cell_str(ws.Cells(row, COL_RING_SIZE).Value),
        "cost": _cell_str(ws.Cells(row, COL_COST).Value),
        "remark": _cell_str(ws.Cells(row, COL_REMARK).Value),
        "orderNo": _cell_str(ws.Cells(row, COL_ORDER_NO).Value),
        "returnDate": _cell_str(ws.Cells(row, COL_RETURN_DATE).Value),
        "soldDate": _cell_str(ws.Cells(row, COL_SOLD_DATE).Value),
        "actualPrice": _cell_str(ws.Cells(row, COL_ACTUAL_PRICE).Value),
        "salesPerson": _cell_str(ws.Cells(row, COL_SALES_PERSON).Value),
        "salesChannel": _cell_str(ws.Cells(row, COL_SALES_CHANNEL).Value),
        "excelRow": row,
        "excelSheet": sheet_name,
    }


def _iter_column_cells(values: Any) -> list[Any]:
    if values is None:
        return []
    if not isinstance(values, tuple):
        return [values]
    if len(values) > 0 and isinstance(values[0], tuple):
        return [row[0] if row else None for row in values]
    return list(values)


def _iter_row_tuples(values: Any) -> list[tuple[Any, ...]]:
    if values is None:
        return []
    if not isinstance(values, tuple):
        return [(values,)]
    if len(values) > 0 and isinstance(values[0], tuple):
        return list(values)
    return [(v,) for v in values]


def _row_tuple_to_index_entry(sheet_name: str, row_num: int, row: tuple[Any, ...]) -> Optional[dict[str, Any]]:
    cert = _cell_str(row[3] if len(row) > 3 else None).upper()
    if not cert:
        return None
    return {
        "certNo": cert,
        "sheet": sheet_name,
        "row": row_num,
        "arrivalDate": _cell_str(row[0] if len(row) > 0 else None),
        "batch": _cell_str(row[1] if len(row) > 1 else None),
        "qty": _parse_qty(row[2] if len(row) > 2 else None),
        "category": _cell_str(row[4] if len(row) > 4 else None),
        "ringSize": _cell_str(row[5] if len(row) > 5 else None),
        "cost": _cell_str(row[6] if len(row) > 6 else None),
        "remark": _cell_str(row[7] if len(row) > 7 else None),
        "orderNo": _cell_str(row[8] if len(row) > 8 else None),
        "returnDate": _cell_str(row[9] if len(row) > 9 else None),
        "soldDate": _cell_str(row[10] if len(row) > 10 else None),
        "actualPrice": _cell_str(row[11] if len(row) > 11 else None),
        "salesPerson": _cell_str(row[12] if len(row) > 12 else None),
        "salesChannel": _cell_str(row[13] if len(row) > 13 else None),
    }


def _build_cert_index_unlocked() -> dict[str, Any]:
    app_excel = _get_connector_unlocked()
    wb = app_excel.ActiveWorkbook
    if wb is None:
        return {"ok": False, "message": "请先打开 Excel 工作簿"}

    entries: list[dict[str, Any]] = []
    workbook_name = str(wb.Name)
    for ws in wb.Worksheets:
        sheet_name = str(ws.Name)
        last_row = int(ws.Cells(ws.Rows.Count, COL_CERT_NO).End(-4162).Row)
        if last_row < DATA_START_ROW:
            continue
        rng = ws.Range(
            ws.Cells(DATA_START_ROW, COL_ARRIVAL_DATE),
            ws.Cells(last_row, COL_SALES_CHANNEL),
        )
        rows = _iter_row_tuples(rng.Value)
        for i, row in enumerate(rows):
            item = _row_tuple_to_index_entry(sheet_name, DATA_START_ROW + i, row)
            if item:
                entries.append(item)

    return {
        "ok": True,
        "message": f"已建立编号索引 {len(entries)} 条",
        "count": len(entries),
        "workbook": workbook_name,
        "builtAt": datetime.datetime.now().isoformat(timespec="seconds"),
        "entries": entries,
    }


def _build_cert_index() -> dict[str, Any]:
    """扫描活动工作簿全部工作表，建立编号索引（只读）。"""
    global _cert_index_entries, _cert_index_ready, _cert_index_loading
    global _cert_index_built_at, _cert_index_workbook

    if _cert_index_loading:
        return {"ok": False, "message": "索引正在加载中", "loading": True}

    _cert_index_loading = True
    _cert_index_ready = False
    try:
        built = _with_com(_build_cert_index_unlocked)
        if not built.get("ok"):
            return built
        _cert_index_entries = built["entries"]
        _cert_index_ready = True
        _cert_index_built_at = built["builtAt"]
        _cert_index_workbook = built["workbook"]
        logger.info("编号索引已建立：%s 条（工作簿 %s）", len(_cert_index_entries), _cert_index_workbook)
        return built
    except Exception as e:
        logger.exception("cert index build failed")
        _reset_connector()
        _cert_index_entries = []
        _cert_index_ready = False
        return {"ok": False, "message": str(e)}
    finally:
        _cert_index_loading = False


def _search_cert_index(query: str, limit: int = 20) -> list[dict[str, Any]]:
    q = _cell_str(query).upper()
    if not q or not _cert_index_ready:
        return []
    prefix_hits: list[dict[str, Any]] = []
    contains_hits: list[dict[str, Any]] = []
    for item in _cert_index_entries:
        cert = str(item.get("certNo") or "")
        if _cert_matches_search_query(cert, q):
            prefix_hits.append(item)
            if len(prefix_hits) >= limit:
                return prefix_hits
        elif _cert_matches_contains_search_query(cert, q) and len(prefix_hits) + len(contains_hits) < limit:
            contains_hits.append(item)
        if len(prefix_hits) + len(contains_hits) >= limit:
            break
    return (prefix_hits + contains_hits)[:limit]


def _find_row_by_cert_unlocked(
    cert_no: str,
    sheet_name: Optional[str] = None,
    excel_row: Optional[int] = None,
) -> Optional[int]:
    if excel_row and excel_row >= DATA_START_ROW:
        return excel_row
    ws = _get_ws_unlocked(sheet_name)
    target = cert_no.strip().upper()
    last_row = int(ws.Cells(ws.Rows.Count, COL_CERT_NO).End(-4162).Row)
    for r in range(DATA_START_ROW, last_row + 1):
        if _cell_str(ws.Cells(r, COL_CERT_NO).Value).upper() == target:
            return r
    return None


def _find_row_by_cert(
    cert_no: str,
    sheet_name: Optional[str] = None,
    excel_row: Optional[int] = None,
) -> Optional[int]:
    return _with_com(lambda: _find_row_by_cert_unlocked(cert_no, sheet_name, excel_row))


def _sync_response(
    ok: bool,
    message: str,
    *,
    row: Optional[int] = None,
    sheet: str = "",
    snapshot_b64: Optional[str] = None,
    verify: Optional[dict] = None,
    status: int = 200,
):
    body = {
        "ok": ok,
        "message": message,
        "row": row,
        "sheet": sheet,
        "snapshotBase64": snapshot_b64,
        "verify": verify or {},
    }
    return jsonify(body), status


def _finish_sync(ws, app_excel, row: int, sheet_name: str, message: str):
    snapshot_b64, verify = capture_row_snapshot(ws, app_excel, row)
    if snapshot_b64:
        message = f"{message}（已生成 Excel 截图快照）"
    else:
        message = f"{message}（截图失败，请查看校验数据）"
    return _sync_response(
        True,
        message,
        row=row,
        sheet=sheet_name,
        snapshot_b64=snapshot_b64,
        verify=verify,
    )


@app.get("/health")
def health():
    try:
        app_excel = _get_connector()
        wb = app_excel.ActiveWorkbook
        bound = wb is not None
        sheet = str(app_excel.ActiveSheet.Name) if bound else ""
        return jsonify({
            "ok": True,
            "bound": bound,
            "workbook": str(wb.Name) if bound else "",
            "sheet": sheet,
            "message": "桥接服务运行中",
        })
    except Exception as e:
        _reset_connector()
        return jsonify({"ok": False, "bound": False, "message": str(e)})


@app.post("/bind")
def bind_workbook():
    global _bound_sheet
    try:
        app_excel = _get_connector()
        _bound_sheet = str(app_excel.ActiveSheet.Name)
        wb_name = str(app_excel.ActiveWorkbook.Name)
        return jsonify({"ok": True, "message": f"已绑定 {wb_name} / {_bound_sheet}"})
    except Exception as e:
        _reset_connector()
        return jsonify({"ok": False, "message": str(e)}), 400


@app.post("/sync/outbound")
def sync_outbound():
    data = request.get_json(force=True) or {}
    cert_no = _cell_str(data.get("certNo")).upper()
    sheet_name = data.get("excelSheet") or _bound_sheet or None
    try:
        row = _find_row_by_cert(cert_no, sheet_name, data.get("excelRow"))
        if not row:
            return _sync_response(False, f"Excel 中未找到 {cert_no}", status=404)

        ws = _get_ws(sheet_name)
        app_excel = _get_connector()
        today = _today()

        ws.Cells(row, COL_QTY).Value = 0
        ws.Cells(row, COL_SOLD_DATE).Value = today
        ws.Cells(row, COL_ACTUAL_PRICE).Value = data.get("price")
        if data.get("fullRemark") is not None:
            ws.Cells(row, COL_REMARK).Value = str(data.get("fullRemark"))
        elif data.get("remark"):
            old = _cell_str(ws.Cells(row, COL_REMARK).Value)
            remark = str(data.get("remark"))
            ws.Cells(row, COL_REMARK).Value = f"{old}；{remark}" if old else remark
        if data.get("salesPerson"):
            ws.Cells(row, COL_SALES_PERSON).Value = data.get("salesPerson")
        if data.get("salesChannel"):
            ws.Cells(row, COL_SALES_CHANNEL).Value = data.get("salesChannel")
        if data.get("orderNo"):
            ws.Cells(row, COL_ORDER_NO).Value = data.get("orderNo")

        try:
            ws.Parent.Application.Calculate()
        except Exception:
            pass

        actual_sheet = str(ws.Name)
        return _finish_sync(ws, app_excel, row, actual_sheet, f"出库同步成功 row={row}")
    except Exception as e:
        logger.exception("outbound sync failed")
        _reset_connector()
        return _sync_response(False, str(e), status=500)


@app.post("/sync/inbound")
def sync_inbound():
    data = request.get_json(force=True) or {}
    cert_no = _cell_str(data.get("certNo")).upper()
    sheet_name = data.get("excelSheet") or _bound_sheet or None
    try:
        row = _find_row_by_cert(cert_no, sheet_name, data.get("excelRow"))
        if not row:
            return _sync_response(False, f"Excel 中未找到 {cert_no}", status=404)

        ws = _get_ws(sheet_name)
        app_excel = _get_connector()
        today = _today()

        ws.Cells(row, COL_QTY).Value = 1
        ws.Cells(row, COL_RETURN_DATE).Value = today
        if data.get("fullRemark") is not None:
            ws.Cells(row, COL_REMARK).Value = str(data.get("fullRemark"))
        else:
            suffix = data.get("remark") or f"{today}退回"
            old = _cell_str(ws.Cells(row, COL_REMARK).Value)
            ws.Cells(row, COL_REMARK).Value = f"{old}；{suffix}" if old else suffix
        ws.Cells(row, COL_SOLD_DATE).Value = ""
        ws.Cells(row, COL_ACTUAL_PRICE).Value = ""

        try:
            ws.Parent.Application.Calculate()
        except Exception:
            pass

        actual_sheet = str(ws.Name)
        return _finish_sync(ws, app_excel, row, actual_sheet, f"入库同步成功 row={row}")
    except Exception as e:
        logger.exception("inbound sync failed")
        _reset_connector()
        return _sync_response(False, str(e), status=500)


@app.post("/sync/new_inbound")
def sync_new_inbound():
    data = request.get_json(force=True) or {}
    try:
        ws = _get_ws(_bound_sheet or None)
        app_excel = _get_connector()
        last_row = int(ws.Cells(ws.Rows.Count, COL_CERT_NO).End(-4162).Row)
        row = max(last_row + 1, DATA_START_ROW)

        ws.Cells(row, COL_ARRIVAL_DATE).Value = data.get("arrivalDate") or _today()
        ws.Cells(row, COL_BATCH).Value = data.get("batch") or ""
        ws.Cells(row, COL_QTY).Value = 1
        ws.Cells(row, COL_CERT_NO).Value = data.get("certNo")
        ws.Cells(row, COL_CATEGORY).Value = data.get("category") or ""
        ws.Cells(row, COL_RING_SIZE).Value = data.get("ringSize") or ""
        ws.Cells(row, COL_COST).Value = data.get("cost") or ""
        ws.Cells(row, COL_REMARK).Value = data.get("remark") or ""

        actual_sheet = str(ws.Name)
        return _finish_sync(ws, app_excel, row, actual_sheet, f"新品同步成功 row={row}")
    except Exception as e:
        logger.exception("new_inbound sync failed")
        _reset_connector()
        return _sync_response(False, str(e), status=500)


@app.get("/precheck/<cert_no>")
def precheck_cert(cert_no: str):
    """预检：编号在 Excel 中是否存在且可写。"""
    sheet_name = request.args.get("sheet") or _bound_sheet or None
    try:
        row = _find_row_by_cert(cert_no, sheet_name, request.args.get("row", type=int))
        if not row:
            return jsonify({"ok": False, "message": f"Excel 中未找到 {cert_no}"}), 404
        _get_ws(sheet_name)
        return jsonify({"ok": True, "message": f"预检通过 row={row}", "row": row, "sheet": sheet_name or _bound_sheet})
    except Exception as e:
        _reset_connector()
        return jsonify({"ok": False, "message": str(e)}), 400


@app.post("/sync/revert")
def sync_revert():
    """撤销：将 Excel 行恢复为操作前快照。"""
    data = request.get_json(force=True) or {}
    cert_no = _cell_str(data.get("certNo")).upper()
    op_type = str(data.get("opType") or "")
    snapshot = data.get("snapshot") or {}
    sheet_name = data.get("excelSheet") or _bound_sheet or None
    try:
        row = _find_row_by_cert(cert_no, sheet_name, data.get("excelRow"))
        if not row:
            return _sync_response(False, f"Excel 中未找到 {cert_no}", status=404)

        ws = _get_ws(sheet_name)
        app_excel = _get_connector()

        ws.Cells(row, COL_QTY).Value = snapshot.get("qty", 1)
        ws.Cells(row, COL_REMARK).Value = snapshot.get("remark") or ""
        ws.Cells(row, COL_RETURN_DATE).Value = snapshot.get("returnDate") or ""
        ws.Cells(row, COL_SOLD_DATE).Value = snapshot.get("soldDate") or ""
        ws.Cells(row, COL_ACTUAL_PRICE).Value = snapshot.get("actualPrice") or ""
        ws.Cells(row, COL_SALES_PERSON).Value = snapshot.get("salesPerson") or ""
        ws.Cells(row, COL_SALES_CHANNEL).Value = snapshot.get("salesChannel") or ""
        ws.Cells(row, COL_ORDER_NO).Value = snapshot.get("orderNo") or ""

        try:
            ws.Parent.Application.Calculate()
        except Exception:
            pass

        actual_sheet = str(ws.Name)
        return _finish_sync(ws, app_excel, row, actual_sheet, f"撤销同步成功 row={row}")
    except Exception as e:
        logger.exception("revert sync failed")
        _reset_connector()
        return _sync_response(False, str(e), status=500)


@app.post("/sync/update_row")
def sync_update_row():
    """更新 Excel 行基础字段（不改数量与编号）。"""
    data = request.get_json(force=True) or {}
    cert_no = _cell_str(data.get("certNo")).upper()
    sheet_name = data.get("excelSheet") or _bound_sheet or None
    try:
        row = _find_row_by_cert(cert_no, sheet_name, data.get("excelRow"))
        if not row:
            return _sync_response(False, f"Excel 中未找到 {cert_no}", status=404)

        ws = _get_ws(sheet_name)
        app_excel = _get_connector()

        if "arrivalDate" in data:
            ws.Cells(row, COL_ARRIVAL_DATE).Value = data.get("arrivalDate") or ""
        if "batch" in data:
            ws.Cells(row, COL_BATCH).Value = data.get("batch") or ""
        if "category" in data:
            ws.Cells(row, COL_CATEGORY).Value = data.get("category") or ""
        if "ringSize" in data:
            ws.Cells(row, COL_RING_SIZE).Value = data.get("ringSize") or ""
        if "cost" in data:
            ws.Cells(row, COL_COST).Value = data.get("cost") or ""
        if "remark" in data:
            ws.Cells(row, COL_REMARK).Value = data.get("remark") or ""

        try:
            ws.Parent.Application.Calculate()
        except Exception:
            pass

        actual_sheet = str(ws.Name)
        return _finish_sync(ws, app_excel, row, actual_sheet, f"行更新成功 row={row}")
    except Exception as e:
        logger.exception("update_row sync failed")
        _reset_connector()
        return _sync_response(False, str(e), status=500)


@app.get("/next-cert-no")
def next_cert_no():
    """扫描 Excel D 列，返回同前缀下一个可用编号。"""
    prefix = _cell_str(request.args.get("prefix") or "F").upper() or "F"
    if prefix not in CERT_PREFIXES:
        return jsonify({"ok": False, "message": f"不支持的前缀 {prefix}"}), 400
    try:
        ws = _get_ws(request.args.get("sheet") or _bound_sheet or None)
        excel_max, width = _max_cert_in_column(ws, prefix)
        next_num = excel_max + 1 if excel_max > 0 else 1
        cert = _format_cert(prefix, next_num, width)
        return jsonify({
            "ok": True,
            "certNo": cert,
            "prefix": prefix,
            "nextNum": next_num,
            "source": "excel",
            "excelMax": excel_max,
        })
    except Exception as e:
        _reset_connector()
        return jsonify({"ok": False, "message": str(e)}), 400


@app.get("/row/<cert_no>")
def row_by_cert(cert_no: str):
    """按编号读取 Excel 行数据（供数据库补同步）。"""
    sheet_name = request.args.get("sheet") or _bound_sheet or None
    excel_row = request.args.get("row", type=int)

    def _read():
        row = _find_row_by_cert_unlocked(cert_no, sheet_name, excel_row)
        if not row:
            return None
        ws = _get_ws_unlocked(sheet_name)
        data = _read_row_bracelet(ws, row, str(ws.Name))
        return row, str(ws.Name), data

    try:
        result = _with_com(_read)
        if not result:
            return jsonify({"ok": False, "message": f"Excel 中未找到 {cert_no.upper()}"}), 404
        row, sheet, data = result
        return jsonify({"ok": True, "message": f"已读取 row={row}", "row": row, "sheet": sheet, "data": data})
    except Exception as e:
        _reset_connector()
        return jsonify({"ok": False, "message": str(e)}), 400


@app.get("/cert-index/status")
def cert_index_status():
    return jsonify(
        {
            "ok": True,
            "ready": _cert_index_ready,
            "loading": _cert_index_loading,
            "count": len(_cert_index_entries),
            "builtAt": _cert_index_built_at,
            "workbook": _cert_index_workbook,
            "message": (
                f"索引已加载 {_cert_index_entries.__len__()} 条"
                if _cert_index_ready
                else ("索引加载中" if _cert_index_loading else "索引未加载")
            ),
        }
    )


@app.post("/cert-index/refresh")
def cert_index_refresh():
    result = _build_cert_index()
    status = 200 if result.get("ok") else 400
    return jsonify(result), status


@app.get("/cert-index")
def cert_index_list():
    """返回完整编号索引（供后端缓存）。"""
    if not _cert_index_ready:
        built = _build_cert_index()
        if not built.get("ok"):
            return jsonify(built), 400
    return jsonify(
        {
            "ok": True,
            "ready": True,
            "count": len(_cert_index_entries),
            "builtAt": _cert_index_built_at,
            "workbook": _cert_index_workbook,
            "entries": _cert_index_entries,
        }
    )


@app.get("/cert-index/search")
def cert_index_search():
    q = request.args.get("q") or ""
    limit = min(max(request.args.get("limit", 20, type=int), 1), 50)
    if not _cert_index_ready and not _cert_index_loading:
        built = _build_cert_index()
        if not built.get("ok"):
            return jsonify({"ok": False, "message": built.get("message", "索引未就绪"), "items": []}), 400
    if _cert_index_loading:
        return jsonify({"ok": False, "message": "索引加载中", "loading": True, "items": []}), 409
    items = _search_cert_index(q, limit)
    return jsonify({"ok": True, "items": items, "count": len(items)})


@app.get("/snapshot/<cert_no>")
def snapshot_by_cert(cert_no: str):
    """按编号重新截图（不写入），用于手动核对。"""
    data = request.args
    sheet_name = data.get("sheet") or _bound_sheet or None
    try:
        row = _find_row_by_cert(cert_no, sheet_name, data.get("row", type=int))
        if not row:
            return _sync_response(False, f"Excel 中未找到 {cert_no}", status=404)
        ws = _get_ws(sheet_name)
        app_excel = _get_connector()
        snapshot_b64, verify = capture_row_snapshot(ws, app_excel, row)
        return _sync_response(
            True,
            "截图成功",
            row=row,
            sheet=str(ws.Name),
            snapshot_b64=snapshot_b64,
            verify=verify,
        )
    except Exception as e:
        _reset_connector()
        return _sync_response(False, str(e), status=500)


if __name__ == "__main__":
    port = int(os.environ.get("EXCEL_BRIDGE_PORT", "4728"))
    logger.info("Excel 桥接服务启动，监听 127.0.0.1:%s", port)
    try:
        from waitress import serve

        serve(app, host="127.0.0.1", port=port, threads=1)
    except ImportError:
        logger.warning("未安装 waitress，使用 Flask 开发服务器")
        app.run(host="127.0.0.1", port=port, debug=False, threaded=True)
