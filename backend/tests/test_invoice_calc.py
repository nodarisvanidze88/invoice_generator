from datetime import date

import pytest

from app.schemas import Box, BoxItem, InvoiceDocument, InvoiceLine
from app.services.invoice_calc import compute_totals, group_label, group_lines, line_description


def make_line(**overrides) -> InvoiceLine:
    defaults = {
        "code": "4901",
        "name": "Candy",
        "material": "",
        "origin": "Japan",
        "weight_g": 100.0,
        "unit_price": 50.0,
        "category": "Sugar-based Candy",
        "tariff_code": "17049099",
        "qty": 10,
    }
    return InvoiceLine(**(defaults | overrides))


def make_doc(lines: list[InvoiceLine], boxes: list[Box] | None = None) -> InvoiceDocument:
    return InvoiceDocument(number="T001", invoice_date=date(2026, 9, 28), lines=lines, boxes=boxes or [])


@pytest.mark.parametrize(
    ("overrides", "expected"),
    [
        ({}, "4901 Candy [Japan]"),
        ({"material": "Plastic", "origin": "China"}, "4901 Candy [Plastic] [China]"),
        ({"code": "", "origin": ""}, "Candy"),
        ({"material": "  "}, "4901 Candy [Japan]"),
    ],
)
def test_line_description_skips_empty_tags(overrides: dict, expected: str) -> None:
    assert line_description(make_line(**overrides)) == expected


def test_group_label_handles_missing_parts() -> None:
    assert group_label("Hair Oil", "33059000") == "Hair Oil [33059000]"
    assert group_label("Hair Oil", "") == "Hair Oil"
    assert group_label("", "") == "Uncategorized"


def test_group_lines_preserves_first_appearance_order_and_subtotals() -> None:
    lines = [
        make_line(category="B", tariff_code="2", qty=2),
        make_line(category="A", tariff_code="1", qty=3),
        make_line(category="B", tariff_code="2", qty=5, unit_price=10.0, weight_g=1000.0),
    ]
    groups = group_lines(lines)
    assert [g.label for g in groups] == ["B [2]", "A [1]"]
    assert groups[0].qty == 7
    assert groups[0].amount == pytest.approx(2 * 50 + 5 * 10)
    assert groups[0].net_weight_kg == pytest.approx(0.2 + 5.0)


def test_group_lines_skips_zero_quantity() -> None:
    assert group_lines([make_line(qty=0)]) == []


def test_totals_use_boxes_for_pieces_gross_and_packing_status() -> None:
    first, second = make_line(qty=10), make_line(qty=4, origin="China", category="Toy")
    boxes = [
        Box(gross_weight_kg=3.5, items=[BoxItem(line_id=first.id, qty=10)]),
        Box(gross_weight_kg=1.25, items=[BoxItem(line_id=second.id, qty=1)]),
    ]
    totals = compute_totals(make_doc([first, second], boxes))
    assert totals.qty == 14
    assert totals.amount == pytest.approx(700)
    assert totals.net_weight_kg == pytest.approx(1.4)
    assert totals.pieces == 2
    assert totals.gross_weight_kg == pytest.approx(4.75)
    assert totals.origins == ["Japan", "China"]
    assert totals.unpacked_qty == 3
    assert totals.mismatched_lines == 1


def test_manual_pieces_and_gross_weight_override_boxes() -> None:
    line = make_line()
    doc = make_doc([line], [Box(gross_weight_kg=3.0, items=[BoxItem(line_id=line.id, qty=10)])])
    doc.pieces_override = 5
    doc.gross_weight_override_kg = 42.5
    totals = compute_totals(doc)
    assert (totals.pieces, totals.gross_weight_kg) == (5, 42.5)


def test_document_rejects_box_referencing_unknown_line() -> None:
    with pytest.raises(ValueError, match="unknown lines"):
        make_doc([make_line()], [Box(items=[BoxItem(line_id="missing", qty=1)])])
