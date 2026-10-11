import { AlertTriangle, CheckCircle2, Layers, Star } from "lucide-react";
import { useEffect, useState } from "react";

import type { ImportInspection, ImportLayout } from "../../../api/types";
import { Badge, Input, Select, cn } from "../../../components/ui";
import { formatInt } from "../../../lib/format";
import { IMPORT_FIELDS } from "./importFields";

const NOT_IN_FILE = "";

export function ColumnMappingStep({
  inspection,
  layout,
  onLayoutChange,
  onSheetChange,
  onHeaderRowChange,
  reloading,
}: {
  inspection: ImportInspection;
  layout: ImportLayout;
  onLayoutChange: (layout: ImportLayout) => void;
  onSheetChange: (sheet: string) => void;
  onHeaderRowChange: (row: number) => void;
  reloading: boolean;
}) {
  const [headerRowText, setHeaderRowText] = useState(String(layout.header_row));
  useEffect(() => setHeaderRowText(String(layout.header_row)), [layout.header_row]);

  const columnsByIndex = new Map(inspection.columns.map((column) => [column.index, column]));
  const usage = new Map<number, number>();
  for (const index of Object.values(layout.mapping)) usage.set(index, (usage.get(index) ?? 0) + 1);
  const mappedIndexes = new Set(Object.values(layout.mapping));
  const ignored = inspection.columns.filter((column) => !mappedIndexes.has(column.index) && (column.header || column.samples.some(Boolean)));

  const setField = (field: string, value: string) => {
    const mapping = { ...layout.mapping };
    if (value === NOT_IN_FILE) delete mapping[field];
    else mapping[field] = Number(value);
    onLayoutChange({ ...layout, mapping });
  };

  const commitHeaderRow = () => {
    const row = Number(headerRowText);
    if (Number.isInteger(row) && row >= 1 && row !== layout.header_row) onHeaderRowChange(row);
    else setHeaderRowText(String(layout.header_row));
  };

  return (
    <div className={cn("space-y-5", reloading && "pointer-events-none opacity-60")}>
      <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
        <label className="block">
          <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <Layers className="size-3.5" /> Sheet ({inspection.sheets.length} in this file)
          </span>
          <Select value={layout.sheet} onChange={(e) => onSheetChange(e.target.value)}>
            {inspection.sheets.map((sheet) => (
              <option key={sheet.name} value={sheet.name}>
                {sheet.name} — {sheet.recognized} columns recognised{sheet.recommended ? "  ★ best match" : ""}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-600">Header row</span>
          <Input
            type="number"
            min={1}
            value={headerRowText}
            onChange={(e) => setHeaderRowText(e.target.value)}
            onBlur={commitHeaderRow}
            onKeyDown={(e) => e.key === "Enter" && commitHeaderRow()}
          />
        </label>
      </div>

      <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
        {inspection.data_rows > 0 ? <CheckCircle2 className="size-4 text-emerald-500" /> : <AlertTriangle className="size-4 text-amber-500" />}
        <b className="text-slate-900">{formatInt(inspection.data_rows)}</b> data rows below row {layout.header_row} on “{layout.sheet}”.
        {inspection.sheets.find((s) => s.name === layout.sheet)?.recommended && (
          <Badge tone="green">
            <Star className="size-3" /> best match
          </Badge>
        )}
      </p>

      <div className="scrollbar-thin max-h-[22rem] overflow-auto rounded-lg ring-1 ring-slate-200">
        <table className="w-full min-w-[640px] text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Field</th>
              <th className="w-64 px-3 py-2">Column in your file</th>
              <th className="px-3 py-2">Values from the first rows</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {IMPORT_FIELDS.map((field) => {
              const index = layout.mapping[field.key];
              const column = index !== undefined ? columnsByIndex.get(index) : undefined;
              const missingRequired = field.importance === "required" && column === undefined;
              const sharedColumn = index !== undefined && (usage.get(index) ?? 0) > 1;
              return (
                <tr key={field.key} className={cn(missingRequired && "bg-rose-50/60")}>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className="font-medium text-slate-800">{field.label}</span>
                    {field.importance === "required" && <span className="ml-1 text-rose-500">*</span>}
                    {field.key === "weight_g" && column && (
                      <label className="ml-2 inline-flex items-center gap-1 text-[11px] text-slate-500">
                        <input
                          type="checkbox"
                          className="size-3.5 accent-brand-600"
                          checked={layout.weight_in_kg}
                          onChange={(e) => onLayoutChange({ ...layout, weight_in_kg: e.target.checked })}
                        />
                        values are in kg
                      </label>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    <Select
                      value={index === undefined ? NOT_IN_FILE : String(index)}
                      onChange={(e) => setField(field.key, e.target.value)}
                      className={cn("h-8 text-xs", missingRequired && "ring-rose-400", sharedColumn && "ring-amber-400")}
                    >
                      <option value={NOT_IN_FILE}>— Not in file —</option>
                      {inspection.columns.map((c) => (
                        <option key={c.index} value={c.index}>
                          {c.letter} · {c.header || "(no header)"}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="max-w-[260px] px-3 py-2 text-slate-500">
                    {column ? (
                      <span className="line-clamp-2">{column.samples.filter(Boolean).join(" · ") || <i className="text-slate-400">empty in the first rows</i>}</span>
                    ) : field.importance === "recommended" ? (
                      <span className="text-amber-600">Not found — will be left empty</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                    {sharedColumn && <div className="text-amber-600">Same column is used for another field</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {layout.mapping.code === undefined && layout.mapping.id === undefined && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          No JAN / Code column is mapped — registered products can only be recognised by their exact name, so duplicates are possible.
        </p>
      )}
      {ignored.length > 0 && (
        <p className="text-xs text-slate-500">
          <b className="text-slate-600">Ignored columns:</b> {ignored.map((c) => `${c.letter} · ${c.header || "(no header)"}`).join(", ")}
        </p>
      )}
    </div>
  );
}
