export interface ImportField {
  key: string;
  label: string;
  importance: "required" | "recommended" | "optional";
  headers: string;
  example: string;
  note?: string;
}

export const IMPORT_FIELDS: ImportField[] = [
  {
    key: "name",
    label: "Product Name",
    importance: "required",
    headers: "Product Name, Name, Item, Description, 商品名, 品名",
    example: "Pineapple Candy 110g",
  },
  {
    key: "code",
    label: "JAN / Code",
    importance: "recommended",
    headers: "JAN, JAN / Code, Barcode, EAN, Code, SKU, 商品コード",
    example: "4902435012749",
    note: "Used to recognise products that are already registered. A column of 8–14 digit numbers is detected even without a header.",
  },
  { key: "unit_price", label: "Unit Price", importance: "recommended", headers: "Unit Price, Price, Cost, 単価", example: "132.11" },
  {
    key: "weight_g",
    label: "Weight",
    importance: "recommended",
    headers: "Weight(g), Weight, Weight (kg), 重量",
    example: "120",
    note: "Grams by default; a header containing “kg” is converted to grams.",
  },
  { key: "category", label: "Product Category", importance: "recommended", headers: "Product Category, Category, カテゴリ", example: "Sugar-based Candy" },
  { key: "tariff_code", label: "Tariff Code", importance: "recommended", headers: "Tariff Code, HS Code, HS, 関税コード", example: "17049099" },
  { key: "material", label: "Material", importance: "optional", headers: "Material, 素材, 材質", example: "Plastic" },
  { key: "origin", label: "Origin", importance: "optional", headers: "Origin, Country of Origin, Made in, 原産国", example: "Japan" },
  { key: "length_cm", label: "Length (cm)", importance: "optional", headers: "Length (cm), Length, 長さ", example: "18" },
  { key: "width_cm", label: "Width (cm)", importance: "optional", headers: "Width (cm), Width, 幅", example: "12" },
  { key: "height_cm", label: "Height (cm)", importance: "optional", headers: "Height (cm), Height, 高さ", example: "4" },
  { key: "keep_upright", label: "Keep upright", importance: "optional", headers: "Keep upright, Upright, This side up", example: "Yes / No" },
  {
    key: "id",
    label: "ID",
    importance: "optional",
    headers: "ID",
    example: "1053",
    note: "Only present in files exported from this app — the most reliable match.",
  },
];
