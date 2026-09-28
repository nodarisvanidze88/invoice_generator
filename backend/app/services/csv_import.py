"""Supplier order CSV import (JAN-matched), the web counterpart of the workbook's HandleCSV / UpdateOrAddRows."""

import csv
import io
from collections.abc import Iterable
from dataclasses import dataclass

from app.models import Product

ENCODINGS = ("utf-8-sig", "cp932", "shift_jis", "latin-1")
CODE_SEPARATOR = "/"

HEADER_ALIASES: dict[str, str] = {
    "jan": "code",
    "code": "code",
    "jan / code": "code",
    "商品": "name",
    "merchandise": "name",
    "product name": "name",
    "name": "name",
    "数量": "qty",
    "quantity": "qty",
    "qty": "qty",
    "単価": "unit_price",
    "unit price": "unit_price",
    "price": "unit_price",
}


class CsvImportError(ValueError):
    pass


@dataclass
class ParsedRow:
    row: int
    code: str
    name: str
    qty: int | None
    unit_price: float | None


def decode(content: bytes) -> tuple[str, str]:
    for encoding in ENCODINGS:
        try:
            return content.decode(encoding), encoding
        except UnicodeDecodeError:
            continue
    raise CsvImportError("Unable to decode file")


def _to_number(value: str | None) -> float | None:
    if value is None:
        return None
    cleaned = value.replace(",", "").replace("¥", "").replace("円", "").strip()
    try:
        return float(cleaned) if cleaned else None
    except ValueError:
        return None


def _normalize_code(value: str) -> str:
    code = value.strip().strip("'\"")
    if code.endswith(".0") and code[:-2].isdigit():
        code = code[:-2]
    return code


def parse_csv(content: bytes) -> tuple[list[ParsedRow], str]:
    text, encoding = decode(content)
    reader = csv.reader(io.StringIO(text))
    try:
        header = next(reader)
    except StopIteration as exc:
        raise CsvImportError("File is empty") from exc
    columns = {HEADER_ALIASES[h.strip().lower()]: i for i, h in enumerate(header) if h.strip().lower() in HEADER_ALIASES}
    if "code" not in columns:
        raise CsvImportError("CSV must contain a 'JAN' column")

    def cell(values: list[str], key: str) -> str | None:
        index = columns.get(key)
        return values[index] if index is not None and index < len(values) else None

    merged: dict[str, ParsedRow] = {}
    for line_number, values in enumerate(reader, start=2):
        code = _normalize_code(cell(values, "code") or "")
        if not code:
            continue
        qty = _to_number(cell(values, "qty"))
        price = _to_number(cell(values, "unit_price"))
        if code in merged:
            existing = merged[code]
            existing.qty = int((existing.qty or 0) + (qty or 0))
            existing.unit_price = price if price is not None else existing.unit_price
            continue
        merged[code] = ParsedRow(
            row=line_number,
            code=code,
            name=(cell(values, "name") or "").strip(),
            qty=int(qty) if qty is not None else None,
            unit_price=price,
        )
    return list(merged.values()), encoding


def build_code_index(products: Iterable[Product]) -> dict[str, Product]:
    index: dict[str, Product] = {}
    for product in products:
        index.setdefault(product.code.strip(), product)
        for token in product.code.split(CODE_SEPARATOR):
            if token.strip():
                index.setdefault(token.strip(), product)
    return index
