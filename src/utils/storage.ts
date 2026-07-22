import type { ItemRow } from "../pages/NewQuotationPage";
import type { InvoiceItemRow } from "../pages/NewInvoicePage";

const QUOTATION_KEY = "synnex_saved_quotations";
const INVOICE_KEY = "synnex_saved_invoices";

// ── Quotations ──

export interface SavedQuotation {
  id: string;
  name: string;
  savedAt: string;
  data: {
    recipient1: string;
    recipient2: string;
    recipient3: string;
    date: string;
    subject: string;
    salutation: string;
    items: ItemRow[];
    discount?: string;
    showDiscount?: boolean;
    notes?: string[];
  };
}

export function getSavedQuotations(): SavedQuotation[] {
  try {
    const raw = localStorage.getItem(QUOTATION_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveQuotation(q: SavedQuotation): void {
  const list = getSavedQuotations();
  const idx = list.findIndex((x) => x.id === q.id);
  if (idx >= 0) {
    list[idx] = q;
  } else {
    list.unshift(q);
  }
  localStorage.setItem(QUOTATION_KEY, JSON.stringify(list));
}

export function deleteQuotation(id: string): void {
  const list = getSavedQuotations().filter((x) => x.id !== id);
  localStorage.setItem(QUOTATION_KEY, JSON.stringify(list));
}

// ── Invoices ──

export interface SavedInvoice {
  id: string;
  name: string;
  savedAt: string;
  data: {
    recipient1: string;
    recipient2: string;
    recipient3: string;
    date: string;
    invoiceNo: string;
    items: InvoiceItemRow[];
    taxPercent: string;
    paymentsCredits: string;
    notes?: string[];
  };
}

export function getSavedInvoices(): SavedInvoice[] {
  try {
    const raw = localStorage.getItem(INVOICE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveInvoice(inv: SavedInvoice): void {
  const list = getSavedInvoices();
  const idx = list.findIndex((x) => x.id === inv.id);
  if (idx >= 0) {
    list[idx] = inv;
  } else {
    list.unshift(inv);
  }
  localStorage.setItem(INVOICE_KEY, JSON.stringify(list));
}

export function deleteInvoice(id: string): void {
  const list = getSavedInvoices().filter((x) => x.id !== id);
  localStorage.setItem(INVOICE_KEY, JSON.stringify(list));
}
