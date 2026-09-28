from reportlab.lib.pagesizes import A4
from reportlab.pdfgen.canvas import Canvas

from app.pdf.common import FONT

PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN_X = 34
MARGIN_BOTTOM = 36
CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN_X
PAGE_NUMBER_FONT_SIZE = 7


class NumberedCanvas(Canvas):
    """Defers page output so every page can print 'Page n / total'."""

    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self._saved_pages: list[dict] = []

    def showPage(self) -> None:
        self._saved_pages.append(dict(self.__dict__))
        self._startPage()

    def save(self) -> None:
        total = len(self._saved_pages)
        for state in self._saved_pages:
            self.__dict__.update(state)
            self.setFont(FONT, PAGE_NUMBER_FONT_SIZE)
            self.setFillGray(0.45)
            self.drawRightString(PAGE_WIDTH - MARGIN_X, MARGIN_BOTTOM / 2, f"Page {self._pageNumber} / {total}")
            super().showPage()
        super().save()
