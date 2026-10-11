"""3D auto-packing.

Block-building over extreme points: identical units of one invoice line are placed as an nx × ny × nz block at the
lowest/back-most feasible point, trying all six orientations. For every new box each active box type is simulated and
the one minimising DHL chargeable weight (max(actual, L×W×H / divisor)) is kept.
"""

from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass, field
from itertools import permutations
from math import floor

from app.schemas import Box, BoxItem, InvoiceLine, Placement

EPS = 1e-6
GRAMS_PER_KG = 1000
DEFAULT_DENSITY_G_PER_CM3 = 0.35
FALLBACK_SIDE_CM = 10.0
MIN_SIDE_CM = 1.0

Point = tuple[float, float, float]
Dims = tuple[float, float, float]


@dataclass(frozen=True)
class ItemSpec:
    """One unit of an invoice line. `dims` is (length, width, height); upright items may only turn around the vertical axis."""

    line_id: str
    dims: Dims
    unit_kg: float
    estimated: bool
    upright: bool = False

    @property
    def volume(self) -> float:
        return self.dims[0] * self.dims[1] * self.dims[2]

    @property
    def orientations(self) -> list[Dims]:
        if self.upright:
            length, width, height = self.dims
            return sorted({(length, width, height), (width, length, height)})
        return sorted(set(permutations(self.dims)))


@dataclass(frozen=True)
class BoxSpec:
    id: int | None
    name: str
    inner: Dims
    tare_kg: float
    max_kg: float

    @property
    def volume(self) -> float:
        return self.inner[0] * self.inner[1] * self.inner[2]

    def volumetric_kg(self, divisor: int) -> float:
        return self.volume / divisor


@dataclass(frozen=True)
class Block:
    line_id: str
    origin: Point
    unit: Dims
    counts: tuple[int, int, int]
    end: Point = field(init=False)

    def __post_init__(self) -> None:
        end = tuple(o + u * n for o, u, n in zip(self.origin, self.unit, self.counts))
        object.__setattr__(self, "end", end)

    @property
    def count(self) -> int:
        return self.counts[0] * self.counts[1] * self.counts[2]

    def intersects(self, low: Point, high: Point) -> bool:
        end = self.end
        return all(low[a] < end[a] - EPS and high[a] > self.origin[a] + EPS for a in range(3))


@dataclass
class BoxState:
    spec: BoxSpec
    blocks: list[Block] = field(default_factory=list)
    points: list[Point] = field(default_factory=lambda: [(0.0, 0.0, 0.0)])
    content_kg: float = 0.0
    used_volume: float = 0.0
    _limits: dict[Point, Point] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self._refresh_limits()

    @property
    def weight_left(self) -> float:
        return self.spec.max_kg - self.spec.tare_kg - self.content_kg

    @property
    def gross_kg(self) -> float:
        return self.spec.tare_kg + self.content_kg

    def chargeable_kg(self, divisor: int) -> float:
        return max(self.gross_kg, self.spec.volumetric_kg(divisor))

    def _limits_against(self, point: Point, limits: Point, blocks: Iterable[Block]) -> Point:
        """Free distance from `point` along each axis (a ray test, used as a cheap necessary condition)."""
        result = list(limits)
        for block in blocks:
            start, end = block.origin, block.end
            for axis in range(3):
                if start[axis] < point[axis] - EPS or start[axis] >= result[axis]:
                    continue
                if all(start[a] <= point[a] + EPS and end[a] > point[a] + EPS for a in range(3) if a != axis):
                    result[axis] = start[axis]
        return result[0], result[1], result[2]

    def _refresh_limits(self, new_block: Block | None = None) -> None:
        previous = self._limits
        limits: dict[Point, Point] = {}
        for point in self.points:
            if new_block is not None and point in previous:
                limits[point] = self._limits_against(point, previous[point], (new_block,))
            else:
                limits[point] = self._limits_against(point, self.spec.inner, self.blocks)
        self._limits = limits

    def snapshot(self) -> tuple:
        return list(self.blocks), list(self.points), self.content_kg, self.used_volume, dict(self._limits)

    def restore(self, snapshot: tuple) -> None:
        self.blocks, self.points, self.content_kg, self.used_volume, self._limits = (
            list(snapshot[0]),
            list(snapshot[1]),
            snapshot[2],
            snapshot[3],
            dict(snapshot[4]),
        )

    def _is_free(self, low: Point, high: Point) -> bool:
        if any(high[a] > self.spec.inner[a] + EPS for a in range(3)):
            return False
        return not any(block.intersects(low, high) for block in self.blocks)

    def _grow(self, point: Point, unit: Dims) -> tuple[int, int, int]:
        """Largest grid of `unit` from `point`, grown along x, then y, then z (the single unit is known to fit)."""
        counts = [1, 1, 1]
        for axis in range(3):
            others = [a for a in range(3) if a != axis]
            limit = self.spec.inner[axis]
            for block in self.blocks:
                start, end = block.origin, block.end
                overlaps_others = all(
                    start[a] < point[a] + unit[a] * counts[a] - EPS and end[a] > point[a] + EPS for a in others
                )
                if overlaps_others and start[axis] >= point[axis] - EPS:
                    limit = min(limit, start[axis])
            counts[axis] = max(1, floor((limit - point[axis]) / unit[axis] + EPS))
        return counts[0], counts[1], counts[2]

    def place(self, item: ItemSpec, cap: int) -> int:
        if cap <= 0 or item.volume > self.spec.volume - self.used_volume + EPS:
            return 0
        for point in self.points:
            limits = self._limits[point]
            best: tuple[int, Dims, tuple[int, int, int]] | None = None
            for unit in item.orientations:
                if any(point[a] + unit[a] > limits[a] + EPS for a in range(3)):
                    continue
                high = (point[0] + unit[0], point[1] + unit[1], point[2] + unit[2])
                if not self._is_free(point, high):
                    continue
                counts = _cap_counts(self._grow(point, unit), cap)
                total = counts[0] * counts[1] * counts[2]
                if best is None or total > best[0]:
                    best = (total, unit, counts)
            if best is not None:
                self._add_block(Block(item.line_id, point, best[1], best[2]), item)
                return best[0]
        return 0

    def _add_block(self, block: Block, item: ItemSpec) -> None:
        self.blocks.append(block)
        self.content_kg += item.unit_kg * block.count
        self.used_volume += item.volume * block.count
        start, end = block.origin, block.end
        candidates = [(end[0], start[1], start[2]), (start[0], end[1], start[2]), (start[0], start[1], end[2])]
        kept = [p for p in self.points if p != start and not _inside(p, start, end)]
        for candidate in candidates:
            if all(candidate[a] < self.spec.inner[a] - EPS for a in range(3)) and candidate not in kept:
                kept.append(candidate)
        self.points = sorted(kept, key=lambda p: (p[2], p[1], p[0]))
        self._refresh_limits(block)


def _inside(point: Point, start: Point, end: Point) -> bool:
    return all(start[a] - EPS <= point[a] < end[a] - EPS for a in range(3))


def _cap_counts(counts: tuple[int, int, int], cap: int) -> tuple[int, int, int]:
    nx, ny, nz = counts
    if nx * ny * nz <= cap:
        return counts
    layer = nx * ny
    if cap >= layer:
        return nx, ny, cap // layer
    if cap >= nx:
        return nx, cap // nx, 1
    return cap, 1, 1


def weight_cap(item: ItemSpec, weight_left: float) -> int:
    if item.unit_kg <= 0:
        return 1 << 30
    return max(0, floor((weight_left + EPS) / item.unit_kg))


def simulate_box(spec: BoxSpec, items: list[ItemSpec], remaining: Counter[str]) -> BoxState:
    """Fill one box. Only the first line may be split across boxes; later lines go in whole or not at all,
    so every product stays together instead of being scattered one piece per box."""
    state = BoxState(spec)
    for item in items:
        wanted = remaining[item.line_id]
        if wanted <= 0:
            continue
        must_fit_whole = bool(state.blocks)
        snapshot = state.snapshot() if must_fit_whole else None
        placed = 0
        while placed < wanted:
            count = state.place(item, min(wanted - placed, weight_cap(item, state.weight_left)))
            if count == 0:
                break
            placed += count
        if snapshot is not None and placed < wanted:
            state.restore(snapshot)
    return state


def estimate_dims(line: InvoiceLine, density_by_category: dict[str, float]) -> tuple[Dims, bool]:
    if line.length_cm and line.width_cm and line.height_cm:
        return (line.length_cm, line.width_cm, line.height_cm), False
    if not line.weight_g:
        return (FALLBACK_SIDE_CM, FALLBACK_SIDE_CM, FALLBACK_SIDE_CM), True
    density = density_by_category.get(line.category, DEFAULT_DENSITY_G_PER_CM3)
    side = max(MIN_SIDE_CM, (line.weight_g / density) ** (1 / 3))
    return (round(side, 1), round(side, 1), round(side, 1)), True


def category_densities(rows: Iterable[tuple[str, float | None, float | None, float | None, float | None]]) -> dict[str, float]:
    """Average g/cm³ per category from (category, weight_g, L, W, H) of products that have real dimensions."""
    totals: dict[str, list[float]] = {}
    for category, weight_g, length, width, height in rows:
        if category and weight_g and length and width and height:
            totals.setdefault(category, []).append(weight_g / (length * width * height))
    return {category: sum(values) / len(values) for category, values in totals.items()}


@dataclass
class Unpackable:
    line_id: str
    qty: int
    reason: str


@dataclass
class PackingResult:
    boxes: list[BoxState]
    unpacked: list[Unpackable]
    estimated_line_ids: list[str]


def _fits_box(item: ItemSpec, spec: BoxSpec) -> bool:
    return any(all(unit[a] <= spec.inner[a] + EPS for a in range(3)) for unit in item.orientations)


def _fits_any_box(item: ItemSpec, specs: list[BoxSpec]) -> str | None:
    if not any(_fits_box(item, spec) for spec in specs):
        return "too tall to stand upright in any box" if item.upright else "larger than every box"
    if not any(item.unit_kg <= spec.max_kg - spec.tare_kg + EPS for spec in specs):
        return "heavier than every box allows"
    return None


def auto_pack(
    lines: list[InvoiceLine], specs: list[BoxSpec], divisor: int, density_by_category: dict[str, float]
) -> PackingResult:
    items: list[ItemSpec] = []
    estimated: list[str] = []
    unpacked: list[Unpackable] = []
    remaining: Counter[str] = Counter()
    for line in lines:
        if line.qty <= 0:
            continue
        dims, is_estimated = estimate_dims(line, density_by_category)
        item = ItemSpec(line.id, dims, (line.weight_g or 0) / GRAMS_PER_KG, is_estimated, line.keep_upright)
        if is_estimated:
            estimated.append(line.id)
        reason = _fits_any_box(item, specs)
        if reason:
            unpacked.append(Unpackable(line.id, line.qty, reason))
            continue
        items.append(item)
        remaining[line.id] = line.qty
    items.sort(key=lambda i: (i.volume, i.unit_kg), reverse=True)
    ordered_qty = Counter(remaining)

    boxes: list[BoxState] = []
    while sum(remaining.values()) > 0:
        started = [i for i in items if 0 < remaining[i.line_id] < ordered_qty[i.line_id]]
        fresh = [i for i in items if remaining[i.line_id] == ordered_qty[i.line_id]]
        live = started + fresh
        candidates = [state for state in (simulate_box(spec, live, remaining) for spec in specs) if state.blocks]
        if not candidates:
            break
        chosen = _choose(candidates, remaining, divisor)
        for block in chosen.blocks:
            remaining[block.line_id] -= block.count
        boxes.append(chosen)

    unpacked += [Unpackable(line_id, qty, "no space left in any box") for line_id, qty in remaining.items() if qty > 0]
    return PackingResult(boxes=boxes, unpacked=unpacked, estimated_line_ids=estimated)


def _choose(candidates: list[BoxState], remaining: Counter[str], divisor: int) -> BoxState:
    total_left = sum(remaining.values())
    complete = [state for state in candidates if sum(block.count for block in state.blocks) == total_left]
    if complete:
        return min(complete, key=lambda s: (s.chargeable_kg(divisor), s.spec.volume))
    return min(candidates, key=lambda s: (_overhead(s, divisor), -s.content_kg))


def _overhead(state: BoxState, divisor: int) -> float:
    """Chargeable kg paid per kg of 'useful' cargo (actual or volumetric, whichever is larger); 1.0 means no waste."""
    useful = max(state.content_kg, state.used_volume / divisor)
    return state.chargeable_kg(divisor) / max(useful, EPS)


def to_box(state: BoxState) -> Box:
    quantities: Counter[str] = Counter()
    for block in state.blocks:
        quantities[block.line_id] += block.count
    length, width, height = state.spec.inner
    return Box(
        box_type_id=state.spec.id,
        box_type_name=state.spec.name,
        length_cm=length,
        width_cm=width,
        height_cm=height,
        gross_weight_kg=round(state.gross_kg, 2),
        items=[BoxItem(line_id=line_id, qty=qty) for line_id, qty in quantities.items()],
        placements=[
            Placement(
                line_id=block.line_id,
                x=block.origin[0],
                y=block.origin[1],
                z=block.origin[2],
                dx=block.unit[0],
                dy=block.unit[1],
                dz=block.unit[2],
                nx=block.counts[0],
                ny=block.counts[1],
                nz=block.counts[2],
            )
            for block in state.blocks
        ],
    )
