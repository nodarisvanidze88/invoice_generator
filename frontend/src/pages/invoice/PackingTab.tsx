import clsx from "clsx";
import { AlertTriangle, ArrowRight, Box as BoxIcon, CheckCircle2, ChevronDown, Copy, PackagePlus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import type { Box, InvoiceDocument, InvoiceLine } from "../../api/types";
import { Badge, Button, Card, EmptyState, IconButton, Input } from "../../components/ui";
import { formatInt, formatKg, parseOptionalNumber } from "../../lib/format";
import { boxNetKg, lineDescription, newId, remainingByLine } from "../../lib/invoice";
import type { UpdateDoc } from "./InvoiceEditorPage";

const DEFAULT_BOX = { length_cm: 64, width_cm: 43, height_cm: 52 };

function makeBox(template?: Box): Box {
  return {
    id: newId(),
    length_cm: template?.length_cm ?? DEFAULT_BOX.length_cm,
    width_cm: template?.width_cm ?? DEFAULT_BOX.width_cm,
    height_cm: template?.height_cm ?? DEFAULT_BOX.height_cm,
    gross_weight_kg: null,
    items: [],
  };
}

function DimInput({ value, onChange, label }: { value: number | null; onChange: (v: number | null) => void; label: string }) {
  return (
    <Input
      aria-label={label}
      title={label}
      placeholder={label}
      value={value ?? ""}
      inputMode="decimal"
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(parseOptionalNumber(e.target.value))}
      className="h-8 w-14 px-1.5 text-center text-xs tabular-nums"
    />
  );
}

export function PackingTab({ doc, updateDoc }: { doc: InvoiceDocument; updateDoc: UpdateDoc }) {
  const [activeId, setActiveId] = useState<string | null>(doc.boxes[0]?.id ?? null);
  const [pending, setPending] = useState<Record<string, string>>({});

  const linesById = useMemo(() => new Map(doc.lines.map((l) => [l.id, l])), [doc.lines]);
  const remaining = useMemo(() => remainingByLine(doc), [doc]);
  const outstanding = doc.lines.filter((line) => (remaining.get(line.id) ?? 0) !== 0);
  const activeIndex = doc.boxes.findIndex((b) => b.id === activeId);
  const activeBox = activeIndex >= 0 ? doc.boxes[activeIndex] : null;

  const patchBox = (boxId: string, patch: Partial<Box>) =>
    updateDoc((d) => ({ ...d, boxes: d.boxes.map((b) => (b.id === boxId ? { ...b, ...patch } : b)) }));

  const addBox = (template?: Box) => {
    const box = makeBox(template ?? doc.boxes.at(-1));
    updateDoc((d) => ({ ...d, boxes: [...d.boxes, box] }));
    setActiveId(box.id);
  };

  const removeBox = (boxId: string) => {
    updateDoc((d) => ({ ...d, boxes: d.boxes.filter((b) => b.id !== boxId) }));
    if (activeId === boxId) setActiveId(null);
  };

  const setItemQty = (boxId: string, lineId: string, qty: number) =>
    updateDoc((d) => ({
      ...d,
      boxes: d.boxes.map((b) => {
        if (b.id !== boxId) return b;
        const items = qty > 0 ? b.items.map((i) => (i.line_id === lineId ? { ...i, qty } : i)) : b.items.filter((i) => i.line_id !== lineId);
        return { ...b, items };
      }),
    }));

  const packIntoActive = (line: InvoiceLine, qty: number) => {
    if (!activeBox || qty <= 0) return;
    updateDoc((d) => ({
      ...d,
      boxes: d.boxes.map((b) => {
        if (b.id !== activeBox.id) return b;
        const existing = b.items.find((i) => i.line_id === line.id);
        const items = existing
          ? b.items.map((i) => (i.line_id === line.id ? { ...i, qty: i.qty + qty } : i))
          : [...b.items, { line_id: line.id, qty }];
        return { ...b, items };
      }),
    }));
    setPending((p) => ({ ...p, [line.id]: "" }));
  };

  const packAllIntoActive = () => {
    if (!activeBox) return;
    for (const line of outstanding) {
      const left = remaining.get(line.id) ?? 0;
      if (left > 0) packIntoActive(line, left);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            Click a box to open it, then add items from the <b className="text-slate-700">Unpacked</b> panel.
          </p>
          <Button size="sm" icon={<PackagePlus className="size-4" />} onClick={() => addBox()}>
            Add box
          </Button>
        </div>

        {doc.boxes.length === 0 && (
          <Card>
            <EmptyState
              icon={<BoxIcon className="size-5" />}
              title="No boxes yet"
              description="Create the first box. Dimensions default to 64 × 43 × 52 cm."
              action={
                <Button size="sm" icon={<PackagePlus className="size-4" />} onClick={() => addBox()}>
                  Add first box
                </Button>
              }
            />
          </Card>
        )}

        {doc.boxes.map((box, index) => {
          const active = box.id === activeId;
          const net = boxNetKg(box, linesById);
          const qty = box.items.reduce((sum, i) => sum + i.qty, 0);
          const tooLight = box.gross_weight_kg != null && box.gross_weight_kg > 0 && box.gross_weight_kg < net;
          return (
            <Card key={box.id} className={clsx("transition-shadow", active && "ring-2 ring-brand-500")}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setActiveId(active ? null : box.id)}
                onKeyDown={(e) => e.key === "Enter" && setActiveId(active ? null : box.id)}
                className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3"
              >
                <div
                  className={clsx(
                    "flex size-9 items-center justify-center rounded-lg text-sm font-semibold",
                    active ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600",
                  )}
                >
                  {index + 1}
                </div>
                <div className="min-w-[120px] flex-1">
                  <div className="text-sm font-semibold text-slate-900">Box {index + 1}</div>
                  <div className="text-xs text-slate-500">
                    {box.items.length} items · {formatInt(qty)} pcs · net {formatKg(net)}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-400">
                  <DimInput label="L" value={box.length_cm} onChange={(v) => patchBox(box.id, { length_cm: v })} />×
                  <DimInput label="W" value={box.width_cm} onChange={(v) => patchBox(box.id, { width_cm: v })} />×
                  <DimInput label="H" value={box.height_cm} onChange={(v) => patchBox(box.id, { height_cm: v })} />
                  <span className="mr-2">cm</span>
                  <Input
                    aria-label="Gross weight (kg)"
                    title={tooLight ? `Gross weight is lower than the net weight of the contents (${formatKg(net)})` : "Gross weight (kg)"}
                    placeholder="Gross"
                    value={box.gross_weight_kg ?? ""}
                    inputMode="decimal"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => patchBox(box.id, { gross_weight_kg: parseOptionalNumber(e.target.value) })}
                    className={clsx("h-8 w-20 text-right text-xs tabular-nums", tooLight && "ring-amber-400")}
                  />
                  <span>kg</span>
                </div>
                <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                  <IconButton label="Duplicate box size" onClick={() => addBox(box)}>
                    <Copy className="size-4" />
                  </IconButton>
                  <IconButton label="Delete box" tone="danger" onClick={() => removeBox(box.id)}>
                    <Trash2 className="size-4" />
                  </IconButton>
                  <ChevronDown className={clsx("ml-1 size-4 text-slate-400 transition-transform", active && "rotate-180")} />
                </div>
              </div>
              {active && tooLight && (
                <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  <AlertTriangle className="size-3.5" /> Gross weight is lower than the net weight of its contents ({formatKg(net)}) — check
                  product weights.
                </div>
              )}
              {active && (
                <div className="border-t border-slate-100">
                  {box.items.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-slate-400">Empty box — add items from the Unpacked panel →</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {box.items.map((item) => {
                        const line = linesById.get(item.line_id);
                        return (
                          <li key={item.line_id} className="flex items-center gap-3 px-4 py-1.5 text-sm">
                            <span className="min-w-0 flex-1 truncate text-slate-600" title={line ? lineDescription(line) : ""}>
                              {line ? lineDescription(line) : "Unknown line"}
                            </span>
                            <Input
                              type="number"
                              min={0}
                              aria-label="Quantity in box"
                              value={item.qty}
                              onChange={(e) => setItemQty(box.id, item.line_id, Number(e.target.value))}
                              className="h-8 w-20 text-center tabular-nums"
                            />
                            <IconButton label="Remove from box" tone="danger" onClick={() => setItemQty(box.id, item.line_id, 0)}>
                              <Trash2 className="size-4" />
                            </IconButton>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Unpacked</h3>
              <p className="text-xs text-slate-500">
                {activeBox ? (
                  <>
                    Adding to <b className="text-brand-700">Box {activeIndex + 1}</b>
                  </>
                ) : (
                  "Open a box to add items"
                )}
              </p>
            </div>
            {outstanding.length > 0 && (
              <Button size="sm" variant="subtle" disabled={!activeBox} onClick={packAllIntoActive}>
                Pack all
              </Button>
            )}
          </div>
          {outstanding.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <CheckCircle2 className="size-8 text-emerald-500" />
              <p className="text-sm font-medium text-slate-800">Everything is packed</p>
              <p className="text-xs text-slate-500">Box quantities match the invoice exactly.</p>
            </div>
          ) : (
            <ul className="scrollbar-thin max-h-[65vh] divide-y divide-slate-100 overflow-y-auto">
              {outstanding.map((line) => {
                const left = remaining.get(line.id) ?? 0;
                if (left < 0) {
                  return (
                    <li key={line.id} className="px-4 py-2.5">
                      <div className="truncate text-sm text-slate-700">{line.name}</div>
                      <Badge tone="rose" className="mt-1">
                        Over-packed by {formatInt(-left)} — reduce in boxes
                      </Badge>
                    </li>
                  );
                }
                const pendingQty = pending[line.id] ?? "";
                return (
                  <li key={line.id} className="flex items-center gap-2 px-4 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-slate-700" title={lineDescription(line)}>
                        {line.name}
                      </div>
                      <div className="text-xs text-amber-600">{formatInt(left)} left</div>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      max={left}
                      placeholder={String(left)}
                      aria-label="Quantity to pack"
                      value={pendingQty}
                      onChange={(e) => setPending((p) => ({ ...p, [line.id]: e.target.value }))}
                      className="h-8 w-16 text-center text-xs tabular-nums"
                    />
                    <IconButton
                      label="Add to open box"
                      disabled={!activeBox}
                      onClick={() => packIntoActive(line, Math.min(left, Number(pendingQty) || left))}
                      className="bg-brand-50 text-brand-600 hover:bg-brand-100 hover:text-brand-700"
                    >
                      <ArrowRight className="size-4" />
                    </IconButton>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
