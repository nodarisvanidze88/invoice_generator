import { ChevronDown, Download, FileSpreadsheet, FileText, ListChecks, Package } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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

const MENU_WIDTH = 288;
const MENU_GAP = 8;
const VIEWPORT_PADDING = 12;

interface MenuPosition {
  left: number;
  top?: number;
  bottom?: number;
}

function placeMenu(trigger: DOMRect, menuHeight: number, align: "left" | "right"): MenuPosition {
  const preferredLeft = align === "right" ? trigger.right - MENU_WIDTH : trigger.left;
  const left = Math.min(Math.max(VIEWPORT_PADDING, preferredLeft), window.innerWidth - MENU_WIDTH - VIEWPORT_PADDING);
  const spaceBelow = window.innerHeight - trigger.bottom;
  const openUp = spaceBelow < menuHeight + MENU_GAP + VIEWPORT_PADDING && trigger.top > spaceBelow;
  return openUp ? { left, bottom: window.innerHeight - trigger.top + MENU_GAP } : { left, top: trigger.bottom + MENU_GAP };
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
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = position !== null;

  const toggle = () => {
    if (open || !triggerRef.current) {
      setPosition(null);
      return;
    }
    const estimatedHeight = DOWNLOAD_OPTIONS.length * 58 + 12;
    setPosition(placeMenu(triggerRef.current.getBoundingClientRect(), estimatedHeight, align));
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setPosition(null);
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) close();
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && close();
    const onScroll = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <div ref={triggerRef} className="inline-flex">
      {compact ? (
        <IconButton label="Download" onClick={toggle} className={cn(open && "bg-slate-100 text-slate-700")}>
          <Download className="size-4" />
        </IconButton>
      ) : (
        <Button variant="secondary" icon={<Download className="size-4" />} onClick={toggle}>
          Download
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </Button>
      )}
      {position &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: "fixed", width: MENU_WIDTH, ...position }}
            className="z-50 overflow-hidden rounded-xl bg-white py-1.5 shadow-xl ring-1 ring-slate-200"
          >
            {DOWNLOAD_OPTIONS.map(({ kind, label, hint, icon: Icon }) => (
              <button
                key={kind}
                type="button"
                role="menuitem"
                onClick={() => {
                  setPosition(null);
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
          </div>,
          document.body,
        )}
    </div>
  );
}
