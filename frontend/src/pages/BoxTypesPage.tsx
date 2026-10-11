import { Box as BoxIcon, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { useBoxTypes, useCompany, useDeleteBoxType, useSaveBoxType } from "../api/hooks";
import type { BoxType, BoxTypeFields } from "../api/types";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Field, IconButton, Input, Modal, PageHeader, PageLoader } from "../components/ui";
import { formatPrice } from "../lib/format";

const CM3_PER_LITRE = 1000;
const DEFAULT_DIVISOR = 5000;

interface FormState {
  name: string;
  length_cm: string;
  width_cm: string;
  height_cm: string;
  tare_weight_kg: string;
  max_weight_kg: string;
  active: boolean;
}

const EMPTY: FormState = { name: "", length_cm: "", width_cm: "", height_cm: "", tare_weight_kg: "0.5", max_weight_kg: "30", active: true };

function toForm(boxType: BoxType | null): FormState {
  if (!boxType) return EMPTY;
  return {
    name: boxType.name,
    length_cm: String(boxType.length_cm),
    width_cm: String(boxType.width_cm),
    height_cm: String(boxType.height_cm),
    tare_weight_kg: String(boxType.tare_weight_kg),
    max_weight_kg: String(boxType.max_weight_kg),
    active: boxType.active,
  };
}

function BoxTypeModal({ open, boxType, onClose }: { open: boolean; boxType: BoxType | null; onClose: () => void }) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const save = useSaveBoxType();
  useEffect(() => {
    if (open) setForm(toForm(boxType));
  }, [open, boxType]);

  const set = (key: keyof FormState) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const data: BoxTypeFields = {
      name: form.name.trim(),
      length_cm: Number(form.length_cm),
      width_cm: Number(form.width_cm),
      height_cm: Number(form.height_cm),
      tare_weight_kg: Number(form.tare_weight_kg) || 0,
      max_weight_kg: Number(form.max_weight_kg),
      active: form.active,
    };
    save.mutate(
      { id: boxType?.id, data },
      {
        onSuccess: () => {
          toast.success(boxType ? "Box type updated" : "Box type added");
          onClose();
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };
  const valid = form.name.trim() && Number(form.length_cm) > 0 && Number(form.width_cm) > 0 && Number(form.height_cm) > 0 && Number(form.max_weight_kg) > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={boxType ? "Edit box type" : "Add box type"}
      description="Inner dimensions are used for packing; outer dimensions for the packing list."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="box-type-form" loading={save.isPending} disabled={!valid}>
            Save
          </Button>
        </>
      }
    >
      <form id="box-type-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
        <Field label="Name *" className="sm:col-span-3">
          <Input value={form.name} onChange={set("name")} placeholder="Large 64×43×52" autoFocus />
        </Field>
        <Field label="Length (cm) *">
          <Input value={form.length_cm} onChange={set("length_cm")} inputMode="decimal" />
        </Field>
        <Field label="Width (cm) *">
          <Input value={form.width_cm} onChange={set("width_cm")} inputMode="decimal" />
        </Field>
        <Field label="Height (cm) *">
          <Input value={form.height_cm} onChange={set("height_cm")} inputMode="decimal" />
        </Field>
        <Field label="Empty box weight (kg)" hint="Added to every box's gross weight">
          <Input value={form.tare_weight_kg} onChange={set("tare_weight_kg")} inputMode="decimal" />
        </Field>
        <Field label="Max gross weight (kg) *" hint="Box + contents">
          <Input value={form.max_weight_kg} onChange={set("max_weight_kg")} inputMode="decimal" />
        </Field>
        <label className="flex items-center gap-2 self-center pt-4 text-sm text-slate-600">
          <input type="checkbox" className="size-4 accent-brand-600" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          Use in auto-packing
        </label>
      </form>
    </Modal>
  );
}

export function BoxTypesPage() {
  const boxTypes = useBoxTypes();
  const company = useCompany();
  const remove = useDeleteBoxType();
  const [editing, setEditing] = useState<BoxType | null>(null);
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<BoxType | null>(null);

  if (boxTypes.isLoading) return <PageLoader />;
  const rows = boxTypes.data ?? [];
  const divisor = company.data?.volumetric_divisor ?? DEFAULT_DIVISOR;
  const openForm = (boxType: BoxType | null) => {
    setEditing(boxType);
    setOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Box types"
        description="Cartons available for packing. Auto-pack chooses among the active ones to minimise DHL chargeable weight."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => openForm(null)}>
            Add box type
          </Button>
        }
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<BoxIcon className="size-5" />} title="No box types yet" action={<Button onClick={() => openForm(null)}>Add box type</Button>} />
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Box</th>
                  <th className="px-3 py-3 text-right">Inner size (cm)</th>
                  <th className="px-3 py-3 text-right">Volume</th>
                  <th className="px-3 py-3 text-right">Volumetric weight</th>
                  <th className="px-3 py-3 text-right">Empty / Max</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((boxType) => {
                  const volume = boxType.length_cm * boxType.width_cm * boxType.height_cm;
                  return (
                    <tr key={boxType.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{boxType.name}</td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {formatPrice(boxType.length_cm)} × {formatPrice(boxType.width_cm)} × {formatPrice(boxType.height_cm)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-600">{formatPrice(volume / CM3_PER_LITRE)} L</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-600">{(volume / divisor).toFixed(1)} kg</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-600">
                        {formatPrice(boxType.tare_weight_kg)} / {formatPrice(boxType.max_weight_kg)} kg
                      </td>
                      <td className="px-3 py-3">{boxType.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-0.5">
                          <IconButton label="Edit" onClick={() => openForm(boxType)}>
                            <Pencil className="size-4" />
                          </IconButton>
                          <IconButton label="Delete" tone="danger" onClick={() => setToDelete(boxType)}>
                            <Trash2 className="size-4" />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-3 text-xs text-slate-500">
        Volumetric weight = L × W × H / {divisor} (DHL). Change the divisor in Settings.
      </p>
      <BoxTypeModal open={open} boxType={editing} onClose={() => setOpen(false)} />
      <ConfirmDialog
        open={toDelete !== null}
        title="Delete box type?"
        description={`"${toDelete?.name ?? ""}" will no longer be offered for packing. Existing packing lists are not changed.`}
        loading={remove.isPending}
        onConfirm={() =>
          toDelete &&
          remove.mutate(toDelete.id, {
            onSuccess: () => {
              toast.success("Box type deleted");
              setToDelete(null);
            },
          })
        }
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
