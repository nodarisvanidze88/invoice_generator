import clsx from "clsx";
import { ArrowLeft, Boxes, ClipboardList, Download, Eye, FileText, Save, Truck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";

import { useInvoice, useSaveInvoice } from "../../api/hooks";
import type { Invoice, InvoiceDocument } from "../../api/types";
import { Badge, Button, Modal, PageLoader } from "../../components/ui";
import { formatAmount, formatDate, formatInt, formatKg } from "../../lib/format";
import { docTotals } from "../../lib/invoice";
import { DetailsTab } from "./DetailsTab";
import { ItemsTab } from "./ItemsTab";
import { PackingTab } from "./PackingTab";
import { PreviewTab } from "./PreviewTab";

export type UpdateDoc = (updater: (doc: InvoiceDocument) => InvoiceDocument) => void;

type TabKey = "items" | "details" | "packing" | "preview";

const TABS: { key: TabKey; label: string; icon: typeof FileText }[] = [
  { key: "items", label: "Items", icon: ClipboardList },
  { key: "details", label: "Details", icon: FileText },
  { key: "packing", label: "Packing", icon: Boxes },
  { key: "preview", label: "Preview", icon: Eye },
];

function toDocument(invoice: Invoice): InvoiceDocument {
  const { id: _id, created_at: _c, updated_at: _u, totals: _t, ...doc } = invoice;
  return doc;
}

export function InvoiceEditorPage() {
  const id = Number(useParams().id);
  const invoice = useInvoice(id);
  const save = useSaveInvoice(id);
  const [draft, setDraft] = useState<InvoiceDocument | null>(null);
  const [tab, setTab] = useState<TabKey>("items");
  const [previewVersion, setPreviewVersion] = useState(0);
  const [missingPackages, setMissingPackages] = useState(false);

  const saved = useMemo(() => (invoice.data ? toDocument(invoice.data) : null), [invoice.data]);

  useEffect(() => {
    if (saved && draft === null) setDraft(saved);
  }, [saved, draft]);

  const dirty = useMemo(() => Boolean(draft && saved && JSON.stringify(draft) !== JSON.stringify(saved)), [draft, saved]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const updateDoc: UpdateDoc = useCallback((updater) => setDraft((prev) => (prev ? updater(prev) : prev)), []);

  const persist = useCallback(async (): Promise<boolean> => {
    if (!draft) return false;
    if (!dirty) return true;
    try {
      const result = await save.mutateAsync(draft);
      setDraft(toDocument(result));
      setPreviewVersion((v) => v + 1);
      toast.success("Invoice saved");
      return true;
    } catch (error) {
      toast.error((error as Error).message);
      return false;
    }
  }, [draft, dirty, save]);

  const download = async (kind: "invoice" | "packing", force = false) => {
    if (kind === "invoice" && !force && draft) {
      const current = docTotals(draft);
      if (current.pieces === 0 || current.grossKg === 0) {
        setMissingPackages(true);
        return;
      }
    }
    setMissingPackages(false);
    if (await persist()) window.open(`/api/invoices/${id}/${kind}.pdf?download=true`, "_blank");
  };

  const goToTab = (key: TabKey) => {
    setMissingPackages(false);
    setTab(key);
  };

  if (invoice.isLoading || !draft) return <PageLoader />;
  if (invoice.isError) return <p className="text-rose-600">Invoice not found.</p>;

  const totals = docTotals(draft);

  return (
    <div>
      <Link to="/invoices" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" /> All invoices
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-2xl font-semibold tracking-tight text-slate-900">{draft.number}</h1>
            {dirty ? <Badge tone="amber">Unsaved changes</Badge> : <Badge tone="green">Saved</Badge>}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {formatDate(draft.invoice_date)} · {draft.addressee.name || "No addressee yet"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => download("packing")}>
            Packing list
          </Button>
          <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => download("invoice")}>
            Invoice PDF
          </Button>
          <Button icon={<Save className="size-4" />} loading={save.isPending} disabled={!dirty} onClick={persist}>
            Save
          </Button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-slate-200 ring-1 ring-slate-200 sm:grid-cols-3 xl:grid-cols-6">
        {[
          { label: "Lines", value: formatInt(draft.lines.length) },
          { label: "Quantity", value: formatInt(totals.qty) },
          { label: "Net weight", value: formatKg(totals.netKg) },
          { label: "Total amount", value: formatAmount(totals.amount) },
          { label: "Boxes · Gross", value: `${totals.pieces} · ${formatKg(totals.grossKg)}` },
          {
            label: "Packing status",
            value:
              totals.mismatched === 0 ? (
                <span className="text-emerald-600">All packed</span>
              ) : (
                <span className="text-amber-600">{formatInt(totals.unpacked)} pcs left</span>
              ),
          },
        ].map((stat) => (
          <div key={stat.label} className="bg-white px-4 py-3">
            <div className="text-xs text-slate-500">{stat.label}</div>
            <div className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={clsx(
              "-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
              tab === key ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            <Icon className="size-4" />
            {label}
            {key === "packing" && totals.mismatched > 0 && <span className="size-1.5 rounded-full bg-amber-500" />}
          </button>
        ))}
      </div>

      {tab === "items" && <ItemsTab doc={draft} updateDoc={updateDoc} />}
      {tab === "details" && <DetailsTab doc={draft} updateDoc={updateDoc} />}
      {tab === "packing" && <PackingTab doc={draft} updateDoc={updateDoc} />}
      {tab === "preview" && (
        <PreviewTab invoiceId={id} version={previewVersion} dirty={dirty} onSave={persist} saving={save.isPending} />
      )}

      <Modal
        open={missingPackages}
        onClose={() => setMissingPackages(false)}
        title="Number of pieces / gross weight missing"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => download("invoice", true)}>
              Download anyway
            </Button>
            <Button variant="secondary" onClick={() => goToTab("details")}>
              Enter manually
            </Button>
            <Button onClick={() => goToTab("packing")}>Add boxes</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          The invoice footer shows <b>個数 (Number of pieces)</b> and <b>総重量 (Gross weight)</b>. They are calculated from the boxes on
          the Packing tab — this invoice has{" "}
          {totals.pieces === 0 ? "no boxes yet" : "boxes without a gross weight"}.
        </p>
        <p className="mt-3 text-sm text-slate-600">
          Add boxes on the <b>Packing</b> tab, or type the values directly on the <b>Details</b> tab.
        </p>
      </Modal>

      {dirty && (
        <div className="fixed bottom-4 right-4 z-30 flex items-center gap-3 rounded-xl bg-slate-900 py-2 pl-4 pr-2 text-sm text-white shadow-xl">
          <Truck className="size-4 text-amber-300" />
          You have unsaved changes
          <Button size="sm" loading={save.isPending} onClick={persist}>
            Save now
          </Button>
        </div>
      )}
    </div>
  );
}
