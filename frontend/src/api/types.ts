export interface ProductFields {
  code: string;
  name: string;
  material: string;
  origin: string;
  weight_g: number | null;
  unit_price: number | null;
  category: string;
  tariff_code: string;
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

export interface Customer extends Party {
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
  qty: number;
}

export interface BoxItem {
  line_id: string;
  qty: number;
}

export interface Box {
  id: string;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  gross_weight_kg: number | null;
  items: BoxItem[];
}

export interface InvoiceDocument {
  number: string;
  invoice_date: string;
  place: string;
  shipped_per: string;
  payment_terms: string;
  commercial_value: boolean;
  remarks: string;
  customer_id: number | null;
  sender: Party;
  addressee: Party;
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
