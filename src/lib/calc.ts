/* Totals and formatting. Mirrors server/calc.mjs — keep the two in step. */
import type { DocData, LineItem, Totals } from "../types";

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function lineAmount(it: LineItem, useDiscount: boolean): number | null {
  if (it.kind === "heading") return null;
  if (it.qty == null || it.rate == null) return null;
  return round2(num(it.qty) * num(it.rate) - (useDiscount ? num(it.discount) : 0));
}

export function computeTotals(d: Pick<DocData, "items" | "columns" | "discount" | "tax" | "paid">): Totals {
  let subtotal = 0;
  for (const it of d.items || []) {
    if (it.kind === "heading") continue;
    subtotal += num(it.qty) * num(it.rate) - (d.columns?.discount ? num(it.discount) : 0);
  }
  subtotal = round2(subtotal);
  const discount = round2(
    Math.min(subtotal, d.discount?.mode === "percent" ? (subtotal * num(d.discount.value)) / 100 : num(d.discount?.value)),
  );
  const taxable = Math.max(0, subtotal - discount);
  const tax = round2((taxable * num(d.tax?.percent)) / 100);
  const total = round2(taxable + tax);
  const paid = round2(num(d.paid));
  return { subtotal, discount, tax, total, paid, balance: round2(total - paid) };
}

export function money(n: number): string {
  return (n || 0).toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function qtyText(n: number | null): string {
  if (n == null) return "";
  return Number.isInteger(n) ? n.toLocaleString("en-LK") : n.toLocaleString("en-LK", { maximumFractionDigits: 3 });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(iso: string, format = "DD/MM/YYYY"): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return iso || "";
  const [, y, mo, d] = m;
  if (format === "D MMM YYYY") return `${Number(d)} ${MONTHS[Number(mo) - 1]} ${y}`;
  if (format === "YYYY-MM-DD") return `${y}-${mo}-${d}`;
  if (format === "MM/DD/YYYY") return `${mo}/${d}/${y}`;
  return `${d}/${mo}/${y}`;
}

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* Amount in words, South Asian grouping (lakh / crore), with cents. */
const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function below1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ""));
  } else if (n > 0) {
    parts.push(ONES[n]);
  }
  return parts.join(" ");
}

function integerWords(num: number): string {
  if (num === 0) return "zero";
  const parts: string[] = [];
  const crores = Math.floor(num / 10_000_000);
  const lakhs = Math.floor((num % 10_000_000) / 100_000);
  const thousands = Math.floor((num % 100_000) / 1000);
  const rest = num % 1000;
  if (crores) parts.push(`${crores >= 1000 ? integerWords(crores) : below1000(crores)} crore`);
  if (lakhs) parts.push(`${below1000(lakhs)} lakh`);
  if (thousands) parts.push(`${below1000(thousands)} thousand`);
  if (rest) parts.push(below1000(rest));
  return parts.join(" ");
}

export function amountInWords(amount: number, currency = "Rupees"): string {
  const n = Math.max(0, round2(amount || 0));
  const whole = Math.floor(n);
  const cents = Math.round((n - whole) * 100);
  let s = `${currency} ${integerWords(whole)}`;
  if (cents) s += ` and cents ${integerWords(cents)}`;
  s += " only";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
