from collections import Counter
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.platypus import SimpleDocTemplate, Spacer, Table, TableStyle

from app.pdf.common import FONT, format_date, format_number, para, register_fonts, style
from app.pdf.layout import CONTENT_WIDTH, MARGIN_BOTTOM, MARGIN_X, NumberedCanvas
from app.schemas import Box, InvoiceDocument, InvoiceLine
from app.services.invoice_calc import compute_totals, line_description, packed_boxes

MARGIN_TOP = 36
BOX_GAP = 12
GRID_COLOR = colors.HexColor("#222222")
BOX_HEADER_BG = colors.HexColor("#E8EBF0")
COLUMN_WIDTHS = [CONTENT_WIDTH * 0.82, CONTENT_WIDTH * 0.18]


def _dimensions(box: Box) -> str:
    parts = [format_number(value, 1) for value in (box.length_cm, box.width_cm, box.height_cm)]
    return f"{' x '.join(parts)} cm" if all(parts) else ""


def _box_table(index: int, box: Box, lines_by_id: dict[str, InvoiceLine]) -> Table:
    bold = style("pb", 9, bold=True, leading=11)
    bold_right = style("pbr", 9, bold=True, align=TA_RIGHT, leading=11)
    head = style("ph", 7.5, bold=True, align=TA_CENTER, leading=9)
    item = style("pi", 7, leading=8.6)
    qty = style("pq", 7, align=TA_CENTER, leading=8.6)
    weight = f"{format_number(box.gross_weight_kg, 2)} kg" if box.gross_weight_kg else ""
    title = f"Box {index}" + (f"  ·  {_dimensions(box)}" if _dimensions(box) else "")
    rows: list[list] = [
        [para(title, bold), para(weight, bold_right)],
        [para("内容品の記載 (Description)", head), para("数量(Quantity)", head)],
    ]
    quantities: Counter[str] = Counter()
    for box_item in box.items:
        quantities[box_item.line_id] += box_item.qty
    for line_id, line_qty in quantities.items():
        line = lines_by_id.get(line_id)
        if line is not None:
            rows.append([para(line_description(line), item), para(str(line_qty), qty)])
    table = Table(rows, colWidths=COLUMN_WIDTHS, repeatRows=2)
    table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), FONT),
                ("BOX", (0, 0), (-1, -1), 0.6, GRID_COLOR),
                ("BACKGROUND", (0, 0), (-1, 0), BOX_HEADER_BG),
                ("LINEBELOW", (0, 0), (-1, 1), 0.6, GRID_COLOR),
                ("LINEBEFORE", (1, 1), (1, -1), 0.6, GRID_COLOR),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 2), (-1, -1), 1.5),
                ("BOTTOMPADDING", (0, 2), (-1, -1), 1.5),
            ]
        )
    )
    return table


def render_packing_pdf(doc: InvoiceDocument) -> bytes:
    register_fonts()
    buffer = BytesIO()
    template = SimpleDocTemplate(
        buffer,
        leftMargin=MARGIN_X,
        rightMargin=MARGIN_X,
        topMargin=MARGIN_TOP,
        bottomMargin=MARGIN_BOTTOM,
        title=f"Packing List {doc.number}",
        author=doc.sender.name,
    )
    totals = compute_totals(doc)
    lines_by_id = {line.id: line for line in doc.lines}
    boxes = packed_boxes(doc.boxes)
    subtitle = style("sub", 8.5, leading=11)
    story: list = [
        para(f"{doc.number} Packing List", style("title", 15, bold=True, leading=18)),
        Spacer(1, 3),
        para(
            "  ·  ".join(
                (
                    f"Date: {format_date(doc.invoice_date)}",
                    f"To: {doc.addressee.name}",
                    f"Boxes: {totals.pieces}",
                    f"Gross weight: {totals.gross_weight_kg:,.1f} kg",
                    f"Total qty: {totals.qty}",
                )
            ),
            subtitle,
        ),
        Spacer(1, BOX_GAP),
    ]
    for index, box in enumerate(boxes, start=1):
        story.append(_box_table(index, box, lines_by_id))
        story.append(Spacer(1, BOX_GAP))
    template.build(story, canvasmaker=NumberedCanvas)
    return buffer.getvalue()
