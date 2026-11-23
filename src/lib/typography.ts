/* Text size and weight for each part of a printed document.
   Settings only store the parts you changed; everything else follows the
   layout's own defaults. A part set to null means "back to default". */

export type Weight = "light" | "regular" | "semibold" | "bold";
export type TextRole =
  | "name"
  | "title"
  | "body"
  | "customer"
  | "labels"
  | "headings"
  | "tableHead"
  | "table"
  | "totals"
  | "grandTotal"
  | "footer";
export type TextCase = "upper" | "lower" | "title";
export type TextStyle = { size: number; weight: Weight; color?: string; case?: TextCase };
export type TextOverrides = Partial<Record<TextRole, TextStyle | null>>;

export const TEXT_ROLES: { role: TextRole; label: string; hint: string }[] = [
  { role: "name", label: "Company name", hint: "In the letterhead" },
  { role: "title", label: "Document title", hint: "QUOTATION, INVOICE…" },
  { role: "body", label: "Body text", hint: "Paragraphs, notes, terms, address lines" },
  { role: "customer", label: "Customer name", hint: "First line of the customer block" },
  { role: "labels", label: "Labels", hint: "Date:, Quotation No.:, Valid until:" },
  { role: "headings", label: "Section headings", hint: "Customer, Terms, Bank details…" },
  { role: "tableHead", label: "Table header", hint: "No., Description, Qty, Rate…" },
  { role: "table", label: "Table rows", hint: "Item descriptions and amounts" },
  { role: "totals", label: "Totals", hint: "Subtotal, discount, tax" },
  { role: "grandTotal", label: "Grand total", hint: "Total quote, balance due" },
  { role: "footer", label: "Footer", hint: "Contact line at the bottom" },
];

export const WEIGHTS: [Weight, string][] = [
  ["light", "Light"],
  ["regular", "Regular"],
  ["semibold", "Semi-bold"],
  ["bold", "Bold"],
];

const SIMPLE: Record<TextRole, TextStyle> = {
  name: { size: 16, weight: "semibold" },
  title: { size: 15, weight: "semibold" },
  body: { size: 9.2, weight: "regular" },
  customer: { size: 9.6, weight: "regular" },
  labels: { size: 9.2, weight: "semibold" },
  headings: { size: 9.4, weight: "semibold" },
  tableHead: { size: 9.2, weight: "regular" },
  table: { size: 9.2, weight: "regular" },
  totals: { size: 9.6, weight: "regular" },
  grandTotal: { size: 9.6, weight: "semibold" },
  footer: { size: 8.8, weight: "regular" },
};

const BOXED: Record<TextRole, TextStyle> = {
  name: { size: 17, weight: "regular" },
  title: { size: 25, weight: "light" },
  body: { size: 9.2, weight: "regular" },
  customer: { size: 9.2, weight: "regular" },
  labels: { size: 7.4, weight: "semibold" },
  headings: { size: 7.6, weight: "semibold" },
  tableHead: { size: 7.6, weight: "semibold" },
  table: { size: 9.2, weight: "regular" },
  totals: { size: 8.6, weight: "semibold" },
  grandTotal: { size: 10.2, weight: "semibold" },
  footer: { size: 8.8, weight: "regular" },
};

export const SIZE_MIN = 6;
export const SIZE_MAX = 40;
export const clampSize = (n: number) => Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.round(n * 10) / 10));

export function layoutDefaults(layout: string | undefined): Record<TextRole, TextStyle> {
  return layout === "boxed" ? BOXED : SIMPLE;
}

/* Every part's size and weight, with your changes applied. */
export function resolveText(layout: string | undefined, overrides: TextOverrides | undefined): Record<TextRole, TextStyle> {
  return applyOverrides(layoutDefaults(layout), overrides);
}

/* Sizes saved as the default, then this document's own changes on top. */
export function applyOverrides(base: Record<TextRole, TextStyle>, overrides: TextOverrides | undefined): Record<TextRole, TextStyle> {
  const out = { ...base };
  for (const { role } of TEXT_ROLES) {
    const o = overrides?.[role];
    if (o && typeof o === "object") {
      out[role] = {
        size: Number.isFinite(Number(o.size)) ? clampSize(Number(o.size)) : base[role].size,
        weight: (["light", "regular", "semibold", "bold"] as Weight[]).includes(o.weight) ? o.weight : base[role].weight,
        color: isHex(o.color) ? o.color : base[role].color,
        case: o.case === "upper" || o.case === "lower" || o.case === "title" ? o.case : base[role].case,
      };
    }
  }
  return out;
}

export const isHex = (c: unknown): c is string => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);

/* The colour each part prints in when you have not picked one. */
export function defaultColor(role: TextRole, primary: string): string {
  if (role === "name" || role === "title") return primary;
  if (role === "footer") return "#4D4D4D";
  return "#262626";
}
export function withColors(base: Record<TextRole, TextStyle>, primary: string): Record<TextRole, TextStyle> {
  const out = { ...base };
  for (const { role } of TEXT_ROLES) out[role] = { ...base[role], color: base[role].color || defaultColor(role, primary) };
  return out;
}

export const CASES: [TextCase | "", string, string][] = [
  ["", "Aa", "As typed"],
  ["upper", "ABC", "ALL CAPITALS"],
  ["lower", "abc", "all small letters"],
  ["title", "Abc", "Mixed (Title Case)"],
];

/* Change the letter case of plain text. "title" capitalises each word. */
export function applyCase(text: string, c: TextCase | "sentence" | undefined): string {
  if (!c || !text) return text;
  if (c === "upper") return text.toUpperCase();
  if (c === "lower") return text.toLowerCase();
  if (c === "sentence") return text.toLowerCase().replace(/(^\s*|[.!?]\s+)(\p{L})/gu, (_m, a, b) => a + b.toUpperCase());
  return text.toLowerCase().replace(/(^|[\s(\-/"'])(\p{L})/gu, (_m, a, b) => a + b.toUpperCase());
}
