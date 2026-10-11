import { ChevronDown, Download, FileSpreadsheet, FileText, ListChecks, Package } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button, IconButton, cn } from "./ui";

export type DownloadKind = "invoice" | "simple" | "simple-xlsx" | "packing";

export const DOWNLOAD_OPTIONS: { kind: DownloadKind; label: string; hint: string; icon: typeof FileText }[] = [
  { kind: "invoice", label: "Invoice (full)", hint: "Customs format, line by line · PDF", icon: FileText },
  { kind: "simple", label: "Invoice (simplified)", hint: "One row per category · PDF", icon: ListChecks },
  { kind: "simple-xlsx", label: "Invoice (simplified)", hint: "One row per category · Excel", icon: FileSpreadsheet },
  { kind: "packing", label: "Packing list", hint: "Box by box · PDF", icon: Package },
];

export function downloadUrl(invoiceId: number, kind: DownloadKind): string {
  const paths: Record<DownloadKind, string> = {
    invoice: "invoice.pdf?download=true",
    simple: "simple.pdf?download=true",
    "simple-xlsx": "simple.xlsx",
    packing: "packing.pdf?download=true",
  };
  return `/api/invoices/${invoiceId}/${paths[kind]}`;
}

export function DownloadMenu({
  onSelect,
  compact = false,
  align = "right",
}: {
  onSelect: (kind: DownloadKind) => void;
  compact?: boolean;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {compact ? (
        <IconButton label="Download" onClick={() => setOpen((v) => !v)}>
          <Download className="size-4" />
        </IconButton>
      ) : (
        <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => setOpen((v) => !v)}>
          Download
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </Button>
      )}
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute z-40 mt-2 w-72 overflow-hidden rounded-xl bg-white py-1.5 shadow-xl ring-1 ring-slate-200",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {DOWNLOAD_OPTIONS.map(({ kind, label, hint, icon: Icon }) => (
            <button
              key={kind}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSelect(kind);
              }}
              className="flex w-full items-start gap-3 px-3.5 py-2.5 text-left hover:bg-slate-50"
            >
              <span
                className={cn(
                  "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                  kind === "simple-xlsx" ? "bg-emerald-50 text-emerald-600" : "bg-brand-50 text-brand-600",
                )}
              >
                <Icon className="size-4" />
              </span>
              <span>
                <span className="block text-sm font-medium text-slate-900">{label}</span>
                <span className="block text-xs text-slate-500">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
