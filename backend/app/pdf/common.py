from datetime import date
from functools import cache
from xml.sax.saxutils import escape

from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph

from app.config import FONTS_DIR

FONT = "BIZUDGothic"
FONT_BOLD = "BIZUDGothic-Bold"


@cache
def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont(FONT, str(FONTS_DIR / "BIZUDGothic-Regular.ttf")))
    pdfmetrics.registerFont(TTFont(FONT_BOLD, str(FONTS_DIR / "BIZUDGothic-Bold.ttf")))
    pdfmetrics.registerFontFamily(FONT, normal=FONT, bold=FONT_BOLD, italic=FONT, boldItalic=FONT_BOLD)


def style(name: str, size: float, bold: bool = False, align: int = 0, leading: float | None = None, indent: float = 0) -> ParagraphStyle:
    return ParagraphStyle(
        name,
        fontName=FONT_BOLD if bold else FONT,
        fontSize=size,
        leading=leading or size * 1.25,
        alignment=align,
        leftIndent=indent,
    )


def para(text: str, paragraph_style: ParagraphStyle) -> Paragraph:
    return Paragraph(escape(text).replace("\n", "<br/>"), paragraph_style)


def format_number(value: float | None, max_decimals: int) -> str:
    if value is None:
        return ""
    text = f"{value:,.{max_decimals}f}"
    return text.rstrip("0").rstrip(".") if "." in text else text


def format_amount(value: float) -> str:
    rounded = round(value, 2)
    return f"{rounded:,.0f}" if rounded.is_integer() else f"{rounded:,.2f}"


def format_kg(value: float) -> str:
    return f"{value:,.2f} Kg"


def format_date(value: date) -> str:
    return value.strftime("%d-%b-%Y")
