import { Building2, MapPin, Package, UserRound } from "lucide-react";
import type { ReactNode } from "react";

import { useCustomers } from "../../api/hooks";
import type { InvoiceDocument, Party } from "../../api/types";
import { Card, Field, Input, Select, Textarea } from "../../components/ui";
import { formatKg, parseOptionalNumber } from "../../lib/format";
import { boxTotals } from "../../lib/invoice";
import type { UpdateDoc } from "./InvoiceEditorPage";

function Section({ icon, title, children, aside }: { icon: ReactNode; title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">{icon}</div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        </div>
        {aside}
      </div>
      {children}
    </Card>
  );
}

function PartyForm({ party, onChange }: { party: Party; onChange: (party: Party) => void }) {
  const set = (key: keyof Party) => (event: { target: { value: string } }) => onChange({ ...party, [key]: event.target.value });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Name" className="sm:col-span-2">
        <Input value={party.name} onChange={set("name")} />
      </Field>
      <Field label="Address" className="sm:col-span-2" hint="One line per row, as printed on the invoice">
        <Textarea rows={4} value={party.address} onChange={set("address")} />
      </Field>
      <Field label="Phone">
        <Input value={party.phone} onChange={set("phone")} />
      </Field>
      <Field label="Fax">
        <Input value={party.fax} onChange={set("fax")} />
      </Field>
    </div>
  );
}

export function DetailsTab({ doc, updateDoc }: { doc: InvoiceDocument; updateDoc: UpdateDoc }) {
  const customers = useCustomers();
  const fromBoxes = boxTotals(doc.boxes);
  const set = <K extends keyof InvoiceDocument>(key: K, value: InvoiceDocument[K]) => updateDoc((d) => ({ ...d, [key]: value }));

  const pickCustomer = (value: string) => {
    const customer = customers.data?.find((c) => c.id === Number(value));
    updateDoc((d) => ({
      ...d,
      customer_id: customer?.id ?? null,
      addressee: customer
        ? { name: customer.name, address: customer.address, phone: customer.phone, fax: customer.fax }
        : d.addressee,
    }));
  };

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Section icon={<MapPin className="size-4" />} title="Shipment">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Invoice number">
            <Input value={doc.number} onChange={(e) => set("number", e.target.value)} className="font-mono" />
          </Field>
          <Field label="Invoice date">
            <Input type="date" value={doc.invoice_date} onChange={(e) => set("invoice_date", e.target.value)} />
          </Field>
          <Field label="Place">
            <Input value={doc.place} onChange={(e) => set("place", e.target.value)} />
          </Field>
          <Field label="Shipped per">
            <Input value={doc.shipped_per} onChange={(e) => set("shipped_per", e.target.value)} placeholder="DHL" />
          </Field>
          <Field label="Terms of payment" className="sm:col-span-2">
            <Input value={doc.payment_terms} onChange={(e) => set("payment_terms", e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <span className="mb-1.5 block text-xs font-medium text-slate-600">Remarks</span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: true, label: "Commercial value", jp: "有償" },
                { value: false, label: "No commercial value", jp: "無償" },
              ].map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => set("commercial_value", option.value)}
                  className={
                    doc.commercial_value === option.value
                      ? "rounded-lg bg-brand-50 px-3 py-2.5 text-left text-sm font-medium text-brand-700 ring-2 ring-brand-500"
                      : "rounded-lg bg-white px-3 py-2.5 text-left text-sm text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
                  }
                >
                  <span className="mr-1.5">{option.jp}</span>
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <Field label="Additional remarks" className="sm:col-span-2" hint="Up to 3 lines are printed under the remarks box">
            <Textarea rows={2} value={doc.remarks} onChange={(e) => set("remarks", e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section
        icon={<UserRound className="size-4" />}
        title="Addressee (TO)"
        aside={
          <Select value={doc.customer_id ?? ""} onChange={(e) => pickCustomer(e.target.value)} className="h-8 w-56 text-xs">
            <option value="">Choose from customers…</option>
            {customers.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        }
      >
        <PartyForm party={doc.addressee} onChange={(party) => set("addressee", party)} />
      </Section>

      <Section icon={<Package className="size-4" />} title="Packages (invoice footer)">
        <p className="mb-4 text-sm text-slate-500">
          Calculated from the boxes on the <b className="text-slate-700">Packing</b> tab
          {fromBoxes.pieces > 0 ? ` (${fromBoxes.pieces} boxes, ${formatKg(fromBoxes.grossKg)})` : " — no boxes yet"}. Fill in the fields below
          to override them without packing box by box.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Number of pieces (個数)" hint={`Leave empty to use boxes: ${fromBoxes.pieces}`}>
            <Input
              inputMode="numeric"
              placeholder={String(fromBoxes.pieces)}
              value={doc.pieces_override ?? ""}
              onChange={(e) => {
                const value = parseOptionalNumber(e.target.value);
                set("pieces_override", value == null ? null : Math.max(0, Math.floor(value)));
              }}
            />
          </Field>
          <Field label="Gross weight, kg (総重量)" hint={`Leave empty to use boxes: ${formatKg(fromBoxes.grossKg)}`}>
            <Input
              inputMode="decimal"
              placeholder={fromBoxes.grossKg.toFixed(1)}
              value={doc.gross_weight_override_kg ?? ""}
              onChange={(e) => set("gross_weight_override_kg", parseOptionalNumber(e.target.value))}
            />
          </Field>
        </div>
      </Section>

      <Section icon={<Building2 className="size-4" />} title="Sender (FROM)">
        <PartyForm party={doc.sender} onChange={(party) => set("sender", party)} />
      </Section>
    </div>
  );
}
