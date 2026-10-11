from functools import cache
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import BaseDocTemplate, Frame, KeepTogether, PageTemplate, Table, TableStyle

from app.config import FONTS_DIR
from app.pdf.common import para, register_fonts
from app.pdf.layout import NumberedCanvas
from app.schemas import Party
from app.services.simple_invoice import SimpleInvoice

SANS = "Carlito"
SANS_BOLD = "Carlito-Bold"
ACCENT = colors.HexColor("#2F5496")
RULE = colors.HexColor("#333333")

PAGE_WIDTH, PAGE_HEIGHT = 595.27, 841.89
MARGIN_X = 46
MARGIN_BOTTOM = 40
CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN_X
TOP = PAGE_HEIGHT - 46
BOX_GAP = 10
BOX_WIDTH = (CONTENT_WIDTH - BOX_GAP) / 2
BOX_HEADER_HEIGHT = 13
BOX_BODY_HEIGHT = 92
HEADER_BOTTOM = TOP - 53 - BOX_HEADER_HEIGHT - BOX_BODY_HEIGHT - 12
COLUMN_RATIOS = (0.47, 0.13, 0.11, 0.12, 0.17)
DECIMALS = 2


@cache
def register_sans() -> None:
    pdfmetrics.registerFont(TTFont(SANS, str(FONTS_DIR / "Carlito-Regular.ttf")))
    pdfmetrics.registerFont(TTFont(SANS_BOLD, str(FONTS_DIR / "Carlito-Bold.ttf")))
    pdfmetrics.registerFontFamily(SANS, normal=SANS, bold=SANS_BOLD, italic=SANS, boldItalic=SANS_BOLD)


def _style(name: str, size: float, bold: bool = False, align: int = 0) -> ParagraphStyle:
    return ParagraphStyle(name, fontName=SANS_BOLD if bold else SANS, fontSize=size, leading=size * 1.25, alignment=align)


def _fixed(value: float) -> str:
    return f"{value:.{DECIMALS}f}"


def _draw_party_box(canvas: Canvas, x: float, top: float, title: str, party: Party) -> None:
    canvas.setFillColor(ACCENT)
    canvas.rect(x, top - BOX_HEADER_HEIGHT, BOX_WIDTH, BOX_HEADER_HEIGHT, stroke=0, fill=1)
    canvas.setFillColor(colors.white)
    canvas.setFont(SANS_BOLD, 7.5)
    canvas.drawString(x + 4, top - BOX_HEADER_HEIGHT + 4, title)
    canvas.setFillColor(colors.black)
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.6)
    canvas.rect(x, top - BOX_HEADER_HEIGHT - BOX_BODY_HEIGHT, BOX_WIDTH, BOX_BODY_HEIGHT + BOX_HEADER_HEIGHT, stroke=1, fill=0)

    text_x = x + 18
    y = top - BOX_HEADER_HEIGHT - 16
    canvas.setFont(SANS, 7.5)
    canvas.drawString(text_x, y, f"Company: {party.name}")
    y -= 18
    address_lines = [line.strip() for line in party.address.splitlines() if line.strip()] or [""]
    canvas.drawString(text_x, y, f"Address: {address_lines[0]}")
    for line in address_lines[1:]:
        y -= 10
        canvas.drawString(text_x + 31, y, line)
    if party.phone:
        canvas.drawString(text_x, top - BOX_HEADER_HEIGHT - BOX_BODY_HEIGHT + 8, f"TEL: {party.phone}")


def _draw_header(canvas: Canvas, invoice: SimpleInvoice) -> None:
    left, right = MARGIN_X, PAGE_WIDTH - MARGIN_X
    canvas.setFont(SANS, 15)
    canvas.drawString(left, TOP, invoice.company_name.upper())
    canvas.setFillColor(ACCENT)
    canvas.setFont(SANS_BOLD, 15)
    canvas.drawRightString(right, TOP, "INVOICE")
    canvas.setFillColor(colors.black)
    canvas.setFont(SANS, 9)
    canvas.drawString(left + 12, TOP - 19, f"Address: {invoice.company_address}")
    if invoice.company_phone:
        canvas.drawString(left + 10, TOP - 30, f"TEL: {invoice.company_phone}")

    rule_top = TOP - 36
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.6)
    canvas.line(left, rule_top, right, rule_top)
    canvas.line(left, rule_top - 11, right, rule_top - 11)
    canvas.setFont(SANS_BOLD, 8.5)
    canvas.drawString(left + 16, rule_top - 8.5, "INVOICE #:")
    canvas.drawString(left + BOX_WIDTH + BOX_GAP, rule_top - 8.5, "INVOICE DATE:")
    canvas.setFont(SANS, 8.5)
    canvas.drawString(left + 74, rule_top - 8.5, invoice.number)
    canvas.drawString(left + BOX_WIDTH + BOX_GAP + 120, rule_top - 8.5, invoice.invoice_date_label)

    boxes_top = TOP - 53
    _draw_party_box(canvas, left, boxes_top, "SHIPPING TO", invoice.shipping_to)
    _draw_party_box(canvas, left + BOX_WIDTH + BOX_GAP, boxes_top, "BILL TO", invoice.bill_to)


def _column_widths() -> list[float]:
    return [CONTENT_WIDTH * ratio for ratio in COLUMN_RATIOS]


def _items_table(invoice: SimpleInvoice) -> Table:
    head = _style("h", 8.5, bold=True, align=TA_CENTER)
    head_left = _style("hl", 8.5, bold=True)
    head_right = _style("hr", 8.5, bold=True, align=TA_RIGHT)
    label = _style("l", 8.5, bold=True)
    center = _style("c", 8, align=TA_CENTER)
    total = _style("t", 8, bold=True, align=TA_RIGHT)
    rows: list[list] = [
        [
            para("DESCRIPTIONS   [HS Code]", head_left),
            para("Weight (Kg)", head),
            para("Quantity", head),
            para("Unit Price", head),
            para(f"TOTAL PRICE ({invoice.currency_code})", head_right),
        ]
    ]
    for row in invoice.rows:
        rows.append(
            [
                para(row.label, label),
                para(f"{row.net_weight_kg:.2f} Kg", center),
                para(str(row.qty), center),
                para(_fixed(row.unit_price), center),
                para(_fixed(row.amount), total),
            ]
        )
    table = Table(rows, colWidths=_column_widths(), repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, 0), 6),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 10),
                ("LEFTPADDING", (0, 1), (0, -1), 12),
                ("TOPPADDING", (0, 1), (-1, -1), 1.6),
                ("BOTTOMPADDING", (0, 1), (-1, -1), 1.6),
            ]
        )
    )
    return table


def _total_row(invoice: SimpleInvoice) -> KeepTogether:
    bold = _style("tl", 9, bold=True)
    bold_center = _style("tc", 8.5, bold=True, align=TA_CENTER)
    bold_right = _style("tr", 9, bold=True, align=TA_RIGHT)
    amount = round(invoice.total_amount, 2)
    amount_text = f"{amount:,.0f}" if amount.is_integer() else f"{amount:,.2f}"
    table = Table(
        [
            [
                para(f"Total amount ({invoice.currency_code})", bold),
                para(f"{invoice.total_weight_kg:,.2f} Kg", bold_center),
                para(f"{invoice.total_qty:,}", bold_center),
                "",
                para(f"¥{amount_text}" if invoice.currency_code == "JPY" else amount_text, bold_right),
            ]
        ],
        colWidths=_column_widths(),
    )
    table.setStyle(TableStyle([("LINEABOVE", (0, 0), (-1, 0), 1.6, colors.black), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    return KeepTogether([table])


def render_simple_invoice_pdf(invoice: SimpleInvoice) -> bytes:
    register_fonts()
    register_sans()
    buffer = BytesIO()
    frame_top = HEADER_BOTTOM - 8
    frame = Frame(MARGIN_X, MARGIN_BOTTOM, CONTENT_WIDTH, frame_top - MARGIN_BOTTOM, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    template = BaseDocTemplate(buffer, pagesize=(PAGE_WIDTH, PAGE_HEIGHT), title=f"Invoice {invoice.number}", author=invoice.company_name)
    template.addPageTemplates([PageTemplate(id="simple", frames=[frame], onPage=lambda canvas, _: _draw_header(canvas, invoice))])
    template.build([_items_table(invoice), _total_row(invoice)], canvasmaker=NumberedCanvas)
    return buffer.getvalue()
