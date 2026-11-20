/* Converts quotations/invoices saved in the browser by the previous version. */
export const LEGACY_KEYS = { quotations: "synnex_saved_quotations", invoices: "synnex_saved_invoices" };

export function readLegacy(): { quotations: unknown[]; invoices: unknown[] } {
  const read = (k: string) => {
    try {
      const v = JSON.parse(localStorage.getItem(k) || "[]");
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };
  return { quotations: read(LEGACY_KEYS.quotations), invoices: read(LEGACY_KEYS.invoices) };
}

const toIso = (d: string) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(d || "").trim());
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : undefined;
};
const n = (v: unknown) => {
  const x = parseFloat(String(v ?? ""));
  return Number.isFinite(x) ? x : null;
};

type Legacy = { name?: string; data?: Record<string, unknown> & { items?: Record<string, unknown>[]; notes?: string[] } };

export function legacyToData(type: "quotation" | "invoice", saved: unknown): Record<string, unknown> {
  const s = saved as Legacy;
  const d = s?.data || {};
  const items = (d.items || []).map((r, i) => ({
    id: `l${i}`,
    kind: "item",
    description: String(r.description || ""),
    unit: String(r.unit || ""),
    qty: n(r.qty),
    rate: n(r.rate),
    discount: n(r.discount),
  }));
  const base = {
    issueDate: toIso(String(d.date || "")),
    customer: { name: String(d.recipient1 || s?.name || ""), line1: String(d.recipient2 || ""), line2: String(d.recipient3 || "") },
    items,
    notes: (d.notes || []).filter((x) => String(x).trim()),
  };
  if (type === "quotation") {
    return { ...base, salutation: d.salutation ? `${d.salutation},` : "Sir,", subject: String(d.subject || ""), discount: { mode: "amount", value: d.showDiscount === false ? 0 : n(d.discount) || 0 } };
  }
  return { ...base, number: String(d.invoiceNo || ""), columns: { discount: items.some((i) => i.discount) }, tax: { percent: n(d.taxPercent) || 0 }, paid: n(d.paymentsCredits) || 0 };
}
