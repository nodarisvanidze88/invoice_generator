import clsx from "clsx";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FilePlus2,
  Package,
  Pencil,
  Plus,
  Search,
  ShoppingCart,
  Tags,
  Trash2,
  Weight,
  X,
} from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { toast } from "sonner";

import { useDeleteProducts, useProducts } from "../../api/hooks";
import type { Product } from "../../api/types";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Input,
  PageHeader,
  PageLoader,
  Select,
  StatCard,
} from "../../components/ui";
import { formatAmount, formatInt, formatKg, formatPrice } from "../../lib/format";
import { useSelection } from "../../store/selection";
import { CreateInvoiceModal } from "./CreateInvoiceModal";
import { ProductFormModal } from "./ProductFormModal";

const PAGE_SIZE = 50;
const ALL = "";

function matchesSearch(product: Product, needle: string): boolean {
  if (!needle) return true;
  return [product.code, product.name, product.category, product.tariff_code, product.material]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

export function ProductsPage() {
  const products = useProducts();
  const deleteProducts = useDeleteProducts();
  const { quantities, toggle, setQty, selectMany, deselectMany, clear } = useSelection();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL);
  const [origin, setOrigin] = useState(ALL);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Product[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const all = products.data ?? [];
  const productsById = useMemo(() => new Map(all.map((p) => [p.id, p])), [all]);

  const { categories, origins } = useMemo(() => {
    const categorySet = new Set<string>();
    const originSet = new Set<string>();
    for (const p of all) {
      if (p.category) categorySet.add(p.category);
      if (p.origin) originSet.add(p.origin);
    }
    return { categories: [...categorySet].sort(), origins: [...originSet].sort() };
  }, [all]);

  const filtered = useMemo(
    () =>
      all.filter(
        (p) =>
          matchesSearch(p, deferredSearch) &&
          (category === ALL || p.category === category) &&
          (origin === ALL || p.origin === origin) &&
          (!selectedOnly || p.id in quantities),
      ),
    [all, deferredSearch, category, origin, selectedOnly, quantities],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const visibleSelected = visible.filter((p) => p.id in quantities).length;

  const selection = useMemo(() => {
    const items = Object.entries(quantities)
      .map(([id, qty]) => ({ product: productsById.get(Number(id)), qty }))
      .filter((entry): entry is { product: Product; qty: number } => Boolean(entry.product));
    return {
      items: items.filter((entry) => entry.qty > 0).map((entry) => ({ product_id: entry.product.id, qty: entry.qty })),
      count: items.length,
      qty: items.reduce((sum, e) => sum + e.qty, 0),
      netKg: items.reduce((sum, e) => sum + ((e.product.weight_g ?? 0) * e.qty) / 1000, 0),
      amount: items.reduce((sum, e) => sum + (e.product.unit_price ?? 0) * e.qty, 0),
      zeroQty: items.filter((e) => e.qty <= 0).length,
    };
  }, [quantities, productsById]);

  const resetPage = () => setPage(0);

  const confirmDelete = () => {
    if (!toDelete) return;
    const ids = toDelete.map((p) => p.id);
    deleteProducts.mutate(ids, {
      onSuccess: () => {
        deselectMany(ids);
        toast.success(ids.length === 1 ? "Product deleted" : `${ids.length} products deleted`);
        setToDelete(null);
      },
      onError: (error) => toast.error(error.message),
    });
  };

  if (products.isLoading) return <PageLoader />;

  return (
    <div className={clsx(selection.count > 0 && "pb-28")}>
      <PageHeader
        title="Products"
        description="Select products and quantities, then create an invoice."
        actions={
          <>
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => window.open("/api/products/export.xlsx")}>
              Export Excel
            </Button>
            <Button
              icon={<Plus className="size-4" />}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              Add product
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Products in catalogue" value={formatInt(all.length)} icon={<Package className="size-5" />} />
        <StatCard label="Categories" value={formatInt(categories.length)} icon={<Tags className="size-5" />} />
        <StatCard
          label="Selected"
          value={`${selection.count} items`}
          hint={`${formatInt(selection.qty)} pcs`}
          icon={<ShoppingCart className="size-5" />}
        />
        <StatCard
          label="Selection value"
          value={formatAmount(selection.amount)}
          hint={formatKg(selection.netKg)}
          icon={<Weight className="size-5" />}
        />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                resetPage();
              }}
              placeholder="Search by JAN, name, category, tariff…"
              className="pl-9"
            />
          </div>
          <Select
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              resetPage();
            }}
            className="w-full sm:w-56"
          >
            <option value={ALL}>All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select
            value={origin}
            onChange={(event) => {
              setOrigin(event.target.value);
              resetPage();
            }}
            className="w-full sm:w-40"
          >
            <option value={ALL}>All origins</option>
            {origins.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </Select>
          <div className="flex rounded-lg bg-slate-100 p-1 text-xs font-medium">
            {[
              { value: false, label: "All" },
              { value: true, label: `Selected (${selection.count})` },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => {
                  setSelectedOnly(option.value);
                  resetPage();
                }}
                className={clsx(
                  "rounded-md px-3 py-1.5 transition-colors",
                  selectedOnly === option.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Search className="size-5" />}
            title="No products found"
            description="Try a different search term or clear the filters."
          />
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="w-12 px-4 py-3">
                    <Checkbox
                      label="Select page"
                      checked={visible.length > 0 && visibleSelected === visible.length}
                      indeterminate={visibleSelected > 0}
                      onChange={(checked) =>
                        checked ? selectMany(visible.map((p) => p.id)) : deselectMany(visible.map((p) => p.id))
                      }
                    />
                  </th>
                  <th className="px-3 py-3">Product</th>
                  <th className="px-3 py-3">Category · Tariff</th>
                  <th className="px-3 py-3">Origin</th>
                  <th className="px-3 py-3 text-right">Weight</th>
                  <th className="px-3 py-3 text-right">Unit price</th>
                  <th className="w-32 px-3 py-3 text-center">Qty</th>
                  <th className="w-24 px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((product) => {
                  const selected = product.id in quantities;
                  return (
                    <tr key={product.id} className={clsx("group transition-colors", selected ? "bg-brand-50/50" : "hover:bg-slate-50")}>
                      <td className="px-4 py-2.5">
                        <Checkbox label={`Select ${product.name}`} checked={selected} onChange={() => toggle(product.id)} />
                      </td>
                      <td className="max-w-[380px] px-3 py-2.5">
                        <div className="truncate font-medium text-slate-900" title={product.name}>
                          {product.name}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2">
                          <span className="truncate font-mono text-[11px] text-slate-400" title={product.code}>
                            {product.code || "no code"}
                          </span>
                          {product.material && <Badge>{product.material}</Badge>}
                        </div>
                      </td>
                      <td className="max-w-[260px] px-3 py-2.5">
                        <div className="truncate text-slate-700">{product.category || <span className="text-slate-400">—</span>}</div>
                        <div className="font-mono text-[11px] text-slate-400">{product.tariff_code}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        {product.origin ? <Badge tone={product.origin.trim() === "Japan" ? "rose" : "sky"}>{product.origin}</Badge> : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                        {product.weight_g != null ? `${formatPrice(product.weight_g)} g` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                        {product.unit_price != null ? formatAmount(product.unit_price).replace(/\.00$/, "") : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        {selected ? (
                          <Input
                            type="number"
                            min={0}
                            value={quantities[product.id] || ""}
                            onChange={(event) => setQty(product.id, Number(event.target.value))}
                            className={clsx("h-8 text-center tabular-nums", quantities[product.id] <= 0 && "ring-rose-400")}
                            aria-label="Quantity"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggle(product.id)}
                            className="mx-auto flex h-8 w-full items-center justify-center gap-1 rounded-lg text-xs font-medium text-slate-400 opacity-0 transition hover:bg-brand-50 hover:text-brand-700 group-hover:opacity-100"
                          >
                            <Plus className="size-3.5" /> Add
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-0.5">
                          <IconButton
                            label="Edit"
                            onClick={() => {
                              setEditing(product);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil className="size-4" />
                          </IconButton>
                          <IconButton label="Delete" tone="danger" onClick={() => setToDelete([product])}>
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

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
          <span>
            Showing <b className="text-slate-700">{visible.length ? currentPage * PAGE_SIZE + 1 : 0}</b>–
            <b className="text-slate-700">{currentPage * PAGE_SIZE + visible.length}</b> of{" "}
            <b className="text-slate-700">{formatInt(filtered.length)}</b>
          </span>
          <div className="flex items-center gap-2">
            <IconButton label="Previous page" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
              <ChevronLeft className="size-4" />
            </IconButton>
            <span className="tabular-nums">
              {currentPage + 1} / {pageCount}
            </span>
            <IconButton label="Next page" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>
              <ChevronRight className="size-4" />
            </IconButton>
          </div>
        </div>
      </Card>

      {selection.count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4 lg:pl-64">
          <div className="mx-auto flex max-w-[1340px] flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl bg-slate-900 px-5 py-3.5 text-white shadow-2xl shadow-slate-900/30">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-brand-600">
                <ShoppingCart className="size-4" />
              </div>
              <div>
                <div className="text-sm font-semibold">{selection.count} products selected</div>
                <div className="text-xs text-slate-400">
                  {formatInt(selection.qty)} pcs · {formatKg(selection.netKg)}
                  {selection.zeroQty > 0 && <span className="text-amber-300"> · {selection.zeroQty} with qty 0 will be skipped</span>}
                </div>
              </div>
            </div>
            <div className="text-lg font-semibold tabular-nums">{formatAmount(selection.amount)}</div>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-slate-300 hover:bg-white/10 hover:text-white"
                icon={<Trash2 className="size-3.5" />}
                onClick={() => setToDelete(Object.keys(quantities).map((id) => productsById.get(Number(id))).filter((p): p is Product => Boolean(p)))}
              >
                Delete products
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-slate-300 hover:bg-white/10 hover:text-white"
                icon={<X className="size-3.5" />}
                onClick={clear}
              >
                Clear selection
              </Button>
              <Button size="sm" icon={<FilePlus2 className="size-4" />} onClick={() => setCreateOpen(true)} disabled={!selection.items.length}>
                Create invoice
              </Button>
            </div>
          </div>
        </div>
      )}

      <ProductFormModal open={formOpen} product={editing} products={all} onClose={() => setFormOpen(false)} />
      <CreateInvoiceModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        items={selection.items}
        totals={selection}
      />
      <ConfirmDialog
        open={toDelete !== null}
        title={toDelete && toDelete.length > 1 ? `Delete ${toDelete.length} products?` : "Delete product?"}
        description={
          toDelete && toDelete.length === 1
            ? `"${toDelete[0].name}" will be removed from the catalogue. Existing invoices keep their copy.`
            : "The selected products will be removed from the catalogue. Existing invoices keep their copies."
        }
        loading={deleteProducts.isPending}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
