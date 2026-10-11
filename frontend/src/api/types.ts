export interface ProductFields {
  code: string;
  name: string;
  material: string;
  origin: string;
  weight_g: number | null;
  unit_price: number | null;
  category: string;
  tariff_code: string;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  keep_upright: boolean;
}

export interface Product extends ProductFields {
  id: number;
  updated_at: string;
}

export interface Party {
  name: string;
  address: string;
  phone: string;
  fax: string;
}

export interface CustomerFields extends Party {
  bill_to: Party | null;
}

export interface Customer extends CustomerFields {
  id: number;
  created_at: string;
}

export interface CompanyFields extends Party {
  place: string;
  shipped_per: string;
  payment_terms: string;
  currency_label: string;
  currency_symbol: string;
  trade_term_label: string;
  invoice_prefix: string;
  next_invoice_number: number;
  volumetric_divisor: number;
}

export interface Company extends CompanyFields {
  id: number;
}

export interface InvoiceLine {
  id: string;
  product_id: number | null;
  code: string;
  name: string;
  material: string;
  origin: string;
  weight_g: number | null;
  unit_price: number | null;
  category: string;
  tariff_code: string;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  keep_upright: boolean;
  qty: number;
}

export interface BoxItem {
  line_id: string;
  qty: number;
}

export interface Placement {
  line_id: string;
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  nx: number;
  ny: number;
  nz: number;
}

export interface Box {
  id: string;
  box_type_id: number | null;
  box_type_name: string;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  gross_weight_kg: number | null;
  items: BoxItem[];
  placements: Placement[];
}

export interface BoxTypeFields {
  name: string;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  tare_weight_kg: number;
  max_weight_kg: number;
  active: boolean;
}

export interface BoxType extends BoxTypeFields {
  id: number;
}

export interface AutoPackResult {
  boxes: Box[];
  unpacked: { line_id: string; qty: number; reason: string }[];
  estimated_line_ids: string[];
  volumetric_divisor: number;
}

export type ProductImportMode = "new_only" | "upsert";

export interface ProductImportChange {
  field: string;
  label: string;
  current: string | number | boolean | null;
  incoming: string | number | boolean | null;
}

export interface ProductImportRow {
  row: number;
  status: "new" | "existing" | "duplicate" | "invalid";
  code: string;
  name: string;
  category: string;
  unit_price: number | null;
  product_id: number | null;
  product_code: string;
  product_name: string;
  changes: ProductImportChange[];
  message: string;
}

export interface ProductImportPreview {
  new: ProductImportRow[];
  existing: ProductImportRow[];
  problems: ProductImportRow[];
}

export interface ProductImportSummary {
  created: number;
  updated: number;
  unchanged: number;
  skipped_existing: number;
  skipped_invalid: number;
}

export interface InvoiceDocument {
  number: string;
  invoice_date: string;
  place: string;
  shipped_per: string;
  payment_terms: string;
  commercial_value: boolean;
  remarks: string;
  pieces_override: number | null;
  gross_weight_override_kg: number | null;
  customer_id: number | null;
  sender: Party;
  addressee: Party;
  bill_to: Party | null;
  lines: InvoiceLine[];
  boxes: Box[];
}

export interface InvoiceTotals {
  net_weight_kg: number;
  qty: number;
  amount: number;
  gross_weight_kg: number;
  pieces: number;
  origins: string[];
  unpacked_qty: number;
  mismatched_lines: number;
}

export interface Invoice extends InvoiceDocument {
  id: number;
  created_at: string;
  updated_at: string;
  totals: InvoiceTotals;
}

export interface InvoiceSummary {
  id: number;
  number: string;
  invoice_date: string;
  addressee_name: string;
  line_count: number;
  totals: InvoiceTotals;
  updated_at: string;
}

export interface ProductQty {
  product_id: number;
  qty: number;
}

export interface InvoiceCreate {
  items: ProductQty[];
  customer_id: number | null;
  invoice_date: string | null;
  number: string | null;
}

export interface ImportRow {
  row: number;
  code: string;
  csv_name: string;
  qty: number | null;
  csv_unit_price: number | null;
  product_id: number | null;
  status: "matched" | "new";
  current: ProductFields | null;
}

export interface ImportPreview {
  filename: string;
  encoding: string;
  rows: ImportRow[];
  new_count: number;
  matched_count: number;
}

export interface ImportApplyRow extends ProductFields {
  product_id: number | null;
  qty: number | null;
}

export interface ImportResult {
  created: number;
  updated: number;
  selection: ProductQty[];
}

export interface ImportColumn {
  index: number;
  letter: string;
  header: string;
  samples: string[];
}

export interface ImportSheet {
  name: string;
  recognized: number;
  header_row: number;
  recommended: boolean;
}

export interface ImportLayout {
  sheet: string;
  header_row: number;
  mapping: Record<string, number>;
  weight_in_kg: boolean;
}

export interface ImportInspection {
  sheets: ImportSheet[];
  layout: ImportLayout;
  columns: ImportColumn[];
  data_rows: number;
  unmapped_headers: string[];
}
