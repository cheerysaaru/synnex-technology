import type { ItemRow } from "../pages/NewQuotationPage";
import type { InvoiceItemRow } from "../pages/NewInvoicePage";

const API = "/api";

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

export async function getSavedQuotations(): Promise<SavedQuotation[]> {
  try {
    const res = await fetch(`${API}/quotations`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function saveQuotation(q: SavedQuotation): Promise<void> {
  await fetch(`${API}/quotations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(q),
  });
}

export async function deleteQuotation(id: string): Promise<void> {
  await fetch(`${API}/quotations/${id}`, { method: "DELETE" });
}

export async function getSavedInvoices(): Promise<SavedInvoice[]> {
  try {
    const res = await fetch(`${API}/invoices`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function saveInvoice(inv: SavedInvoice): Promise<void> {
  await fetch(`${API}/invoices`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(inv),
  });
}

export async function deleteInvoice(id: string): Promise<void> {
  await fetch(`${API}/invoices/${id}`, { method: "DELETE" });
}
