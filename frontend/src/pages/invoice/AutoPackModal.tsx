import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, ArrowUp, Boxes, Ruler, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { api } from "../../api/client";
import { keys, useAutoPack, useBoxTypes, useProducts } from "../../api/hooks";
import type { AutoPackResult, InvoiceDocument, InvoiceLine, Product } from "../../api/types";
import { Badge, Button, Input, Modal } from "../../components/ui";
import { formatInt, formatKg, formatPrice, parseOptionalNumber } from "../../lib/format";
import { lineDescription } from "../../lib/invoice";
import type { UpdateDoc } from "./InvoiceEditorPage";

type Dims = [string, string, string];
const DIM_LABELS = ["L", "W", "H"] as const;

const hasSize = (line: InvoiceLine) => Boolean(line.length_cm && line.width_cm && line.height_cm);

function summarise(result: AutoPackResult) {
  const byType = new Map<string, number>();
  let gross = 0;
  let volumetric = 0;
  let chargeable = 0;
  let fillSum = 0;
  for (const box of result.boxes) {
    const volume = (box.length_cm ?? 0) * (box.width_cm ?? 0) * (box.height_cm ?? 0);
    const used = box.placements.reduce((sum, p) => sum + p.dx * p.dy * p.dz * p.nx * p.ny * p.nz, 0);
    const boxVolumetric = volume / result.volumetric_divisor;
    byType.set(box.box_type_name, (byType.get(box.box_type_name) ?? 0) + 1);
    gross += box.gross_weight_kg ?? 0;
    volumetric += boxVolumetric;
    chargeable += Math.max(box.gross_weight_kg ?? 0, boxVolumetric);
    fillSum += volume ? used / volume : 0;
  }
  return { byType: [...byType.entries()], gross, volumetric, chargeable, fill: result.boxes.length ? fillSum / result.boxes.length : 0 };
}

export function AutoPackModal({
  open,
  onClose,
  doc,
  updateDoc,
}: {
  open: boolean;
  onClose: () => void;
  doc: InvoiceDocument;
  updateDoc: UpdateDoc;
}) {
  const boxTypes = useBoxTypes();
  const products = useProducts();
  const autoPack = useAutoPack();
  const queryClient = useQueryClient();
  const [selectedTypes, setSelectedTypes] = useState<number[]>([]);
  const [sizes, setSizes] = useState<Record<string, Dims>>({});
  const [upright, setUpright] = useState<Record<string, boolean>>({});
  const [saveToCatalogue, setSaveToCatalogue] = useState(true);
  const [result, setResult] = useState<AutoPackResult | null>(null);
  const [applying, setApplying] = useState(false);

  const missing = useMemo(() => doc.lines.filter((line) => line.qty > 0 && !hasSize(line)), [doc.lines]);
  const linesById = useMemo(() => new Map(doc.lines.map((line) => [line.id, line])), [doc.lines]);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setSizes({});
    setUpright({});
    setSelectedTypes((boxTypes.data ?? []).filter((bt) => bt.active).map((bt) => bt.id));
  }, [open, boxTypes.data]);

  const enteredSize = (lineId: string): [number, number, number] | null => {
    const values = (sizes[lineId] ?? ["", "", ""]).map(parseOptionalNumber);
    return values.every((v) => v !== null && v > 0) ? (values as [number, number, number]) : null;
  };

  const linesWithSizes = (): InvoiceLine[] =>
    doc.lines.map((line) => {
      const size = enteredSize(line.id);
      const sized = size ? { ...line, length_cm: size[0], width_cm: size[1], height_cm: size[2] } : line;
      return line.id in upright ? { ...sized, keep_upright: upright[line.id] } : sized;
    });

  const run = () => {
    autoPack.mutate(
      { lines: linesWithSizes(), box_type_ids: selectedTypes },
      { onSuccess: setResult, onError: (error) => toast.error(error.message) },
    );
  };

  const saveSizesToCatalogue = async () => {
    const byId = new Map((products.data ?? []).map((p) => [p.id, p]));
    const updates = doc.lines.flatMap((line) => {
      const size = enteredSize(line.id);
      const product = line.product_id ? byId.get(line.product_id) : undefined;
      return (size || line.id in upright) && product ? [{ product, size, keepUpright: upright[line.id] ?? product.keep_upright }] : [];
    });
    await Promise.all(
      updates.map(({ product, size, keepUpright }: { product: Product; size: [number, number, number] | null; keepUpright: boolean }) => {
        const { id, updated_at: _updated, ...fields } = product;
        const dims = size ? { length_cm: size[0], width_cm: size[1], height_cm: size[2] } : {};
        return api.put(`/api/products/${id}`, { ...fields, ...dims, keep_upright: keepUpright });
      }),
    );
    if (updates.length) await queryClient.invalidateQueries({ queryKey: keys.products });
    return updates.length;
  };

  const apply = async () => {
    if (!result) return;
    setApplying(true);
    try {
      const saved = saveToCatalogue ? await saveSizesToCatalogue() : 0;
      const lines = linesWithSizes();
      updateDoc((d) => ({ ...d, lines, boxes: result.boxes }));
      toast.success(`${result.boxes.length} boxes packed${saved ? ` · ${saved} product sizes saved` : ""}. Don't forget to save the invoice.`);
      onClose();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setApplying(false);
    }
  };

  const summary = result ? summarise(result) : null;
  const estimatedCount = result?.estimated_line_ids.length ?? 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={result ? "Packing proposal" : "Auto-pack"}
      description={
        result
          ? "Review the result. Applying replaces the current boxes — you can still edit everything afterwards."
          : "Packs every item in 3D (all orientations), respects box weight limits and picks box sizes that minimise DHL chargeable weight."
      }
      footer={
        result ? (
          <>
            <Button variant="secondary" icon={<ArrowLeft className="size-4" />} onClick={() => setResult(null)}>
              Back
            </Button>
            <Button icon={<Boxes className="size-4" />} loading={applying} onClick={apply} disabled={!result.boxes.length}>
              Apply {result.boxes.length} boxes
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button icon={<Sparkles className="size-4" />} loading={autoPack.isPending} onClick={run} disabled={!selectedTypes.length}>
              {autoPack.isPending ? "Packing…" : "Run auto-pack"}
            </Button>
          </>
        )
      }
    >
      {!result ? (
        <div className="space-y-6">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Box types to use</h3>
            {boxTypes.data?.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {boxTypes.data.map((bt) => (
                  <label key={bt.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 ring-1 ring-slate-200 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      className="size-4 accent-brand-600"
                      checked={selectedTypes.includes(bt.id)}
                      onChange={(e) => setSelectedTypes((prev) => (e.target.checked ? [...prev, bt.id] : prev.filter((id) => id !== bt.id)))}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">{bt.name}</span>
                      <span className="block text-xs text-slate-500">
                        {formatPrice(bt.length_cm)}×{formatPrice(bt.width_cm)}×{formatPrice(bt.height_cm)} cm · max {formatPrice(bt.max_weight_kg)} kg
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No box types yet — add them on the Box types page.</p>
            )}
          </section>

          {missing.length > 0 && (
            <section>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Ruler className="size-4 text-amber-500" /> {missing.length} products have no size
                </h3>
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" className="size-4 accent-brand-600" checked={saveToCatalogue} onChange={(e) => setSaveToCatalogue(e.target.checked)} />
                  Save entered sizes to the product catalogue
                </label>
              </div>
              <p className="mb-3 text-xs text-slate-500">
                Enter the size of one piece (cm) and tap <ArrowUp className="inline size-3.5" /> for items that must stay upright. Empty rows are estimated from weight and the category's average density — the result will be marked as
                estimated.
              </p>
              <ul className="scrollbar-thin max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg ring-1 ring-slate-200">
                {missing.map((line) => (
                  <li key={line.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-700" title={lineDescription(line)}>
                      {line.name}
                      <span className="ml-1 text-slate-400">· {line.weight_g ?? "?"} g</span>
                    </span>
                    <button
                      type="button"
                      title="Keep upright (this side up)"
                      aria-pressed={upright[line.id] ?? line.keep_upright}
                      onClick={() => setUpright((prev) => ({ ...prev, [line.id]: !(prev[line.id] ?? line.keep_upright) }))}
                      className={
                        (upright[line.id] ?? line.keep_upright)
                          ? "flex size-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700"
                          : "flex size-8 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-100 hover:text-slate-500"
                      }
                    >
                      <ArrowUp className="size-4" />
                    </button>
                    {DIM_LABELS.map((label, axis) => (
                      <Input
                        key={label}
                        aria-label={`${label} (cm)`}
                        placeholder={label}
                        inputMode="decimal"
                        value={sizes[line.id]?.[axis] ?? ""}
                        onChange={(e) =>
                          setSizes((prev) => {
                            const next = [...(prev[line.id] ?? ["", "", ""])] as Dims;
                            next[axis] = e.target.value;
                            return { ...prev, [line.id]: next };
                          })
                        }
                        className="h-8 w-14 px-1.5 text-center text-xs"
                      />
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {doc.boxes.length > 0 && (
            <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="size-4" /> The current {doc.boxes.length} boxes will be replaced when you apply the result.
            </p>
          )}
        </div>
      ) : (
        summary && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-slate-200 ring-1 ring-slate-200 sm:grid-cols-4">
              {[
                { label: "Boxes", value: formatInt(result.boxes.length) },
                { label: "Gross weight", value: formatKg(summary.gross) },
                { label: "Chargeable (DHL)", value: formatKg(summary.chargeable) },
                { label: "Average fill", value: `${Math.round(summary.fill * 100)}%` },
              ].map((stat) => (
                <div key={stat.label} className="bg-white px-4 py-3">
                  <div className="text-xs text-slate-500">{stat.label}</div>
                  <div className="mt-0.5 font-semibold tabular-nums text-slate-900">{stat.value}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {summary.byType.map(([name, count]) => (
                <Badge key={name} tone="brand">
                  {count} × {name}
                </Badge>
              ))}
              <Badge>volumetric {formatKg(summary.volumetric)}</Badge>
            </div>
            {summary.gross >= summary.volumetric && (
              <p className="text-xs text-slate-500">Boxes are limited by weight rather than volume — chargeable weight equals the actual gross weight.</p>
            )}
            {estimatedCount > 0 && (
              <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <Ruler className="mt-0.5 size-4 shrink-0" />
                {estimatedCount} products were packed with sizes estimated from their weight. Add real sizes (product form or Import Excel) for an exact
                result.
              </p>
            )}
            {result.unpacked.length > 0 && (
              <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
                <p className="mb-1 flex items-center gap-2 font-medium">
                  <AlertTriangle className="size-4" /> Could not be packed automatically:
                </p>
                <ul className="list-disc space-y-0.5 pl-6">
                  {result.unpacked.map((u) => (
                    <li key={u.line_id}>
                      {linesById.get(u.line_id)?.name ?? u.line_id} — {formatInt(u.qty)} pcs ({u.reason})
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )
      )}
    </Modal>
  );
}
