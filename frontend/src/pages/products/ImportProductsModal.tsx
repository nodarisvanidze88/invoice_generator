import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useImportProducts, useInspectProductImport, usePreviewProductImport } from "../../api/hooks";
import type { ImportInspection, ImportLayout, ProductImportMode, ProductImportPreview, ProductImportSummary } from "../../api/types";
import { Badge, Button, Modal } from "../../components/ui";
import { ColumnMappingStep } from "./import/ColumnMappingStep";
import { ImportFormatGuide } from "./import/ImportFormatGuide";
import { ImportReviewStep } from "./import/ImportReviewStep";

type Step = "guide" | "mapping" | "review" | "done";

const TITLES: Record<Step, string> = {
  guide: "Import products from Excel",
  mapping: "Match the columns",
  review: "Review before importing",
  done: "Import finished",
};

export function ImportProductsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const inspect = useInspectProductImport();
  const previewImport = usePreviewProductImport();
  const importProducts = useImportProducts();

  const [step, setStep] = useState<Step>("guide");
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<ImportInspection | null>(null);
  const [layout, setLayout] = useState<ImportLayout | null>(null);
  const [preview, setPreview] = useState<ProductImportPreview | null>(null);
  const [summary, setSummary] = useState<ProductImportSummary | null>(null);
  const [mode, setMode] = useState<ProductImportMode>("new_only");

  useEffect(() => {
    if (!open) return;
    setStep("guide");
    setFile(null);
    setInspection(null);
    setLayout(null);
    setPreview(null);
    setSummary(null);
    setMode("new_only");
  }, [open]);

  const runInspect = (target: File, sheet?: string, headerRow?: number) =>
    inspect.mutate(
      { file: target, sheet, headerRow },
      {
        onSuccess: (result) => {
          setFile(target);
          setInspection(result);
          setLayout(result.layout);
          setStep("mapping");
        },
        onError: (error) => toast.error(error.message),
      },
    );

  const runPreview = () => {
    if (!file || !layout) return;
    previewImport.mutate(
      { file, layout },
      {
        onSuccess: (result) => {
          setPreview(result);
          setStep("review");
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  const runImport = () => {
    if (!file || !layout) return;
    importProducts.mutate(
      { file, layout, mode },
      {
        onSuccess: (result) => {
          setSummary(result);
          setStep("done");
          toast.success(`${result.created} products added${result.updated ? `, ${result.updated} updated` : ""}`);
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  const nameMapped = layout ? layout.mapping.name !== undefined || layout.mapping.id !== undefined : false;
  const changedCount = preview?.existing.filter((row) => row.changes.length > 0).length ?? 0;
  const willChange = preview ? preview.new.length + (mode === "upsert" ? changedCount : 0) : 0;

  const footer = {
    guide: (
      <Button variant="secondary" onClick={onClose}>
        Cancel
      </Button>
    ),
    mapping: (
      <>
        <Button variant="secondary" icon={<ArrowLeft className="size-4" />} onClick={() => setStep("guide")}>
          Choose another file
        </Button>
        <Button
          icon={<ArrowRight className="size-4" />}
          loading={previewImport.isPending}
          disabled={!nameMapped || !inspection?.data_rows || inspect.isPending}
          onClick={runPreview}
        >
          Check against catalogue
        </Button>
      </>
    ),
    review: (
      <>
        <Button variant="secondary" icon={<ArrowLeft className="size-4" />} onClick={() => setStep("mapping")}>
          Back to columns
        </Button>
        <Button icon={<ArrowRight className="size-4" />} loading={importProducts.isPending} disabled={!willChange} onClick={runImport}>
          {mode === "new_only" ? `Add ${preview?.new.length ?? 0} new products` : `Add ${preview?.new.length ?? 0} · update ${changedCount}`}
        </Button>
      </>
    ),
    done: <Button onClick={onClose}>Done</Button>,
  }[step];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size={step === "guide" ? "lg" : "xl"}
      title={TITLES[step]}
      description={
        step === "mapping"
          ? `${file?.name ?? ""} — check that every field points to the right column. Nothing has been saved yet.`
          : step === "review"
            ? "Nothing has been saved yet — check the lists, choose what to do, then import."
            : undefined
      }
      footer={footer}
    >
      {step === "guide" && <ImportFormatGuide loading={inspect.isPending} onFile={(selected) => runInspect(selected)} />}
      {step === "mapping" && inspection && layout && file && (
        <ColumnMappingStep
          inspection={inspection}
          layout={layout}
          onLayoutChange={setLayout}
          onSheetChange={(sheet) => runInspect(file, sheet)}
          onHeaderRowChange={(row) => runInspect(file, layout.sheet, row)}
          reloading={inspect.isPending}
        />
      )}
      {step === "review" && preview && <ImportReviewStep preview={preview} mode={mode} onModeChange={setMode} />}
      {step === "done" && summary && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
            <CheckCircle2 className="size-5 text-emerald-500" /> Products imported
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="brand">{summary.created} added</Badge>
            {summary.updated > 0 && <Badge tone="amber">{summary.updated} updated</Badge>}
            {summary.unchanged > 0 && <Badge>{summary.unchanged} already identical</Badge>}
            {summary.skipped_existing > 0 && <Badge tone="green">{summary.skipped_existing} already registered — left untouched</Badge>}
            {summary.skipped_invalid > 0 && <Badge tone="rose">{summary.skipped_invalid} rows skipped (problems)</Badge>}
          </div>
        </div>
      )}
    </Modal>
  );
}
