// Totals for a document. Mirrors src/lib/calc.ts — keep the two in step.
const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export function computeTotals(data = {}) {
  const items = Array.isArray(data.items) ? data.items : [];
  const useDiscount = Boolean(data.columns?.discount);
  let subtotal = 0;
  for (const it of items) {
    if (it?.kind === 'heading') continue;
    subtotal += num(it?.qty) * num(it?.rate) - (useDiscount ? num(it?.discount) : 0);
  }
  subtotal = round2(subtotal);
  const d = data.discount || {};
  const discount = round2(Math.min(subtotal, d.mode === 'percent' ? (subtotal * num(d.value)) / 100 : num(d.value)));
  const taxable = Math.max(0, subtotal - discount);
  const tax = round2((taxable * num(data.tax?.percent)) / 100);
  const total = round2(taxable + tax);
  const paid = round2(num(data.paid));
  return { subtotal, discount, tax, total, paid, balance: round2(total - paid) };
}
