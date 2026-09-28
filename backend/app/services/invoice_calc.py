"""Invoice math mirroring the legacy workbook: lines grouped by 'Category [Tariff]' with subtotals, box-derived footer."""

from collections import Counter
from dataclasses import dataclass, field

from app.schemas import Box, InvoiceDocument, InvoiceLine, InvoiceTotals

GRAMS_PER_KG = 1000
UNCATEGORIZED = "Uncategorized"


def line_description(line: InvoiceLine) -> str:
    head = " ".join(part for part in (line.code.strip(), line.name.strip()) if part)
    tags = "".join(f" [{tag.strip()}]" for tag in (line.material, line.origin) if tag and tag.strip())
    return head + tags


def group_label(category: str, tariff_code: str) -> str:
    label = category.strip() or UNCATEGORIZED
    return f"{label} [{tariff_code.strip()}]" if tariff_code.strip() else label


def line_net_kg(line: InvoiceLine) -> float:
    return (line.weight_g or 0) * line.qty / GRAMS_PER_KG


def line_amount(line: InvoiceLine) -> float:
    return (line.unit_price or 0) * line.qty


@dataclass(frozen=True)
class LineView:
    description: str
    net_weight_kg: float
    qty: int
    unit_price: float | None
    amount: float


@dataclass
class GroupView:
    label: str
    lines: list[LineView] = field(default_factory=list)

    @property
    def net_weight_kg(self) -> float:
        return sum(line.net_weight_kg for line in self.lines)

    @property
    def qty(self) -> int:
        return sum(line.qty for line in self.lines)

    @property
    def amount(self) -> float:
        return sum(line.amount for line in self.lines)


def group_lines(lines: list[InvoiceLine]) -> list[GroupView]:
    groups: dict[str, GroupView] = {}
    for line in lines:
        if line.qty <= 0:
            continue
        label = group_label(line.category, line.tariff_code)
        group = groups.setdefault(label, GroupView(label=label))
        group.lines.append(
            LineView(
                description=line_description(line),
                net_weight_kg=line_net_kg(line),
                qty=line.qty,
                unit_price=line.unit_price,
                amount=line_amount(line),
            )
        )
    return list(groups.values())


def unique_origins(lines: list[InvoiceLine]) -> list[str]:
    seen: dict[str, None] = {}
    for line in lines:
        origin = line.origin.strip()
        if line.qty > 0 and origin:
            seen.setdefault(origin.title() if origin.islower() else origin, None)
    return list(seen)


def packed_quantities(boxes: list[Box]) -> Counter[str]:
    packed: Counter[str] = Counter()
    for box in boxes:
        for item in box.items:
            packed[item.line_id] += item.qty
    return packed


def remaining_by_line(doc: InvoiceDocument) -> dict[str, int]:
    packed = packed_quantities(doc.boxes)
    return {line.id: line.qty - packed[line.id] for line in doc.lines}


def packed_boxes(boxes: list[Box]) -> list[Box]:
    return [box for box in boxes if box.items or (box.gross_weight_kg or 0) > 0]


def compute_totals(doc: InvoiceDocument) -> InvoiceTotals:
    active = [line for line in doc.lines if line.qty > 0]
    remaining = remaining_by_line(doc)
    boxes = packed_boxes(doc.boxes)
    return InvoiceTotals(
        net_weight_kg=round(sum(line_net_kg(line) for line in active), 3),
        qty=sum(line.qty for line in active),
        amount=round(sum(line_amount(line) for line in active), 2),
        gross_weight_kg=round(sum(box.gross_weight_kg or 0 for box in boxes), 3),
        pieces=len(boxes),
        origins=unique_origins(active),
        unpacked_qty=sum(max(value, 0) for value in remaining.values()),
        mismatched_lines=sum(1 for value in remaining.values() if value != 0),
    )
