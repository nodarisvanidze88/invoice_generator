import type { Box, InvoiceDocument, InvoiceLine, Product } from "../api/types";

const GRAMS_PER_KG = 1000;
const UNCATEGORIZED = "Uncategorized";

export function groupLabel(category: string, tariff: string): string {
  const label = category.trim() || UNCATEGORIZED;
  return tariff.trim() ? `${label} [${tariff.trim()}]` : label;
}

export function lineDescription(line: Pick<InvoiceLine, "code" | "name" | "material" | "origin">): string {
  const head = [line.code.trim(), line.name.trim()].filter(Boolean).join(" ");
  const tags = [line.material, line.origin]
    .filter((tag) => tag?.trim())
    .map((tag) => ` [${tag.trim()}]`)
    .join("");
  return head + tags;
}

export const lineNetKg = (line: Pick<InvoiceLine, "weight_g" | "qty">) => ((line.weight_g ?? 0) * line.qty) / GRAMS_PER_KG;
export const lineAmount = (line: Pick<InvoiceLine, "unit_price" | "qty">) => (line.unit_price ?? 0) * line.qty;

export interface LineGroup {
  label: string;
  lines: InvoiceLine[];
  netKg: number;
  qty: number;
  amount: number;
}

export function groupLines(lines: InvoiceLine[]): LineGroup[] {
  const groups = new Map<string, LineGroup>();
  for (const line of lines) {
    const label = groupLabel(line.category, line.tariff_code);
    let group = groups.get(label);
    if (!group) {
      group = { label, lines: [], netKg: 0, qty: 0, amount: 0 };
      groups.set(label, group);
    }
    group.lines.push(line);
    group.netKg += lineNetKg(line);
    group.qty += line.qty;
    group.amount += lineAmount(line);
  }
  return [...groups.values()];
}

export function packedByLine(boxes: Box[]): Map<string, number> {
  const packed = new Map<string, number>();
  for (const box of boxes) {
    for (const item of box.items) packed.set(item.line_id, (packed.get(item.line_id) ?? 0) + item.qty);
  }
  return packed;
}

export function remainingByLine(doc: Pick<InvoiceDocument, "lines" | "boxes">): Map<string, number> {
  const packed = packedByLine(doc.boxes);
  return new Map(doc.lines.map((line) => [line.id, line.qty - (packed.get(line.id) ?? 0)]));
}

export function boxNetKg(box: Box, linesById: Map<string, InvoiceLine>): number {
  return box.items.reduce((sum, item) => {
    const line = linesById.get(item.line_id);
    return sum + ((line?.weight_g ?? 0) * item.qty) / GRAMS_PER_KG;
  }, 0);
}

export interface DocTotals {
  netKg: number;
  qty: number;
  amount: number;
  grossKg: number;
  pieces: number;
  unpacked: number;
  mismatched: number;
}

type TotalsSource = Pick<InvoiceDocument, "lines" | "boxes" | "pieces_override" | "gross_weight_override_kg">;

export function boxTotals(boxes: Box[]): { pieces: number; grossKg: number } {
  const used = boxes.filter((box) => box.items.length > 0 || (box.gross_weight_kg ?? 0) > 0);
  return { pieces: used.length, grossKg: used.reduce((sum, box) => sum + (box.gross_weight_kg ?? 0), 0) };
}

export function docTotals(doc: TotalsSource): DocTotals {
  const remaining = remainingByLine(doc);
  const active = doc.lines.filter((line) => line.qty > 0);
  const fromBoxes = boxTotals(doc.boxes);
  return {
    netKg: active.reduce((sum, line) => sum + lineNetKg(line), 0),
    qty: active.reduce((sum, line) => sum + line.qty, 0),
    amount: active.reduce((sum, line) => sum + lineAmount(line), 0),
    grossKg: doc.gross_weight_override_kg ?? fromBoxes.grossKg,
    pieces: doc.pieces_override ?? fromBoxes.pieces,
    unpacked: [...remaining.values()].reduce((sum, value) => sum + Math.max(value, 0), 0),
    mismatched: [...remaining.values()].filter((value) => value !== 0).length,
  };
}

export function newId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

export function lineFromProduct(product: Product, qty: number): InvoiceLine {
  return {
    id: newId(),
    product_id: product.id,
    code: product.code,
    name: product.name,
    material: product.material,
    origin: product.origin,
    weight_g: product.weight_g,
    unit_price: product.unit_price,
    category: product.category,
    tariff_code: product.tariff_code,
    qty,
  };
}
