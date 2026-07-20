"""Shared PDF report builder — used by reports_router.py and
ai_insights_router.py. Registers the bundled Sarabun font (SIL OFL,
see app/tdss/assets/fonts/OFL.txt) so Thai text renders correctly;
reportlab's built-in fonts (Helvetica etc.) have no Thai glyphs."""

import datetime as dt
import io
import os

from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

_FONT_DIR = os.path.join(os.path.dirname(__file__), "assets", "fonts")
_FONTS_REGISTERED = False


def _ensure_fonts_registered() -> None:
    global _FONTS_REGISTERED
    if _FONTS_REGISTERED:
        return
    pdfmetrics.registerFont(TTFont("Sarabun", os.path.join(_FONT_DIR, "Sarabun-Regular.ttf")))
    pdfmetrics.registerFont(TTFont("Sarabun-Bold", os.path.join(_FONT_DIR, "Sarabun-Bold.ttf")))
    _FONTS_REGISTERED = True


def _fmt_cell(value) -> str:
    if value is None:
        return "-"
    if isinstance(value, bool):
        return "ใช่" if value else "ไม่ใช่"
    if isinstance(value, float):
        return f"{value:,.2f}"
    if isinstance(value, dt.datetime):
        return value.strftime("%d/%m/%Y %H:%M")
    return str(value)


def build_pdf_report(rows: list[dict], *, title: str, subtitle: str | None = None) -> bytes:
    _ensure_fonts_registered()

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(A4),
        topMargin=15 * mm,
        bottomMargin=12 * mm,
        leftMargin=12 * mm,
        rightMargin=12 * mm,
        title=title,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("ThaiTitle", parent=styles["Title"], fontName="Sarabun-Bold", fontSize=16)
    subtitle_style = ParagraphStyle("ThaiSubtitle", parent=styles["Normal"], fontName="Sarabun", fontSize=9, textColor=colors.grey)
    body_style = ParagraphStyle("ThaiBody", parent=styles["Normal"], fontName="Sarabun", fontSize=7, leading=9)
    header_style = ParagraphStyle("ThaiHeader", parent=styles["Normal"], fontName="Sarabun-Bold", fontSize=7.5, leading=9, textColor=colors.white)

    elements = [Paragraph(title, title_style)]
    meta = f"สร้างเมื่อ {dt.datetime.now().strftime('%d/%m/%Y %H:%M')}"
    if subtitle:
        meta = f"{subtitle} · {meta}"
    elements.append(Paragraph(meta, subtitle_style))
    elements.append(Spacer(1, 8 * mm))

    if not rows:
        elements.append(Paragraph("ไม่มีข้อมูลในช่วงที่เลือก", styles["Normal"]))
    else:
        headers = list(rows[0].keys())
        header_row = [Paragraph(h, header_style) for h in headers]
        data_rows = [[Paragraph(_fmt_cell(r.get(h)), body_style) for h in headers] for r in rows]
        table = Table([header_row] + data_rows, repeatRows=1)
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#171717")),
                    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d0d0d0")),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f6f7f8")]),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        elements.append(table)

    doc.build(elements)
    return buf.getvalue()


def pdf_response(rows: list[dict], *, title: str, subtitle: str | None, filename: str) -> StreamingResponse:
    pdf_bytes = build_pdf_report(rows, title=title, subtitle=subtitle)
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
