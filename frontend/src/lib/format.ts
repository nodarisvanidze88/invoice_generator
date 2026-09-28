const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const decimal2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const upTo4 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

export function formatAmount(value: number, symbol = "¥"): string {
  const rounded = Math.round(value * 100) / 100;
  return `${symbol}${Number.isInteger(rounded) ? integer.format(rounded) : decimal2.format(rounded)}`;
}

export function formatPrice(value: number | null | undefined): string {
  return value == null ? "—" : upTo4.format(value);
}

export function formatKg(value: number): string {
  return `${decimal2.format(value)} kg`;
}

export function formatInt(value: number): string {
  return integer.format(value);
}

export function formatDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function todayIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}
