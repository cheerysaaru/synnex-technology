import type { ItemRow } from "../pages/NewQuotationPage";
import type { InvoiceItemRow } from "../pages/NewInvoicePage";
import { supabase } from "../lib/supabase";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const useCloud = !!(supabaseUrl && supabaseKey);

const QUOTATION_KEY = "synnex_saved_quotations";
const INVOICE_KEY = "synnex_saved_invoices";

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

// ── localStorage helpers ──

function readLocal<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocal(key: string, list: unknown[]) {
  localStorage.setItem(key, JSON.stringify(list));
}

// ── Exported API ──

export async function getSavedQuotations(): Promise<SavedQuotation[]> {
  if (useCloud) {
    const { data, error } = await supabase
      .from("items")
      .select("*")
      .eq("type", "quotation")
      .order("saved_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      savedAt: item.saved_at,
      data: item.data as SavedQuotation["data"],
    }));
  }
  return readLocal<SavedQuotation>(QUOTATION_KEY);
}

export async function saveQuotation(q: SavedQuotation): Promise<void> {
  if (useCloud) {
    const { error } = await supabase.from("items").insert({
      id: q.id,
      type: "quotation",
      name: q.name,
      saved_at: q.savedAt,
      data: q.data,
    });
    if (error) throw error;
    return;
  }
  const list = readLocal<SavedQuotation>(QUOTATION_KEY);
  const idx = list.findIndex((x) => x.id === q.id);
  if (idx >= 0) list[idx] = q;
  else list.unshift(q);
  writeLocal(QUOTATION_KEY, list);
}

export async function deleteQuotation(id: string): Promise<void> {
  if (useCloud) {
    const { error } = await supabase.from("items").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  const list = readLocal<SavedQuotation>(QUOTATION_KEY).filter((x) => x.id !== id);
  writeLocal(QUOTATION_KEY, list);
}

export async function getSavedInvoices(): Promise<SavedInvoice[]> {
  if (useCloud) {
    const { data, error } = await supabase
      .from("items")
      .select("*")
      .eq("type", "invoice")
      .order("saved_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      savedAt: item.saved_at,
      data: item.data as SavedInvoice["data"],
    }));
  }
  return readLocal<SavedInvoice>(INVOICE_KEY);
}

export async function saveInvoice(inv: SavedInvoice): Promise<void> {
  if (useCloud) {
    const { error } = await supabase.from("items").insert({
      id: inv.id,
      type: "invoice",
      name: inv.name,
      saved_at: inv.savedAt,
      data: inv.data,
    });
    if (error) throw error;
    return;
  }
  const list = readLocal<SavedInvoice>(INVOICE_KEY);
  const idx = list.findIndex((x) => x.id === inv.id);
  if (idx >= 0) list[idx] = inv;
  else list.unshift(inv);
  writeLocal(INVOICE_KEY, list);
}

export async function deleteInvoice(id: string): Promise<void> {
  if (useCloud) {
    const { error } = await supabase.from("items").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  const list = readLocal<SavedInvoice>(INVOICE_KEY).filter((x) => x.id !== id);
  writeLocal(INVOICE_KEY, list);
}
