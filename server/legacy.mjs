// Converts records saved by the previous version of the app.
const toIso = (d) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(d || '').trim());
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return /^\d{4}-\d{2}-\d{2}/.test(String(d || '')) ? String(d).slice(0, 10) : new Date().toISOString().slice(0, 10);
};
const n = (v) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : null;
};

export function legacyToDocument(type, saved) {
  const d = saved?.data || {};
  const items = (d.items || []).map((r, i) => ({
    id: `l${i}`,
    kind: 'item',
    description: r.description || '',
    unit: r.unit || '',
    qty: n(r.qty),
    rate: n(r.rate),
    discount: n(r.discount),
  }));
  const base = {
    type,
    issueDate: toIso(d.date),
    customer: { name: d.recipient1 || saved?.name || '', attention: '', line1: d.recipient2 || '', line2: d.recipient3 || '', line3: '', phone: '', email: '' },
    items,
    notes: (d.notes || []).filter((x) => String(x).trim()),
  };
  if (type === 'quotation') {
    return {
      ...base,
      salutation: d.salutation ? `${d.salutation},` : 'Sir,',
      subject: d.subject || '',
      discount: { mode: 'amount', value: d.showDiscount === false ? 0 : n(d.discount) || 0 },
    };
  }
  return {
    ...base,
    number: d.invoiceNo || '',
    columns: { unit: true, qty: true, rate: true, discount: items.some((i) => i.discount) },
    tax: { percent: n(d.taxPercent) || 0 },
    paid: n(d.paymentsCredits) || 0,
  };
}
