import { Building2, Hash, Truck } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { useCompany, useSaveCompany } from "../api/hooks";
import type { CompanyFields } from "../api/types";
import { Button, Card, Field, Input, PageHeader, PageLoader, Textarea } from "../components/ui";

function Section({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return (
    <Card className="grid gap-6 p-6 lg:grid-cols-[260px_1fr]">
      <div>
        <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">{icon}</div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </Card>
  );
}

export function SettingsPage() {
  const company = useCompany();
  const save = useSaveCompany();
  const [form, setForm] = useState<CompanyFields | null>(null);

  useEffect(() => {
    if (company.data) {
      const { id: _id, ...fields } = company.data;
      setForm(fields);
    }
  }, [company.data]);

  if (company.isLoading || !form) return <PageLoader />;

  const set = (key: keyof CompanyFields) => (event: { target: { value: string } }) =>
    setForm({ ...form, [key]: key === "next_invoice_number" ? Number(event.target.value) : event.target.value });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate(form, {
      onSuccess: () => toast.success("Settings saved"),
      onError: (error) => toast.error(error.message),
    });
  };

  const preview = `${form.invoice_prefix}${String(form.next_invoice_number || 1).padStart(3, "0")}`;

  return (
    <form onSubmit={submit} className="space-y-6">
      <PageHeader
        title="Settings"
        description="Defaults used for every new invoice."
        actions={
          <Button type="submit" loading={save.isPending}>
            Save settings
          </Button>
        }
      />
      <Section icon={<Building2 className="size-4" />} title="Sender company" description="Printed in the FROM block of every invoice.">
        <Field label="Company name" className="sm:col-span-2">
          <Input value={form.name} onChange={set("name")} required />
        </Field>
        <Field label="Address" className="sm:col-span-2" hint="One line per row">
          <Textarea rows={3} value={form.address} onChange={set("address")} />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={set("phone")} />
        </Field>
        <Field label="Fax">
          <Input value={form.fax} onChange={set("fax")} />
        </Field>
      </Section>
      <Section icon={<Truck className="size-4" />} title="Shipping defaults" description="Pre-filled on new invoices, editable per invoice.">
        <Field label="Place of issue">
          <Input value={form.place} onChange={set("place")} />
        </Field>
        <Field label="Shipped per">
          <Input value={form.shipped_per} onChange={set("shipped_per")} />
        </Field>
        <Field label="Terms of payment" className="sm:col-span-2">
          <Input value={form.payment_terms} onChange={set("payment_terms")} />
        </Field>
        <Field label="Trade term (total row)">
          <Input value={form.trade_term_label} onChange={set("trade_term_label")} />
        </Field>
        <Field label="Currency label">
          <Input value={form.currency_label} onChange={set("currency_label")} />
        </Field>
        <Field label="Currency symbol">
          <Input value={form.currency_symbol} onChange={set("currency_symbol")} />
        </Field>
      </Section>
      <Section icon={<Hash className="size-4" />} title="Invoice numbering" description={`Next invoice will be ${preview}.`}>
        <Field label="Prefix">
          <Input value={form.invoice_prefix} onChange={set("invoice_prefix")} className="font-mono" />
        </Field>
        <Field label="Next number">
          <Input type="number" min={1} value={form.next_invoice_number} onChange={set("next_invoice_number")} className="font-mono" />
        </Field>
      </Section>
    </form>
  );
}
