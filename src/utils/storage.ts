import type { ItemRow } from "../pages/NewQuotationPage";
import type { InvoiceItemRow } from "../pages/NewInvoicePage";
import { supabase } from "../lib/supabase";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const useCloud = !!(supabaseUrl && supabaseKey && supabase);

const QUOTATION_KEY = "synnex_saved_quotations";
const INVOICE_KEY = "synnex_saved_invoices";
const CLOUD_TIMEOUT = 3000;

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

function readLocal<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocal(key: string, list: unknown[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // storage full — silently degrade
  }
}

function timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

async function tryCloud<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await timeout(fn(), CLOUD_TIMEOUT);
  } catch {
    return null;
  }
}

export async function getSavedQuotations(): Promise<SavedQuotation[]> {
  if (useCloud) {
    const cloud = await tryCloud(async () => {
      const { data, error } = await supabase!
        .from("items")
        .select("*")
        .eq("type", "quotation")
        .order("saved_at", { ascending: false });
      if (error) throw error;
      const mapped = (data ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        savedAt: item.saved_at,
        data: item.data as SavedQuotation["data"],
      }));
      writeLocal(QUOTATION_KEY, mapped);
      return mapped;
    });
    if (cloud) return cloud;
  }
  return readLocal<SavedQuotation>(QUOTATION_KEY);
}

export async function saveQuotation(q: SavedQuotation): Promise<void> {
  const list = readLocal<SavedQuotation>(QUOTATION_KEY);
  const idx = list.findIndex((x) => x.id === q.id);
  if (idx >= 0) list[idx] = q;
  else list.unshift(q);
  writeLocal(QUOTATION_KEY, list);

  if (useCloud) {
    tryCloud(async () => {
      await supabase!.from("items").upsert({
        id: q.id,
        type: "quotation",
        name: q.name,
        saved_at: q.savedAt,
        data: q.data,
      });
    });
  }
}

export async function deleteQuotation(id: string): Promise<void> {
  const list = readLocal<SavedQuotation>(QUOTATION_KEY).filter((x) => x.id !== id);
  writeLocal(QUOTATION_KEY, list);

  if (useCloud) {
    tryCloud(async () => {
      await supabase!.from("items").delete().eq("id", id);
    });
  }
}

export async function getSavedInvoices(): Promise<SavedInvoice[]> {
  if (useCloud) {
    const cloud = await tryCloud(async () => {
      const { data, error } = await supabase!
        .from("items")
        .select("*")
        .eq("type", "invoice")
        .order("saved_at", { ascending: false });
      if (error) throw error;
      const mapped = (data ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        savedAt: item.saved_at,
        data: item.data as SavedInvoice["data"],
      }));
      writeLocal(INVOICE_KEY, mapped);
      return mapped;
    });
    if (cloud) return cloud;
  }
  return readLocal<SavedInvoice>(INVOICE_KEY);
}

export async function saveInvoice(inv: SavedInvoice): Promise<void> {
  const list = readLocal<SavedInvoice>(INVOICE_KEY);
  const idx = list.findIndex((x) => x.id === inv.id);
  if (idx >= 0) list[idx] = inv;
  else list.unshift(inv);
  writeLocal(INVOICE_KEY, list);

  if (useCloud) {
    tryCloud(async () => {
      await supabase!.from("items").upsert({
        id: inv.id,
        type: "invoice",
        name: inv.name,
        saved_at: inv.savedAt,
        data: inv.data,
      });
    });
  }
}

export async function deleteInvoice(id: string): Promise<void> {
  const list = readLocal<SavedInvoice>(INVOICE_KEY).filter((x) => x.id !== id);
  writeLocal(INVOICE_KEY, list);

  if (useCloud) {
    tryCloud(async () => {
      await supabase!.from("items").delete().eq("id", id);
    });
  }
}
