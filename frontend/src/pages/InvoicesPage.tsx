import { Copy, FileDown, FileText, Package, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useDeleteInvoice, useDuplicateInvoice, useInvoices } from "../api/hooks";
import type { InvoiceSummary } from "../api/types";
import { Badge, Button, Card, ConfirmDialog, EmptyState, IconButton, PageHeader, PageLoader } from "../components/ui";
import { formatAmount, formatDate, formatInt, formatKg } from "../lib/format";

export function InvoicesPage() {
  const invoices = useInvoices();
  const duplicate = useDuplicateInvoice();
  const remove = useDeleteInvoice();
  const navigate = useNavigate();
  const [toDelete, setToDelete] = useState<InvoiceSummary | null>(null);

  if (invoices.isLoading) return <PageLoader />;
  const rows = invoices.data ?? [];

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Every generated invoice is stored here — reopen, edit, re-download or duplicate it."
        actions={
          <Button icon={<FileText className="size-4" />} onClick={() => navigate("/products")}>
            New invoice
          </Button>
        }
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={<FileText className="size-5" />}
            title="No invoices yet"
            description="Select products on the Products page and click “Create invoice”."
            action={<Button onClick={() => navigate("/products")}>Go to products</Button>}
          />
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-3 py-3">Addressee</th>
                  <th className="px-3 py-3 text-right">Qty</th>
                  <th className="px-3 py-3 text-right">Net / Gross</th>
                  <th className="px-3 py-3 text-right">Amount</th>
                  <th className="px-3 py-3">Packing</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link to={`/invoices/${invoice.id}`} className="font-mono font-semibold text-brand-700 hover:underline">
                        {invoice.number}
                      </Link>
                      <div className="text-xs text-slate-400">{formatDate(invoice.invoice_date)}</div>
                    </td>
                    <td className="max-w-[260px] px-3 py-3">
                      <div className="truncate text-slate-700">{invoice.addressee_name || "—"}</div>
                      <div className="text-xs text-slate-400">{invoice.line_count} lines</div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatInt(invoice.totals.qty)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-600">
                      {formatKg(invoice.totals.net_weight_kg)}
                      <div className="text-xs text-slate-400">{formatKg(invoice.totals.gross_weight_kg)}</div>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatAmount(invoice.totals.amount)}</td>
                    <td className="px-3 py-3">
                      {invoice.totals.pieces === 0 ? (
                        <Badge>No boxes</Badge>
                      ) : invoice.totals.mismatched_lines === 0 ? (
                        <Badge tone="green">{invoice.totals.pieces} boxes · complete</Badge>
                      ) : (
                        <Badge tone="amber">
                          {invoice.totals.pieces} boxes · {formatInt(invoice.totals.unpacked_qty)} left
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-0.5">
                        <IconButton label="Download invoice PDF" onClick={() => window.open(`/api/invoices/${invoice.id}/invoice.pdf?download=true`)}>
                          <FileDown className="size-4" />
                        </IconButton>
                        <IconButton label="Download packing list" onClick={() => window.open(`/api/invoices/${invoice.id}/packing.pdf?download=true`)}>
                          <Package className="size-4" />
                        </IconButton>
                        <IconButton
                          label="Duplicate"
                          onClick={() =>
                            duplicate.mutate(invoice.id, {
                              onSuccess: (created) => {
                                toast.success(`Created ${created.number} from ${invoice.number}`);
                                navigate(`/invoices/${created.id}`);
                              },
                              onError: (error) => toast.error(error.message),
                            })
                          }
                        >
                          <Copy className="size-4" />
                        </IconButton>
                        <IconButton label="Delete" tone="danger" onClick={() => setToDelete(invoice)}>
                          <Trash2 className="size-4" />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <ConfirmDialog
        open={toDelete !== null}
        title={`Delete invoice ${toDelete?.number ?? ""}?`}
        description="The invoice and its packing list will be permanently removed."
        loading={remove.isPending}
        onConfirm={() =>
          toDelete &&
          remove.mutate(toDelete.id, {
            onSuccess: () => {
              toast.success("Invoice deleted");
              setToDelete(null);
            },
          })
        }
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
