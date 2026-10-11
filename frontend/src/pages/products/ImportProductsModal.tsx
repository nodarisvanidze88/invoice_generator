import { CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useImportProducts } from "../../api/hooks";
import type { ProductImportSummary } from "../../api/types";
import { Badge, Button, Modal } from "../../components/ui";

const STEPS = [
  "Download the current catalogue with Export Excel.",
  "Fill in or change any column — e.g. Length / Width / Height (cm) of one piece.",
  "Upload the file here. Rows are matched by ID, then by JAN; rows without a match are added as new products.",
];

export function ImportProductsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const importProducts = useImportProducts();
  const input = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<ProductImportSummary | null>(null);

  useEffect(() => {
    if (open) setSummary(null);
  }, [open]);

  const upload = (file: File | undefined) => {
    if (!file) return;
    importProducts.mutate(file, {
      onSuccess: (result) => {
        setSummary(result);
        toast.success(`${result.updated} products updated, ${result.created} added`);
      },
      onError: (error) => toast.error(error.message),
    });
    if (input.current) input.current.value = "";
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import products from Excel"
      description="Bulk-update the catalogue — the fastest way to add piece sizes for auto-packing."
      footer={
        <Button variant="secondary" onClick={onClose}>
          {summary ? "Done" : "Cancel"}
        </Button>
      }
    >
      <ol className="mb-5 space-y-2.5">
        {STEPS.map((step, index) => (
          <li key={step} className="flex gap-3 text-sm text-slate-600">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
      <div className="mb-5 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" icon={<Download className="size-4" />} onClick={() => window.open("/api/products/export.xlsx")}>
          Export current catalogue
        </Button>
      </div>
      <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 px-6 py-10 text-center transition-colors hover:border-brand-400 hover:bg-slate-50">
        <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          {importProducts.isPending ? <FileSpreadsheet className="size-5 animate-pulse" /> : <Upload className="size-5" />}
        </div>
        <p className="text-sm font-semibold text-slate-900">{importProducts.isPending ? "Importing…" : "Choose an .xlsx file"}</p>
        <p className="mt-1 text-xs text-slate-500">Same columns as the export. Empty size cells clear the size.</p>
        <input ref={input} type="file" accept=".xlsx" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
      </label>
      {summary && (
        <div className="mt-5 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800">
            <CheckCircle2 className="size-4 text-emerald-500" /> Import finished
            <Badge tone="green">{summary.updated} updated</Badge>
            <Badge tone="brand">{summary.created} added</Badge>
            {summary.skipped > 0 && <Badge tone="rose">{summary.skipped} skipped</Badge>}
          </div>
          {summary.errors.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-rose-700">
              {summary.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
