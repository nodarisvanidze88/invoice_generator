import clsx from "clsx";
import { ArrowRight, CheckCircle2, FileSpreadsheet, RotateCcw, Sparkles, Upload } from "lucide-react";
import { useMemo, useRef, useState, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useApplyImport, usePreviewImport, useProducts } from "../api/hooks";
import type { ImportApplyRow, ImportPreview } from "../api/types";
import { Badge, Button, Card, Input, PageHeader } from "../components/ui";
import { formatInt, formatPrice, parseOptionalNumber } from "../lib/format";
import { useSelection } from "../store/selection";

interface EditableRow extends ImportApplyRow {
  include: boolean;
  status: "matched" | "new";
  previousPrice: number | null;
}

function buildRows(preview: ImportPreview): EditableRow[] {
  return preview.rows.map((row) => {
    const base = row.current ?? {
      code: row.code,
      name: row.csv_name,
      material: "",
      origin: "Japan",
      weight_g: null,
      unit_price: null,
      category: "",
      tariff_code: "",
    };
    return {
      ...base,
      code: row.code,
      product_id: row.product_id,
      unit_price: row.csv_unit_price ?? base.unit_price,
      qty: row.qty,
      include: true,
      status: row.status,
      previousPrice: row.current?.unit_price ?? null,
    };
  });
}

export function ImportPage() {
  const products = useProducts();
  const previewImport = usePreviewImport();
  const applyImport = useApplyImport();
  const mergeSelection = useSelection((state) => state.merge);
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [updatePrices, setUpdatePrices] = useState(true);
  const [addToSelection, setAddToSelection] = useState(true);
  const [dragging, setDragging] = useState(false);

  const tariffByCategory = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of products.data ?? []) if (p.category && p.tariff_code && !map.has(p.category)) map.set(p.category, p.tariff_code);
    return map;
  }, [products.data]);

  const upload = (file: File | undefined) => {
    if (!file) return;
    previewImport.mutate(file, {
      onSuccess: (data) => {
        setPreview(data);
        setRows(buildRows(data));
      },
      onError: (error) => toast.error(error.message),
    });
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    upload(event.dataTransfer.files[0]);
  };

  const patch = (index: number, changes: Partial<EditableRow>) =>
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...changes } : row)));

  const included = rows.filter((row) => row.include);
  const invalid = included.filter((row) => !row.name.trim()).length;

  const apply = () => {
    applyImport.mutate(
      {
        update_prices: updatePrices,
        rows: included.map(({ include: _i, status: _s, previousPrice: _p, ...row }) => row),
      },
      {
        onSuccess: (result) => {
          toast.success(`Import complete — ${result.created} added, ${result.updated} updated`);
          if (addToSelection && result.selection.length) {
            mergeSelection(result.selection);
            navigate("/products");
          } else {
            reset();
          }
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  const reset = () => {
    setPreview(null);
    setRows([]);
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <div>
      <PageHeader
        title="Import supplier CSV"
        description="Upload an order export (Japanese or English headers). Rows are matched to your catalogue by JAN code."
        actions={
          preview && (
            <Button variant="secondary" icon={<RotateCcw className="size-4" />} onClick={reset}>
              Start over
            </Button>
          )
        }
      />

      {!preview ? (
        <Card className="p-6">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={clsx(
              "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-16 text-center transition-colors",
              dragging ? "border-brand-500 bg-brand-50" : "border-slate-300 hover:border-brand-400 hover:bg-slate-50",
            )}
          >
            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              {previewImport.isPending ? <Sparkles className="size-5 animate-pulse" /> : <Upload className="size-5" />}
            </div>
            <p className="text-sm font-semibold text-slate-900">{previewImport.isPending ? "Reading file…" : "Drop a CSV file here or click to browse"}</p>
            <p className="mt-1 text-xs text-slate-500">Columns used: JAN · 商品 (Merchandise) · 数量 (Quantity) · 単価 (Unit Price). UTF-8 or Shift-JIS.</p>
            <input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
          </label>
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-500">
            <FileSpreadsheet className="size-4" />
            No file at hand?
            <a href="/sample-supplier-order.csv" download className="font-medium text-brand-700 hover:underline">
              Download a sample CSV
            </a>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
            <div className="flex items-center gap-2 text-sm">
              <FileSpreadsheet className="size-4 text-slate-400" />
              <span className="font-medium text-slate-900">{preview.filename}</span>
              <span className="text-xs text-slate-400">({preview.encoding})</span>
            </div>
            <Badge tone="green">{preview.matched_count} matched</Badge>
            <Badge tone="brand">{preview.new_count} new</Badge>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" className="size-4 accent-brand-600" checked={updatePrices} onChange={(e) => setUpdatePrices(e.target.checked)} />
              Update prices of matched products
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" className="size-4 accent-brand-600" checked={addToSelection} onChange={(e) => setAddToSelection(e.target.checked)} />
              Add CSV quantities to selection
            </label>
            <div className="ml-auto">
              <Button icon={<CheckCircle2 className="size-4" />} loading={applyImport.isPending} disabled={!included.length || invalid > 0} onClick={apply}>
                Import {included.length} rows
              </Button>
            </div>
          </Card>

          <Card>
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full min-w-[1150px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="w-10 px-4 py-3" />
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">JAN</th>
                    <th className="px-3 py-3">Product name</th>
                    <th className="px-3 py-3">Material</th>
                    <th className="px-3 py-3">Origin</th>
                    <th className="px-3 py-3">Weight (g)</th>
                    <th className="px-3 py-3">Category</th>
                    <th className="px-3 py-3">Tariff</th>
                    <th className="px-3 py-3 text-right">Price</th>
                    <th className="px-3 py-3 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row, index) => {
                    const isNew = row.status === "new";
                    const priceChanged = !isNew && row.previousPrice !== row.unit_price;
                    return (
                      <tr key={row.code} className={clsx(!row.include && "opacity-40", isNew && "bg-brand-50/30")}>
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            aria-label="Include row"
                            className="size-4 accent-brand-600"
                            checked={row.include}
                            onChange={(e) => patch(index, { include: e.target.checked })}
                          />
                        </td>
                        <td className="px-3 py-2">{isNew ? <Badge tone="brand">New</Badge> : <Badge tone="green">Matched</Badge>}</td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-500">{row.code}</td>
                        {isNew ? (
                          <>
                            <td className="px-2 py-1.5">
                              <Input
                                value={row.name}
                                onChange={(e) => patch(index, { name: e.target.value })}
                                className={clsx("h-8 min-w-[220px] text-xs", !row.name.trim() && "ring-rose-400")}
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <Input value={row.material} onChange={(e) => patch(index, { material: e.target.value })} className="h-8 w-28 text-xs" />
                            </td>
                            <td className="px-2 py-1.5">
                              <Input value={row.origin} onChange={(e) => patch(index, { origin: e.target.value })} className="h-8 w-24 text-xs" />
                            </td>
                            <td className="px-2 py-1.5">
                              <Input
                                value={row.weight_g ?? ""}
                                inputMode="decimal"
                                onChange={(e) => patch(index, { weight_g: parseOptionalNumber(e.target.value) })}
                                className="h-8 w-20 text-right text-xs"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <Input
                                value={row.category}
                                list="import-categories"
                                onChange={(e) =>
                                  patch(index, {
                                    category: e.target.value,
                                    tariff_code: tariffByCategory.get(e.target.value) ?? row.tariff_code,
                                  })
                                }
                                className="h-8 w-44 text-xs"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <Input
                                value={row.tariff_code}
                                onChange={(e) => patch(index, { tariff_code: e.target.value })}
                                className="h-8 w-24 font-mono text-xs"
                              />
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="max-w-[280px] truncate px-3 py-2 text-slate-800" title={row.name}>
                              {row.name}
                            </td>
                            <td className="px-3 py-2 text-slate-500">{row.material || "—"}</td>
                            <td className="px-3 py-2 text-slate-500">{row.origin || "—"}</td>
                            <td className="px-3 py-2 text-slate-500">{row.weight_g ?? "—"}</td>
                            <td className="max-w-[180px] truncate px-3 py-2 text-slate-500">{row.category}</td>
                            <td className="px-3 py-2 font-mono text-xs text-slate-500">{row.tariff_code}</td>
                          </>
                        )}
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                          {priceChanged && updatePrices ? (
                            <span className="inline-flex items-center gap-1">
                              <span className="text-slate-400 line-through">{formatPrice(row.previousPrice)}</span>
                              <ArrowRight className="size-3 text-slate-400" />
                              <span className="font-semibold text-amber-700">{formatPrice(row.unit_price)}</span>
                            </span>
                          ) : (
                            formatPrice(isNew || updatePrices ? row.unit_price : row.previousPrice)
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.qty != null ? formatInt(row.qty) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          <datalist id="import-categories">
            {[...tariffByCategory.keys()].sort().map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </div>
      )}
    </div>
  );
}
