import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useCreateInvoice, useCustomers, useNextInvoiceNumber } from "../../api/hooks";
import type { ProductQty } from "../../api/types";
import { Button, Field, Input, Modal, Select } from "../../components/ui";
import { formatAmount, formatInt, formatKg, todayIso } from "../../lib/format";
import { useSelection } from "../../store/selection";

export function CreateInvoiceModal({
  open,
  onClose,
  items,
  totals,
}: {
  open: boolean;
  onClose: () => void;
  items: ProductQty[];
  totals: { qty: number; netKg: number; amount: number };
}) {
  const customers = useCustomers();
  const nextNumber = useNextInvoiceNumber();
  const create = useCreateInvoice();
  const clearSelection = useSelection((state) => state.clear);
  const navigate = useNavigate();

  const [customerId, setCustomerId] = useState<string>("");
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [number, setNumber] = useState("");
  const [clearAfter, setClearAfter] = useState(true);

  const refetchNumber = nextNumber.refetch;
  useEffect(() => {
    if (!open) return;
    refetchNumber();
    setInvoiceDate(todayIso());
  }, [open, refetchNumber]);

  useEffect(() => {
    if (nextNumber.data) setNumber(nextNumber.data.number);
  }, [nextNumber.data]);

  useEffect(() => {
    if (!customerId && customers.data?.length) setCustomerId(String(customers.data[0].id));
  }, [customers.data, customerId]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(
      {
        items,
        customer_id: customerId ? Number(customerId) : null,
        invoice_date: invoiceDate,
        number: number.trim() || null,
      },
      {
        onSuccess: (invoice) => {
          if (clearAfter) clearSelection();
          toast.success(`Invoice ${invoice.number} created`);
          navigate(`/invoices/${invoice.id}`);
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create invoice"
      description="Selected products are copied into the invoice — later catalogue changes won't affect it."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="create-invoice" loading={create.isPending} disabled={!items.length}>
            Create invoice
          </Button>
        </>
      }
    >
      <div className="mb-5 grid grid-cols-3 gap-3 rounded-xl bg-slate-50 p-4 text-center ring-1 ring-slate-200">
        <div>
          <div className="text-xs text-slate-500">Products · Qty</div>
          <div className="font-semibold tabular-nums">
            {items.length} · {formatInt(totals.qty)}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Net weight</div>
          <div className="font-semibold tabular-nums">{formatKg(totals.netKg)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Total</div>
          <div className="font-semibold tabular-nums">{formatAmount(totals.amount)}</div>
        </div>
      </div>
      <form id="create-invoice" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Invoice number" hint="Auto-numbered from Settings">
          <Input value={number} onChange={(event) => setNumber(event.target.value)} className="font-mono" />
        </Field>
        <Field label="Invoice date">
          <Input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} required />
        </Field>
        <Field label="Addressee (customer)" className="sm:col-span-2">
          <Select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
            <option value="">— Fill in later —</option>
            {customers.data?.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-2">
          <input
            type="checkbox"
            className="size-4 accent-brand-600"
            checked={clearAfter}
            onChange={(event) => setClearAfter(event.target.checked)}
          />
          Clear product selection after creating
        </label>
      </form>
    </Modal>
  );
}
