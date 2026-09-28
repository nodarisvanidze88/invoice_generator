import clsx from "clsx";
import { ClipboardList, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState, type FormEvent } from "react";

import { useProducts } from "../../api/hooks";
import type { InvoiceDocument, InvoiceLine } from "../../api/types";
import { Badge, Button, Card, EmptyState, Field, IconButton, Input, Modal } from "../../components/ui";
import { formatAmount, formatInt, formatKg, formatPrice, parseOptionalNumber } from "../../lib/format";
import { groupLines, lineAmount, lineDescription, lineFromProduct, lineNetKg } from "../../lib/invoice";
import type { UpdateDoc } from "./InvoiceEditorPage";

const SEARCH_LIMIT = 40;

function NumberCell({
  value,
  onCommit,
  className,
  label,
}: {
  value: number | null;
  onCommit: (value: number | null) => void;
  className?: string;
  label: string;
}) {
  const [text, setText] = useState(value?.toString() ?? "");
  useEffect(() => setText(value?.toString() ?? ""), [value]);
  return (
    <Input
      aria-label={label}
      value={text}
      inputMode="decimal"
      onChange={(event) => setText(event.target.value)}
      onBlur={() => onCommit(parseOptionalNumber(text))}
      onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
      className={clsx("h-8 text-right tabular-nums", className)}
    />
  );
}

function LineEditModal({
  line,
  onClose,
  onSave,
}: {
  line: InvoiceLine | null;
  onClose: () => void;
  onSave: (line: InvoiceLine) => void;
}) {
  const [form, setForm] = useState<InvoiceLine | null>(line);
  useEffect(() => setForm(line), [line]);
  if (!form) return null;
  const set = (key: keyof InvoiceLine) => (event: { target: { value: string } }) =>
    setForm({ ...form, [key]: event.target.value });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave(form);
  };
  return (
    <Modal
      open={line !== null}
      onClose={onClose}
      title="Edit invoice line"
      description="Changes apply to this invoice only, not to the product catalogue."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="line-form" disabled={!form.name.trim()}>
            Apply
          </Button>
        </>
      }
    >
      <form id="line-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-6">
        <Field label="JAN / Code" className="sm:col-span-2">
          <Input value={form.code} onChange={set("code")} />
        </Field>
        <Field label="Name" className="sm:col-span-4">
          <Input value={form.name} onChange={set("name")} />
        </Field>
        <Field label="Material" className="sm:col-span-2">
          <Input value={form.material} onChange={set("material")} />
        </Field>
        <Field label="Origin" className="sm:col-span-2">
          <Input value={form.origin} onChange={set("origin")} />
        </Field>
        <Field label="Weight (g)" className="sm:col-span-2">
          <Input
            value={form.weight_g ?? ""}
            inputMode="decimal"
            onChange={(e) => setForm({ ...form, weight_g: parseOptionalNumber(e.target.value) })}
          />
        </Field>
        <Field label="Category" className="sm:col-span-4">
          <Input value={form.category} onChange={set("category")} />
        </Field>
        <Field label="Tariff code" className="sm:col-span-2">
          <Input value={form.tariff_code} onChange={set("tariff_code")} className="font-mono" />
        </Field>
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 sm:col-span-6">
          Printed as: <span className="font-medium text-slate-700">{lineDescription(form)}</span>
        </div>
      </form>
    </Modal>
  );
}

function AddProductsModal({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (lines: InvoiceLine[]) => void }) {
  const products = useProducts();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Record<number, number>>({});
  const needle = useDeferredValue(search.trim().toLowerCase());

  useEffect(() => {
    if (open) {
      setSearch("");
      setPicked({});
    }
  }, [open]);

  const results = useMemo(() => {
    const all = products.data ?? [];
    const matches = needle
      ? all.filter((p) => `${p.code} ${p.name} ${p.category}`.toLowerCase().includes(needle))
      : all;
    return matches.slice(0, SEARCH_LIMIT);
  }, [products.data, needle]);

  const pickedCount = Object.values(picked).filter((q) => q > 0).length;

  const submit = () => {
    const byId = new Map((products.data ?? []).map((p) => [p.id, p]));
    const lines = Object.entries(picked)
      .filter(([, qty]) => qty > 0)
      .flatMap(([id, qty]) => {
        const product = byId.get(Number(id));
        return product ? [lineFromProduct(product, qty)] : [];
      });
    onAdd(lines);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add products to invoice"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!pickedCount}>
            Add {pickedCount || ""} {pickedCount === 1 ? "product" : "products"}
          </Button>
        </>
      }
    >
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…" className="pl-9" />
      </div>
      <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
        {results.map((product) => (
          <li key={product.id} className="flex items-center gap-3 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-900">{product.name}</div>
              <div className="truncate text-xs text-slate-400">
                <span className="font-mono">{product.code}</span> · {product.category} · {formatPrice(product.unit_price)}
              </div>
            </div>
            <Input
              type="number"
              min={0}
              placeholder="Qty"
              aria-label={`Quantity for ${product.name}`}
              value={picked[product.id] || ""}
              onChange={(e) => setPicked({ ...picked, [product.id]: Number(e.target.value) })}
              className="h-8 w-24 text-center"
            />
          </li>
        ))}
      </ul>
      {results.length === SEARCH_LIMIT && <p className="mt-2 text-xs text-slate-400">Showing first {SEARCH_LIMIT} matches — refine your search.</p>}
    </Modal>
  );
}

export function ItemsTab({ doc, updateDoc }: { doc: InvoiceDocument; updateDoc: UpdateDoc }) {
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<InvoiceLine | null>(null);
  const groups = useMemo(() => groupLines(doc.lines), [doc.lines]);

  const patchLine = (lineId: string, patch: Partial<InvoiceLine>) =>
    updateDoc((d) => ({ ...d, lines: d.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) }));

  const removeLine = (lineId: string) =>
    updateDoc((d) => ({
      ...d,
      lines: d.lines.filter((l) => l.id !== lineId),
      boxes: d.boxes.map((b) => ({ ...b, items: b.items.filter((i) => i.line_id !== lineId) })),
    }));

  const addLines = (lines: InvoiceLine[]) => {
    updateDoc((d) => {
      const next = [...d.lines];
      for (const line of lines) {
        const existing = next.findIndex((l) => l.product_id !== null && l.product_id === line.product_id);
        if (existing >= 0) next[existing] = { ...next[existing], qty: next[existing].qty + line.qty };
        else next.push(line);
      }
      return { ...d, lines: next };
    });
    setAddOpen(false);
  };

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4">
        <p className="text-sm text-slate-500">
          Lines are grouped by <b className="text-slate-700">Category [Tariff]</b>, exactly as on the printed invoice.
        </p>
        <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setAddOpen(true)}>
          Add products
        </Button>
      </div>
      {doc.lines.length === 0 ? (
        <EmptyState icon={<ClipboardList className="size-5" />} title="No items yet" description="Add products to this invoice." />
      ) : (
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Description</th>
                <th className="px-3 py-3 text-right">Net weight</th>
                <th className="w-28 px-3 py-3 text-right">Qty</th>
                <th className="w-32 px-3 py-3 text-right">Unit price</th>
                <th className="px-3 py-3 text-right">Amount</th>
                <th className="w-24 px-3 py-3" />
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group.label} className="border-b border-slate-100 last:border-0">
                <tr className="bg-slate-50/80">
                  <td className="px-4 py-2 font-semibold text-slate-800">
                    {group.label}
                    <Badge className="ml-2">{group.lines.length}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatKg(group.netKg)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatInt(group.qty)}</td>
                  <td />
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatAmount(group.amount)}</td>
                  <td />
                </tr>
                {group.lines.map((line) => (
                  <tr key={line.id} className="hover:bg-slate-50/60">
                    <td className="max-w-[460px] py-1.5 pl-8 pr-3 text-slate-600">
                      <div className="truncate" title={lineDescription(line)}>
                        {lineDescription(line)}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{formatKg(lineNetKg(line))}</td>
                    <td className="px-3 py-1.5">
                      <NumberCell
                        label="Quantity"
                        value={line.qty}
                        onCommit={(v) => patchLine(line.id, { qty: Math.max(0, Math.floor(v ?? 0)) })}
                        className={line.qty === 0 ? "ring-rose-400" : undefined}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <NumberCell label="Unit price" value={line.unit_price} onCommit={(v) => patchLine(line.id, { unit_price: v })} />
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatAmount(lineAmount(line))}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex justify-end gap-0.5">
                        <IconButton label="Edit line" onClick={() => setEditing(line)}>
                          <Pencil className="size-4" />
                        </IconButton>
                        <IconButton label="Remove line" tone="danger" onClick={() => removeLine(line.id)}>
                          <Trash2 className="size-4" />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
      <AddProductsModal open={addOpen} onClose={() => setAddOpen(false)} onAdd={addLines} />
      <LineEditModal
        line={editing}
        onClose={() => setEditing(null)}
        onSave={(line) => {
          patchLine(line.id, line);
          setEditing(null);
        }}
      />
    </Card>
  );
}
