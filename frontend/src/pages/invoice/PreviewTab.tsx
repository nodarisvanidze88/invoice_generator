import clsx from "clsx";
import { ExternalLink, Info } from "lucide-react";
import { useState } from "react";

import { Button, Card } from "../../components/ui";

type Kind = "invoice" | "packing";

export function PreviewTab({
  invoiceId,
  version,
  dirty,
  saving,
  onSave,
}: {
  invoiceId: number;
  version: number;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  const [kind, setKind] = useState<Kind>("invoice");
  const src = `/api/invoices/${invoiceId}/${kind}.pdf?v=${version}`;
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex rounded-lg bg-slate-100 p-1 text-xs font-medium">
          {(["invoice", "packing"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setKind(option)}
              className={clsx(
                "rounded-md px-3 py-1.5 capitalize transition-colors",
                kind === option ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
              )}
            >
              {option === "invoice" ? "Invoice" : "Packing list"}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" icon={<ExternalLink className="size-4" />} onClick={() => window.open(src, "_blank")}>
          Open in new tab
        </Button>
      </div>
      {dirty && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <span className="flex items-center gap-2">
            <Info className="size-4" /> The preview shows the last saved version.
          </span>
          <Button size="sm" loading={saving} onClick={onSave}>
            Save & refresh
          </Button>
        </div>
      )}
      <iframe key={src} title="PDF preview" src={src} className="h-[80vh] w-full bg-slate-100" />
    </Card>
  );
}
