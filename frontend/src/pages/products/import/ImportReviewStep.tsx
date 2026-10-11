import { AlertTriangle, Copy, PackagePlus } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { ProductImportChange, ProductImportMode, ProductImportPreview, ProductImportRow } from "../../../api/types";
import { Badge, cn } from "../../../components/ui";
import { formatAmount } from "../../../lib/format";

type Tab = "new" | "existing" | "problems";

const MODES: { value: ProductImportMode; title: string; description: string }[] = [
  { value: "new_only", title: "Add new products only", description: "Already registered products stay exactly as they are." },
  {
    value: "upsert",
    title: "Add new and update registered products",
    description: "Registered products get the values from the file (only the differences listed above).",
  },
];

function formatValue(value: ProductImportChange["current"]): string {
  if (value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function TabButton({ active, onClick, children, count, tone }: { active: boolean; onClick: () => void; children: ReactNode; count: number; tone: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap",
        active ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800",
      )}
    >
      {children}
      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", tone)}>{count}</span>
    </button>
  );
}

function RowsTable({ rows, kind }: { rows: ProductImportRow[]; kind: Tab }) {
  if (!rows.length) return <p className="py-10 text-center text-sm text-slate-400">Nothing here.</p>;
  return (
    <div className="scrollbar-thin max-h-80 overflow-auto rounded-lg ring-1 ring-slate-200">
      <table className="w-full min-w-[640px] text-xs">
        <thead className="sticky top-0 bg-slate-50 text-left font-medium uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Row</th>
            <th className="px-3 py-2">JAN</th>
            <th className="px-3 py-2">{kind === "existing" ? "In the file" : "Name"}</th>
            {kind === "new" && <th className="px-3 py-2">Category</th>}
            {kind === "new" && <th className="px-3 py-2 text-right">Price</th>}
            {kind === "existing" && <th className="px-3 py-2">Registered as</th>}
            {kind === "existing" && <th className="px-3 py-2">Differences</th>}
            {kind === "problems" && <th className="px-3 py-2">Problem</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.row} className="align-top">
              <td className="px-3 py-2 tabular-nums text-slate-400">{row.row}</td>
              <td className="px-3 py-2 font-mono text-slate-500">{row.code || "—"}</td>
              <td className="max-w-[220px] px-3 py-2 text-slate-800">{row.name || "—"}</td>
              {kind === "new" && <td className="px-3 py-2 text-slate-500">{row.category || "—"}</td>}
              {kind === "new" && <td className="px-3 py-2 text-right tabular-nums">{row.unit_price != null ? formatAmount(row.unit_price) : "—"}</td>}
              {kind === "existing" && (
                <td className="max-w-[220px] px-3 py-2">
                  <div className="text-slate-800">{row.product_name}</div>
                  <div className="font-mono text-[11px] text-slate-400">
                    ID {row.product_id} · {row.product_code || "no code"}
                  </div>
                </td>
              )}
              {kind === "existing" && (
                <td className="px-3 py-2">
                  {row.changes.length === 0 ? (
                    <Badge tone="green">Identical</Badge>
                  ) : (
                    <ul className="space-y-0.5">
                      {row.changes.map((change) => (
                        <li key={change.field} className="text-slate-600">
                          <span className="font-medium text-slate-700">{change.label}:</span>{" "}
                          <span className="text-slate-400 line-through">{formatValue(change.current)}</span> →{" "}
                          <span className="font-medium text-amber-700">{formatValue(change.incoming)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              )}
              {kind === "problems" && (
                <td className="px-3 py-2">
                  <Badge tone={row.status === "duplicate" ? "amber" : "rose"}>{row.status === "duplicate" ? "Duplicate in file" : "Invalid"}</Badge>
                  <div className="mt-1 text-slate-600">{row.message}</div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ImportReviewStep({
  preview,
  mode,
  onModeChange,
}: {
  preview: ProductImportPreview;
  mode: ProductImportMode;
  onModeChange: (mode: ProductImportMode) => void;
}) {
  const [tab, setTab] = useState<Tab>(preview.existing.length ? "existing" : preview.new.length ? "new" : "problems");
  const changedCount = preview.existing.filter((row) => row.changes.length > 0).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-slate-200 ring-1 ring-slate-200">
        {[
          { label: "New products", value: preview.new.length, icon: <PackagePlus className="size-4 text-brand-600" /> },
          { label: "Already registered", value: preview.existing.length, icon: <Copy className="size-4 text-emerald-600" /> },
          { label: "Problems", value: preview.problems.length, icon: <AlertTriangle className="size-4 text-rose-500" /> },
        ].map((stat) => (
          <div key={stat.label} className="flex items-center gap-3 bg-white px-4 py-3">
            {stat.icon}
            <div>
              <div className="text-xs text-slate-500">{stat.label}</div>
              <div className="text-lg font-semibold tabular-nums text-slate-900">{stat.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-3 flex gap-1 overflow-x-auto border-b border-slate-200">
          <TabButton active={tab === "existing"} onClick={() => setTab("existing")} count={preview.existing.length} tone="bg-emerald-50 text-emerald-700">
            Already registered
          </TabButton>
          <TabButton active={tab === "new"} onClick={() => setTab("new")} count={preview.new.length} tone="bg-brand-50 text-brand-700">
            New
          </TabButton>
          <TabButton active={tab === "problems"} onClick={() => setTab("problems")} count={preview.problems.length} tone="bg-rose-50 text-rose-700">
            Problems
          </TabButton>
        </div>
        {tab === "existing" && preview.existing.length > 0 && (
          <p className="mb-2 text-xs text-slate-500">
            Matched by ID, then by JAN (also inside multi-codes like “A / B”), then by name for rows without a code. {changedCount} of{" "}
            {preview.existing.length} differ from the catalogue.
          </p>
        )}
        <RowsTable rows={preview[tab]} kind={tab} />
      </div>

      {preview.existing.length > 0 && (
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-slate-900">What to do with already registered products?</legend>
          {MODES.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer gap-3 rounded-lg p-3 ring-1 transition-colors",
                mode === option.value ? "bg-brand-50 ring-2 ring-brand-500" : "ring-slate-200 hover:bg-slate-50",
              )}
            >
              <input type="radio" name="import-mode" className="mt-0.5 size-4 accent-brand-600" checked={mode === option.value} onChange={() => onModeChange(option.value)} />
              <span>
                <span className="block text-sm font-medium text-slate-900">{option.title}</span>
                <span className="block text-xs text-slate-500">{option.description}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {preview.problems.length > 0 && <p className="text-xs text-slate-500">Rows listed under Problems are skipped.</p>}
    </div>
  );
}
