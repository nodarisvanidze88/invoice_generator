import { Download, FileSpreadsheet, Info, Layers, Upload } from "lucide-react";
import { useRef } from "react";

import { Badge, Button } from "../../../components/ui";
import { IMPORT_FIELDS } from "./importFields";

const IMPORTANCE_TONE = { required: "rose", recommended: "amber", optional: "slate" } as const;

export function ImportFormatGuide({ loading, onFile }: { loading: boolean; onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-5">
      <div className="flex gap-3 rounded-xl bg-sky-50 p-4 text-sm text-sky-900 ring-1 ring-sky-100">
        <Info className="mt-0.5 size-5 shrink-0 text-sky-600" />
        <div className="space-y-1">
          <p className="font-medium">Your file can have any layout.</p>
          <p className="text-sky-800">
            Any column order, extra columns, a title above the header row and several sheets are all fine — the sheet, the header row and the columns are
            detected automatically and you can correct them in the next step. Only <b>Product Name</b> is required.
          </p>
        </div>
      </div>

      <div className="scrollbar-thin max-h-72 overflow-auto rounded-lg ring-1 ring-slate-200">
        <table className="w-full min-w-[640px] text-xs">
          <thead className="sticky top-0 bg-slate-50 text-left font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Column</th>
              <th className="px-3 py-2" />
              <th className="px-3 py-2">Recognised header names</th>
              <th className="px-3 py-2">Example</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {IMPORT_FIELDS.map((field) => (
              <tr key={field.key} className="align-top">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-800">{field.label}</td>
                <td className="px-3 py-2">
                  <Badge tone={IMPORTANCE_TONE[field.importance]}>{field.importance}</Badge>
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {field.headers}
                  {field.note && <div className="mt-0.5 text-slate-400">{field.note}</div>}
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-500">{field.example}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Layers className="size-4" /> Several sheets? The sheet with product data is chosen for you; you can switch it in the next step.
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" icon={<FileSpreadsheet className="size-4" />} onClick={() => window.open("/api/products/import-template.xlsx")}>
          Download empty template
        </Button>
        <Button variant="secondary" size="sm" icon={<Download className="size-4" />} onClick={() => window.open("/api/products/export.xlsx")}>
          Export current catalogue
        </Button>
      </div>

      <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 px-6 py-8 text-center transition-colors hover:border-brand-400 hover:bg-slate-50">
        <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          {loading ? <FileSpreadsheet className="size-5 animate-pulse" /> : <Upload className="size-5" />}
        </div>
        <p className="text-sm font-semibold text-slate-900">{loading ? "Reading the workbook…" : "Choose an Excel file (.xlsx / .xlsm)"}</p>
        <p className="mt-1 text-xs text-slate-500">Nothing is saved until you confirm.</p>
        <input
          ref={input}
          type="file"
          accept=".xlsx,.xlsm"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            if (input.current) input.current.value = "";
          }}
        />
      </label>
    </div>
  );
}
