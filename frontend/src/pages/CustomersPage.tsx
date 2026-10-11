import { MapPin, Pencil, Phone, Plus, Receipt, Trash2, Users } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { useCustomers, useDeleteCustomer, useSaveCustomer } from "../api/hooks";
import type { Customer, CustomerFields, Party } from "../api/types";
import { Button, Card, ConfirmDialog, EmptyState, Field, IconButton, Input, Modal, PageHeader, PageLoader, Textarea } from "../components/ui";

const EMPTY_PARTY: Party = { name: "", address: "", phone: "", fax: "" };
const EMPTY: CustomerFields = { ...EMPTY_PARTY, bill_to: null };

function CustomerModal({ open, customer, onClose }: { open: boolean; customer: Customer | null; onClose: () => void }) {
  const [form, setForm] = useState<CustomerFields>(EMPTY);
  const save = useSaveCustomer();
  useEffect(() => {
    if (open)
      setForm(
        customer
          ? { name: customer.name, address: customer.address, phone: customer.phone, fax: customer.fax, bill_to: customer.bill_to }
          : EMPTY,
      );
  }, [open, customer]);
  const set = (key: keyof Party) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate(
      { id: customer?.id, data: form },
      {
        onSuccess: () => {
          toast.success(customer ? "Customer updated" : "Customer added");
          onClose();
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={customer ? "Edit customer" : "Add customer"}
      description="Customers appear as the addressee (TO) on invoices."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="customer-form" loading={save.isPending} disabled={!form.name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <form id="customer-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Company name *" className="sm:col-span-2">
          <Input value={form.name} onChange={set("name")} autoFocus placeholder="New Japan Trading AS (org: 998 653 967)" />
        </Field>
        <Field label="Address" className="sm:col-span-2" hint="One line per row">
          <Textarea rows={4} value={form.address} onChange={set("address")} />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={set("phone")} />
        </Field>
        <Field label="Fax">
          <Input value={form.fax} onChange={set("fax")} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-2">
          <input
            type="checkbox"
            className="size-4 accent-brand-600"
            checked={form.bill_to !== null}
            onChange={(e) => setForm({ ...form, bill_to: e.target.checked ? { ...EMPTY_PARTY, name: form.name } : null })}
          />
          Different billing address (BILL TO)
        </label>
        {form.bill_to && (
          <>
            <Field label="Billing company" className="sm:col-span-2">
              <Input value={form.bill_to.name} onChange={(e) => setForm({ ...form, bill_to: { ...form.bill_to!, name: e.target.value } })} />
            </Field>
            <Field label="Billing address" className="sm:col-span-2">
              <Textarea
                rows={3}
                value={form.bill_to.address}
                onChange={(e) => setForm({ ...form, bill_to: { ...form.bill_to!, address: e.target.value } })}
              />
            </Field>
            <Field label="Billing phone">
              <Input value={form.bill_to.phone} onChange={(e) => setForm({ ...form, bill_to: { ...form.bill_to!, phone: e.target.value } })} />
            </Field>
          </>
        )}
      </form>
    </Modal>
  );
}

export function CustomersPage() {
  const customers = useCustomers();
  const remove = useDeleteCustomer();
  const [editing, setEditing] = useState<Customer | null>(null);
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Customer | null>(null);

  if (customers.isLoading) return <PageLoader />;
  const rows = customers.data ?? [];
  const openForm = (customer: Customer | null) => {
    setEditing(customer);
    setOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Addressees you ship to."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => openForm(null)}>
            Add customer
          </Button>
        }
      />
      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="size-5" />}
            title="No customers yet"
            action={<Button onClick={() => openForm(null)}>Add customer</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((customer) => (
            <Card key={customer.id} className="group flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
                  {customer.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex opacity-0 transition group-hover:opacity-100">
                  <IconButton label="Edit" onClick={() => openForm(customer)}>
                    <Pencil className="size-4" />
                  </IconButton>
                  <IconButton label="Delete" tone="danger" onClick={() => setToDelete(customer)}>
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
              </div>
              <h3 className="mt-3 font-semibold text-slate-900">{customer.name}</h3>
              {customer.address && (
                <p className="mt-2 flex gap-2 whitespace-pre-line text-sm text-slate-500">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" />
                  {customer.address}
                </p>
              )}
              {customer.phone && (
                <p className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                  <Phone className="size-4 text-slate-400" />
                  {customer.phone}
                </p>
              )}
              {customer.bill_to && (
                <div className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-500">
                  <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                    <Receipt className="size-3.5" /> Bill to
                  </p>
                  <p className="mt-1 font-medium text-slate-700">{customer.bill_to.name}</p>
                  <p className="whitespace-pre-line">{customer.bill_to.address}</p>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      <CustomerModal open={open} customer={editing} onClose={() => setOpen(false)} />
      <ConfirmDialog
        open={toDelete !== null}
        title="Delete customer?"
        description={`"${toDelete?.name ?? ""}" will be removed. Existing invoices keep their addressee details.`}
        loading={remove.isPending}
        onConfirm={() =>
          toDelete &&
          remove.mutate(toDelete.id, {
            onSuccess: () => {
              toast.success("Customer deleted");
              setToDelete(null);
            },
          })
        }
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
