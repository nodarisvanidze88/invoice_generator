import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { useSaveProduct } from "../../api/hooks";
import type { Product, ProductFields } from "../../api/types";
import { Button, Field, Input, Modal } from "../../components/ui";
import { parseOptionalNumber } from "../../lib/format";

interface FormState {
  code: string;
  name: string;
  material: string;
  origin: string;
  weight_g: string;
  unit_price: string;
  category: string;
  tariff_code: string;
}

const EMPTY: FormState = {
  code: "",
  name: "",
  material: "",
  origin: "Japan",
  weight_g: "",
  unit_price: "",
  category: "",
  tariff_code: "",
};

function toForm(product: Product | null): FormState {
  if (!product) return EMPTY;
  return {
    code: product.code,
    name: product.name,
    material: product.material,
    origin: product.origin,
    weight_g: product.weight_g?.toString() ?? "",
    unit_price: product.unit_price?.toString() ?? "",
    category: product.category,
    tariff_code: product.tariff_code,
  };
}

export function ProductFormModal({
  open,
  product,
  products,
  onClose,
}: {
  open: boolean;
  product: Product | null;
  products: Product[];
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const save = useSaveProduct();

  useEffect(() => {
    if (open) setForm(toForm(product));
  }, [open, product]);

  const { categories, tariffByCategory, origins, materials } = useMemo(() => {
    const tariffs = new Map<string, string>();
    const originSet = new Set<string>();
    const materialSet = new Set<string>();
    for (const p of products) {
      if (p.category && p.tariff_code && !tariffs.has(p.category)) tariffs.set(p.category, p.tariff_code);
      if (p.origin) originSet.add(p.origin);
      if (p.material) materialSet.add(p.material);
    }
    return {
      categories: [...tariffs.keys()].sort(),
      tariffByCategory: tariffs,
      origins: [...originSet].sort(),
      materials: [...materialSet].sort(),
    };
  }, [products]);

  const update = (key: keyof FormState) => (event: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const onCategoryChange = (value: string) => {
    setForm((prev) => {
      const knownTariff = tariffByCategory.get(value);
      const shouldFill = knownTariff && (!prev.tariff_code || prev.tariff_code === tariffByCategory.get(prev.category));
      return { ...prev, category: value, tariff_code: shouldFill ? knownTariff : prev.tariff_code };
    });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const data: ProductFields = {
      code: form.code.trim(),
      name: form.name.trim(),
      material: form.material.trim(),
      origin: form.origin.trim(),
      weight_g: parseOptionalNumber(form.weight_g),
      unit_price: parseOptionalNumber(form.unit_price),
      category: form.category.trim(),
      tariff_code: form.tariff_code.trim(),
    };
    save.mutate(
      { id: product?.id, data },
      {
        onSuccess: () => {
          toast.success(product ? "Product updated" : "Product added");
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
      title={product ? "Edit product" : "Add product"}
      description="The invoice line is built as: JAN  Name  [Material]  [Origin]"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="product-form" loading={save.isPending} disabled={!form.name.trim()}>
            {product ? "Save changes" : "Add product"}
          </Button>
        </>
      }
    >
      <form id="product-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-6">
        <Field label="JAN / Code" className="sm:col-span-2" hint="Multiple codes: separate with /">
          <Input value={form.code} onChange={update("code")} placeholder="4901234567890" />
        </Field>
        <Field label="Product name *" className="sm:col-span-4">
          <Input value={form.name} onChange={update("name")} placeholder="Pineapple Candy 110g" required autoFocus />
        </Field>
        <Field label="Material" className="sm:col-span-2">
          <Input value={form.material} onChange={update("material")} list="materials" placeholder="Plastic" />
        </Field>
        <Field label="Origin" className="sm:col-span-2">
          <Input value={form.origin} onChange={update("origin")} list="origins" placeholder="Japan" />
        </Field>
        <Field label="Weight (g)" className="sm:col-span-1">
          <Input value={form.weight_g} onChange={update("weight_g")} inputMode="decimal" placeholder="0" />
        </Field>
        <Field label="Unit price (¥)" className="sm:col-span-1">
          <Input value={form.unit_price} onChange={update("unit_price")} inputMode="decimal" placeholder="0" />
        </Field>
        <Field label="Category" className="sm:col-span-4" hint="Pick an existing category to auto-fill its tariff code">
          <Input
            value={form.category}
            onChange={(event) => onCategoryChange(event.target.value)}
            list="categories"
            placeholder="Sugar-based Candy"
          />
        </Field>
        <Field label="Tariff (HS) code" className="sm:col-span-2">
          <Input value={form.tariff_code} onChange={update("tariff_code")} placeholder="17049099" className="font-mono" />
        </Field>
        <datalist id="categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <datalist id="origins">
          {origins.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
        <datalist id="materials">
          {materials.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </form>
    </Modal>
  );
}
