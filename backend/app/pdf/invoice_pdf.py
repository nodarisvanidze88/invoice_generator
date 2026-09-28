from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import BaseDocTemplate, Frame, KeepTogether, PageTemplate, Spacer, Table, TableStyle

from app.pdf.common import FONT, FONT_BOLD, format_amount, format_date, format_kg, format_number, para, register_fonts, style
from app.pdf.layout import CONTENT_WIDTH, MARGIN_BOTTOM, MARGIN_X, PAGE_HEIGHT, PAGE_WIDTH, NumberedCanvas
from app.schemas import InvoiceDocument, Party
from app.services.invoice_calc import compute_totals, group_lines

TITLE_Y = PAGE_HEIGHT - 44
GRID_TOP = PAGE_HEIGHT - 80
SENDER_HEIGHT = 96
ADDRESSEE_HEIGHT = 104
GRID_BOTTOM = GRID_TOP - SENDER_HEIGHT - ADDRESSEE_HEIGHT
LEFT_WIDTH = CONTENT_WIDTH * 0.56
RIGHT_ROW_HEIGHTS = (44, 26, 30)
TABLE_GAP = 8
TEXT_PAD = 4
LINE_STEP = 10.5

COLUMN_RATIOS = (0.50, 0.125, 0.105, 0.135, 0.135)
UNIT_PRICE_DECIMALS = 4
GRID_COLOR = colors.HexColor("#222222")
GROUP_BG = colors.HexColor("#F2F4F7")


def _draw_label(canvas: Canvas, x: float, y: float, text: str, size: float = 8.5) -> None:
    canvas.setFont(FONT_BOLD, size)
    canvas.drawString(x, y, text)


def _draw_party(canvas: Canvas, x: float, top: float, label: str, party: Party, height: float) -> None:
    y = top - 11
    _draw_label(canvas, x + TEXT_PAD, y, label)
    y -= LINE_STEP
    canvas.setFont(FONT_BOLD, 8)
    canvas.drawString(x + TEXT_PAD, y, party.name)
    canvas.setFont(FONT, 8)
    for address_line in party.address.splitlines():
        y -= LINE_STEP
        canvas.drawString(x + TEXT_PAD, y, address_line)
    bottom = top - height
    canvas.drawString(x + TEXT_PAD + 8, bottom + 17, "TEL")
    canvas.drawString(x + TEXT_PAD + 40, bottom + 17, party.phone)
    canvas.drawString(x + TEXT_PAD + 8, bottom + 6, "FAX")
    canvas.drawString(x + TEXT_PAD + 40, bottom + 6, party.fax)


def _draw_checkbox(canvas: Canvas, x: float, y: float, checked: bool) -> None:
    size = 7
    canvas.rect(x, y - 1, size, size, stroke=1, fill=0)
    if checked:
        canvas.setLineWidth(1.2)
        path = canvas.beginPath()
        path.moveTo(x + 1.2, y + 2.6)
        path.lineTo(x + 3, y + 0.6)
        path.lineTo(x + 6.2, y + 5.4)
        canvas.drawPath(path, stroke=1, fill=0)
        canvas.setLineWidth(0.6)


def _draw_header(canvas: Canvas, doc: InvoiceDocument) -> None:
    left = MARGIN_X
    right = PAGE_WIDTH - MARGIN_X
    mid = left + LEFT_WIDTH

    canvas.setFont(FONT_BOLD, 15)
    canvas.drawCentredString(PAGE_WIDTH / 2, TITLE_Y, f"INVOICE N {doc.number}")
    canvas.setFont(FONT_BOLD, 8)
    canvas.drawString(mid + 30, TITLE_Y - 13, "インボイス作成日(Date) :")
    canvas.drawRightString(right, TITLE_Y - 13, format_date(doc.invoice_date))
    canvas.drawString(mid + 62, TITLE_Y - 24, f"作成地(Place): {doc.place}")

    canvas.setStrokeColor(GRID_COLOR)
    canvas.setLineWidth(0.6)
    canvas.rect(left, GRID_BOTTOM, CONTENT_WIDTH, GRID_TOP - GRID_BOTTOM)
    canvas.line(mid, GRID_TOP, mid, GRID_BOTTOM)
    canvas.line(left, GRID_TOP - SENDER_HEIGHT, mid, GRID_TOP - SENDER_HEIGHT)

    _draw_party(canvas, left, GRID_TOP, "ご依頼主 (Sender) FROM:", doc.sender, SENDER_HEIGHT)
    _draw_party(canvas, left, GRID_TOP - SENDER_HEIGHT, "お届け先 (Addressee) TO:", doc.addressee, ADDRESSEE_HEIGHT)

    row_top = GRID_TOP
    shipment_h, shipped_h, terms_h = RIGHT_ROW_HEIGHTS
    _draw_label(canvas, mid + TEXT_PAD, row_top - 11, "発送番号 (Shipment No.):")
    canvas.setFont(FONT_BOLD, 9)
    canvas.drawCentredString((mid + right) / 2, row_top - 24, doc.number)
    row_top -= shipment_h
    canvas.line(mid, row_top, right, row_top)

    _draw_label(canvas, mid + TEXT_PAD, row_top - 11, "送達手段 (Shipped Per) :")
    canvas.setFont(FONT_BOLD, 9)
    canvas.drawString(mid + 170, row_top - 11, doc.shipped_per)
    row_top -= shipped_h
    canvas.line(mid, row_top, right, row_top)

    _draw_label(canvas, mid + TEXT_PAD, row_top - 11, "支払い条件(Terms of Payment):")
    canvas.setFont(FONT_BOLD, 8.5)
    canvas.drawCentredString((mid + right) / 2 + 20, row_top - 22, doc.payment_terms)
    row_top -= terms_h
    canvas.line(mid, row_top, right, row_top)

    _draw_label(canvas, mid + TEXT_PAD, row_top - 11, "備考 (Remarks):")
    y = row_top - 23
    _draw_checkbox(canvas, mid + TEXT_PAD, y, doc.commercial_value)
    _draw_label(canvas, mid + TEXT_PAD + 12, y, "有償 (Commercial value)", 8)
    y -= 13
    _draw_checkbox(canvas, mid + TEXT_PAD, y, not doc.commercial_value)
    _draw_label(canvas, mid + TEXT_PAD + 12, y, "無償 (No Commercial value)", 8)
    y -= 11
    _draw_label(canvas, mid + TEXT_PAD + 24, y, "贈物 (Gift)   商品見本 (Sample)   その他 (Other)", 8)
    canvas.setFont(FONT, 7.5)
    for remark_line in doc.remarks.splitlines()[:3]:
        y -= 11
        canvas.drawString(mid + TEXT_PAD, y, remark_line)


def _column_widths() -> list[float]:
    return [CONTENT_WIDTH * ratio for ratio in COLUMN_RATIOS]


def _build_items_table(doc: InvoiceDocument, currency_label: str) -> Table:
    head = style("head", 7.5, bold=True, align=TA_CENTER, leading=9)
    group_style = style("group", 7.5, bold=True, leading=9)
    line_style = style("line", 6.2, leading=7.6, indent=10)
    num_bold = style("num_bold", 7.5, bold=True, align=TA_RIGHT, leading=9)
    num = style("num", 6.4, align=TA_CENTER, leading=7.6)
    num_right = style("num_right", 6.4, align=TA_RIGHT, leading=7.6)

    rows: list[list] = [
        [
            para("内容品の記載\n(Description)(Tariff)", head),
            para("正味重量\n(Net Weight)\nKg", head),
            para("数量\n(Quantity)", head),
            para(f"単価\n(Unit Price)\n通貨(Currency)\n{currency_label}", head),
            para("合計額\n(Total Amount)", head),
        ]
    ]
    group_rows: list[int] = []
    for group in group_lines(doc.lines):
        group_rows.append(len(rows))
        rows.append(
            [
                para(group.label, group_style),
                para(format_kg(group.net_weight_kg), num_bold),
                para(str(group.qty), style("gq", 7.5, bold=True, align=TA_CENTER, leading=9)),
                "",
                para(format_amount(group.amount), num_bold),
            ]
        )
        for line in group.lines:
            rows.append(
                [
                    para(line.description, line_style),
                    para(format_kg(line.net_weight_kg), num),
                    para(str(line.qty), num),
                    para(format_number(line.unit_price, UNIT_PRICE_DECIMALS), num),
                    para(format_amount(line.amount), num_right),
                ]
            )

    commands: list[tuple] = [
        ("FONTNAME", (0, 0), (-1, -1), FONT),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.6, GRID_COLOR),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, GRID_COLOR),
        ("INNERGRID", (0, 0), (-1, 0), 0.6, GRID_COLOR),
        ("TOPPADDING", (0, 1), (-1, -1), 1.2),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 1.2),
        ("TOPPADDING", (0, 0), (-1, 0), 4),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 4),
    ]
    for index in group_rows:
        commands.append(("BACKGROUND", (0, index), (-1, index), GROUP_BG))
        commands.append(("TOPPADDING", (0, index), (-1, index), 2.5))
    table = Table(rows, colWidths=_column_widths(), repeatRows=1)
    table.setStyle(TableStyle(commands))
    return table


def _build_footer(doc: InvoiceDocument, currency_symbol: str, trade_term_label: str) -> KeepTogether:
    totals = compute_totals(doc)
    total_cell = style("total", 9, bold=True, align=TA_CENTER, leading=11)
    total_right = style("total_r", 9, bold=True, align=TA_RIGHT, leading=11)
    total_row = Table(
        [
            [
                para("総合計 (Total)", total_cell),
                para(f"{totals.net_weight_kg:,.1f}kg", total_cell),
                para(str(totals.qty), total_cell),
                para(trade_term_label, style("term", 7.5, bold=True, align=TA_CENTER, leading=9)),
                para(f"{currency_symbol}{totals.amount:,.2f}", total_right),
            ]
        ],
        colWidths=_column_widths(),
    )
    total_row.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.8, GRID_COLOR),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#E8EBF0")),
            ]
        )
    )
    label = style("f_label", 8.5, bold=True, leading=12)
    origins = "/".join(totals.origins)
    summary = Table(
        [
            [para("個数（Number of pieces）", label), para(f":{totals.pieces}", label), "", para("署名(Signature)", label)],
            [para("総重量(Gross weight) Kg", label), para(f":{totals.gross_weight_kg:,.1f}kg", label), "", ""],
            [para("原産国(Country of Origin)", label), para(f":{origins}", label), "", ""],
        ],
        colWidths=[CONTENT_WIDTH * 0.26, CONTENT_WIDTH * 0.26, CONTENT_WIDTH * 0.1, CONTENT_WIDTH * 0.38],
    )
    summary.setStyle(
        TableStyle(
            [
                ("LINEBELOW", (3, 2), (3, 2), 0.8, GRID_COLOR),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 1),
            ]
        )
    )
    return KeepTogether([total_row, Spacer(1, 14), summary])


def render_invoice_pdf(doc: InvoiceDocument, currency_label: str, currency_symbol: str, trade_term_label: str) -> bytes:
    register_fonts()
    buffer = BytesIO()
    frame_top = GRID_BOTTOM - TABLE_GAP
    frame = Frame(MARGIN_X, MARGIN_BOTTOM, CONTENT_WIDTH, frame_top - MARGIN_BOTTOM, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    template = BaseDocTemplate(buffer, pagesize=(PAGE_WIDTH, PAGE_HEIGHT), title=f"Invoice {doc.number}", author=doc.sender.name)
    template.addPageTemplates([PageTemplate(id="invoice", frames=[frame], onPage=lambda canvas, _: _draw_header(canvas, doc))])
    template.build(
        [_build_items_table(doc, currency_label), _build_footer(doc, currency_symbol, trade_term_label)],
        canvasmaker=NumberedCanvas,
    )
    return buffer.getvalue()
