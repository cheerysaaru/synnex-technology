/*
 * Data layer. Talks to the Node server (server/app.mjs). When no server is
 * reachable — e.g. the static GitHub Pages build — it falls back to a
 * browser-only store with the same behaviour, so the app always works.
 */
import { plainText } from "./rich";
import defaults from "../../shared/defaults.json";
import type { CatalogItem, Customer, DocData, DocRecord, DocSummary, DocType, Settings, Stats } from "../types";
import { addDays, computeTotals, todayIso } from "./calc";
import { STATUSES, uid } from "./document";
import { legacyToData, readLegacy, LEGACY_KEYS } from "./legacy";

export class ApiError extends Error {
  status: number;
  details?: Record<string, string>;
  constructor(message: string, status = 0, details?: Record<string, string>) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export type Mode = "server" | "local";
export interface SettingsPayload {
  settings: Settings;
  counters: Record<string, number>;
}

export interface Backend {
  mode: Mode;
  settings(): Promise<SettingsPayload>;
  saveSettings(settings: Partial<Settings>, counters?: Record<string, number>): Promise<SettingsPayload>;
  stats(): Promise<Stats>;
  listDocs(params?: { type?: DocType; status?: string; q?: string }): Promise<DocSummary[]>;
  getDoc(id: string): Promise<DocRecord>;
  createDoc(type: DocType, data: Partial<DocData>, status?: string): Promise<DocRecord>;
  updateDoc(id: string, data: DocData, status?: string): Promise<DocRecord>;
  setStatus(id: string, status: string): Promise<DocRecord>;
  deleteDoc(id: string): Promise<void>;
  duplicateDoc(id: string): Promise<DocRecord>;
  convertDoc(id: string): Promise<DocRecord>;
  customers(): Promise<(Customer & { id: string })[]>;
  saveCustomer(c: Partial<Customer> & { id?: string }): Promise<Customer & { id: string }>;
  deleteCustomer(id: string): Promise<void>;
  catalog(): Promise<CatalogItem[]>;
  saveCatalog(i: Partial<CatalogItem>): Promise<CatalogItem>;
  deleteCatalog(id: string): Promise<void>;
  backup(): Promise<unknown>;
  restore(data: unknown): Promise<{ restored: number }>;
  importLegacy(data: { quotations: unknown[]; invoices: unknown[] }): Promise<{ imported: number }>;
}

/* ------------------------------------------------------------------ server */
const TOKEN_KEY = "synnex_token";
/* The API lives next to the app: at /api, or /quotation/api when the app is
   opened from synnex-technology.com/quotation/. VITE_API_URL overrides it. */
const BASE = ((import.meta.env.VITE_API_URL as string | undefined) || (typeof location !== "undefined" ? location.pathname.replace(/\/[^/]*$/, "") : "")).replace(/\/+$/, "");

async function http<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(localStorage.getItem(TOKEN_KEY) ? { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Cannot reach the server. Check that it is running.", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event("synnex:auth"));
    throw new ApiError(data.error || "Something went wrong.", res.status, data.details);
  }
  return data as T;
}

const qs = (p: Record<string, string | undefined> = {}) => {
  const e = Object.entries(p).filter(([, v]) => v) as [string, string][];
  return e.length ? `?${new URLSearchParams(e)}` : "";
};

const serverBackend: Backend = {
  mode: "server",
  settings: () => http("GET", "/settings"),
  saveSettings: (settings, counters) => http("PUT", "/settings", { settings, counters }),
  stats: () => http("GET", "/stats"),
  listDocs: (p) => http("GET", `/documents${qs(p)}`),
  getDoc: (id) => http("GET", `/documents/${id}`),
  createDoc: (type, data, status) => http("POST", "/documents", { type, data, status }),
  updateDoc: (id, data, status) => http("PUT", `/documents/${id}`, { data, status }),
  setStatus: (id, status) => http("PATCH", `/documents/${id}`, { status }),
  deleteDoc: async (id) => void (await http("DELETE", `/documents/${id}`)),
  duplicateDoc: (id) => http("POST", `/documents/${id}/duplicate`),
  convertDoc: (id) => http("POST", `/documents/${id}/convert`),
  customers: () => http("GET", "/customers"),
  saveCustomer: (c) => (c.id ? http("PUT", `/customers/${c.id}`, c) : http("POST", "/customers", c)),
  deleteCustomer: async (id) => void (await http("DELETE", `/customers/${id}`)),
  catalog: () => http("GET", "/catalog"),
  saveCatalog: (i) => (i.id ? http("PUT", `/catalog/${i.id}`, i) : http("POST", "/catalog", i)),
  deleteCatalog: async (id) => void (await http("DELETE", `/catalog/${id}`)),
  backup: () => http("GET", "/backup"),
  restore: (data) => http("POST", "/restore", data),
  importLegacy: (data) => http("POST", "/import", data),
};

export async function login(pin: string): Promise<void> {
  const { token } = await http<{ token: string | null }>("POST", "/login", { pin });
  if (token) localStorage.setItem(TOKEN_KEY, token);
}
export const logout = () => localStorage.removeItem(TOKEN_KEY);

/* ------------------------------------------------------------------ browser store */
const LS = "synnex_v2";
interface LocalState {
  settings: Partial<Settings> | null;
  counters: Record<string, number>;
  documents: DocRecord[];
  customers: (Customer & { id: string; created_at: string; updated_at: string })[];
  catalog: (CatalogItem & { created_at: string; updated_at: string })[];
}
const loadState = (): LocalState => {
  try {
    return { settings: null, counters: {}, documents: [], customers: [], catalog: [], ...JSON.parse(localStorage.getItem(LS) || "{}") };
  } catch {
    return { settings: null, counters: {}, documents: [], customers: [], catalog: [] };
  }
};
const saveState = (s: LocalState) => {
  try {
    localStorage.setItem(LS, JSON.stringify(s));
  } catch {
    throw new ApiError("This browser's storage is full. Delete old documents or export a backup.", 507);
  }
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export function deepMerge<T>(base: T, over: unknown): T {
  if (!isObj(base) || !isObj(over)) return (over === undefined ? base : over) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = isObj(v) && isObj((base as Record<string, unknown>)[k]) ? deepMerge((base as Record<string, unknown>)[k], v) : v;
  return out as T;
}

const nowIso = () => new Date().toISOString();
const summary = (r: DocRecord): DocSummary => {
  const { data, ...rest } = r;
  return { ...rest, dueDate: data.dueDate || null, customer: data.customer?.name || "" };
};

function localBackend(): Backend {
  let st = loadState();
  const commit = () => saveState(st);
  const settingsOf = () => deepMerge(defaults as Settings, st.settings || {});

  const nextNumber = (type: DocType, issueDate: string) => {
    const n = settingsOf().numbering;
    const year = (issueDate || todayIso()).slice(0, 4);
    const key = n.includeYear ? `${type}:${year}` : type;
    st.counters[key] = (st.counters[key] || 0) + 1;
    const prefix = (n as Record<string, unknown>)[`${type}Prefix`] || type.slice(0, 3).toUpperCase();
    const padded = String(st.counters[key]).padStart(Number(n.padding) || 3, "0");
    return n.includeYear ? `${prefix}-${year}-${padded}` : `${prefix}-${padded}`;
  };

  const save = (existing: DocRecord | null, type: DocType, data: Partial<DocData>, status?: string): DocRecord => {
    const s = status || existing?.status || "draft";
    if (!STATUSES[type].includes(s)) throw new ApiError("Invalid status.", 422);
    const totals = computeTotals(data as DocData);
    const row: DocRecord = {
      id: existing?.id || crypto.randomUUID(),
      type,
      number: data.number || "",
      status: s,
      customer_name: data.customer?.name || "",
      subject: plainText(data.subject),
      issue_date: data.issueDate || "",
      total: totals.total,
      balance: totals.balance,
      source_id: existing?.source_id || data.sourceId || null,
      data: { ...(data as DocData), type },
      created_at: existing?.created_at || nowIso(),
      updated_at: nowIso(),
    };
    st.documents = [row, ...st.documents.filter((d) => d.id !== row.id)];
    commit();
    return structuredClone(row);
  };

  const create = (type: DocType, data: Partial<DocData>, status?: string) => {
    const s = settingsOf();
    const issueDate = data.issueDate || todayIso();
    const draft: Partial<DocData> = { issueDate, ...data };
    if (!draft.number) draft.number = nextNumber(type, issueDate);
    if (draft.dueDate === undefined && type !== "letter") {
      draft.dueDate = addDays(issueDate, type === "quotation" ? s.defaults.quotationValidDays : s.defaults.invoiceDueDays);
    }
    return save(null, type, draft, status);
  };

  const get = (id: string) => {
    const d = st.documents.find((x) => x.id === id);
    if (!d) throw new ApiError("Document not found.", 404);
    return structuredClone(d);
  };

  // One-time import of the old browser-saved quotations and invoices.
  if (!localStorage.getItem(`${LS}_legacy`)) {
    const old = readLegacy();
    old.quotations.forEach((q) => create("quotation", legacyToData("quotation", q) as Partial<DocData>));
    old.invoices.forEach((q) => create("invoice", legacyToData("invoice", q) as Partial<DocData>));
    localStorage.setItem(`${LS}_legacy`, nowIso());
  }

  return {
    mode: "local",
    async settings() {
      return { settings: settingsOf(), counters: { ...st.counters } };
    },
    async saveSettings(settings, counters) {
      st.settings = deepMerge(st.settings || {}, settings);
      if (counters) Object.assign(st.counters, counters);
      commit();
      return { settings: settingsOf(), counters: { ...st.counters } };
    },
    async stats() {
      const docs = st.documents;
      const month = todayIso().slice(0, 7);
      const q = docs.filter((d) => d.type === "quotation");
      const inv = docs.filter((d) => d.type === "invoice");
      const open = inv.filter((d) => ["sent", "partial"].includes(d.status));
      return {
        quotations: q.length,
        quotationsThisMonth: q.filter((d) => d.issue_date.startsWith(month)).length,
        quotedThisMonth: q.filter((d) => d.issue_date.startsWith(month)).reduce((s, d) => s + d.total, 0),
        openQuotations: q.filter((d) => d.status === "sent").length,
        acceptedQuotations: q.filter((d) => d.status === "accepted").length,
        invoices: inv.length,
        invoicedThisMonth: inv.filter((d) => d.issue_date.startsWith(month) && d.status !== "cancelled").reduce((s, d) => s + d.total, 0),
        outstanding: open.reduce((s, d) => s + d.balance, 0),
        overdue: open.filter((d) => d.data.dueDate && d.data.dueDate < todayIso()).length,
        paidThisMonth: inv.filter((d) => d.status === "paid" && d.updated_at.startsWith(month)).reduce((s, d) => s + d.total, 0),
        customers: st.customers.length,
        recent: docs.slice(0, 8).map(summary),
        monthly: Array.from({ length: 6 }, (_, k) => {
          const d = new Date();
          const m = new Date(Date.UTC(d.getFullYear(), d.getMonth() - (5 - k), 1)).toISOString().slice(0, 7);
          const inM = docs.filter((x) => x.issue_date.startsWith(m));
          return {
            month: m,
            quoted: inM.filter((x) => x.type === "quotation").reduce((t, x) => t + x.total, 0),
            invoiced: inM.filter((x) => x.type === "invoice" && x.status !== "cancelled").reduce((t, x) => t + x.total, 0),
          };
        }),
        awaiting: q.filter((d) => d.status === "sent").slice(0, 5).map(summary),
        overdueList: open.filter((d) => d.data.dueDate && d.data.dueDate < todayIso()).slice(0, 5).map(summary),
      };
    },
    async listDocs(p = {}) {
      const q = (p.q || "").toLowerCase();
      return st.documents
        .filter((d) => (!p.type || d.type === p.type) && (!p.status || d.status === p.status))
        .filter((d) => !q || [d.number, d.customer_name, d.subject].some((v) => (v || "").toLowerCase().includes(q)))
        .map(summary);
    },
    async getDoc(id) {
      return get(id);
    },
    async createDoc(type, data, status) {
      return create(type, data, status);
    },
    async updateDoc(id, data, status) {
      return save(get(id), get(id).type, data, status);
    },
    async setStatus(id, status) {
      const d = get(id);
      return save(d, d.type, d.data, status);
    },
    async deleteDoc(id) {
      st.documents = st.documents.filter((d) => d.id !== id);
      commit();
    },
    async duplicateDoc(id) {
      const d = get(id);
      return create(d.type, { ...d.data, number: "", issueDate: todayIso(), dueDate: undefined });
    },
    async convertDoc(id) {
      const d = get(id);
      if (d.type !== "quotation") throw new ApiError("Only quotations can be converted.", 422);
      const s = settingsOf();
      const { sections: _s, salutation: _sa, intro: _i, notesTitle: _nt, ...rest } = d.data;
      void _s; void _sa; void _i; void _nt;
      const inv = create("invoice", { ...rest, number: "", issueDate: todayIso(), dueDate: undefined, reference: d.data.number ? `Quotation ${d.data.number}` : "", notes: s.defaults.invoiceTerms, sourceId: d.id });
      if (["draft", "sent"].includes(d.status)) save(d, d.type, d.data, "accepted");
      return inv;
    },
    async customers() {
      return structuredClone(st.customers).sort((a, b) => a.name.localeCompare(b.name));
    },
    async saveCustomer(c) {
      if (!c.name?.trim()) throw new ApiError("Customer name is required.", 422, { name: "Enter a name." });
      const existing = st.customers.find((x) => x.id === c.id);
      const row = { attention: "", line1: "", line2: "", line3: "", phone: "", email: "", notes: "", ...existing, ...c, name: c.name.trim(), id: c.id || uid(), created_at: existing?.created_at || nowIso(), updated_at: nowIso() };
      st.customers = [...st.customers.filter((x) => x.id !== row.id), row];
      commit();
      return row;
    },
    async deleteCustomer(id) {
      st.customers = st.customers.filter((x) => x.id !== id);
      commit();
    },
    async catalog() {
      return structuredClone(st.catalog).sort((a, b) => a.description.localeCompare(b.description));
    },
    async saveCatalog(i) {
      if (!i.description?.trim()) throw new ApiError("Item description is required.", 422, { description: "Enter a description." });
      const existing = st.catalog.find((x) => x.id === i.id);
      const rate = parseFloat(String(i.rate ?? ""));
      const row = { unit: "", category: "", ...existing, ...i, description: i.description.trim(), rate: Number.isFinite(rate) ? rate : null, id: i.id || uid(), created_at: existing?.created_at || nowIso(), updated_at: nowIso() };
      st.catalog = [...st.catalog.filter((x) => x.id !== row.id), row];
      commit();
      return row;
    },
    async deleteCatalog(id) {
      st.catalog = st.catalog.filter((x) => x.id !== id);
      commit();
    },
    async backup() {
      return { app: "synnex-quotations", version: 2, exportedAt: nowIso(), ...st };
    },
    async restore(data) {
      const b = data as Partial<LocalState> & { app?: string };
      if (b.app !== "synnex-quotations") throw new ApiError("This is not a Synnex backup file.", 422);
      const merge = <T extends { id: string }>(a: T[], incoming: T[] = []) => [...incoming, ...a.filter((x) => !incoming.some((y) => y.id === x.id))];
      st = {
        settings: b.settings || st.settings,
        counters: { ...st.counters, ...(b.counters || {}) },
        documents: merge(st.documents, b.documents),
        customers: merge(st.customers, (b.customers || []).map((c) => ({ ...(c as unknown as { data?: object }).data, ...c }))),
        catalog: merge(st.catalog, (b.catalog || []).map((c) => ({ ...(c as unknown as { data?: object }).data, ...c }))),
      } as LocalState;
      commit();
      return { restored: (b.documents?.length || 0) + (b.customers?.length || 0) + (b.catalog?.length || 0) };
    },
    async importLegacy(data) {
      let n = 0;
      data.quotations.forEach((q) => (create("quotation", legacyToData("quotation", q) as Partial<DocData>), n++));
      data.invoices.forEach((q) => (create("invoice", legacyToData("invoice", q) as Partial<DocData>), n++));
      return { imported: n };
    },
  };
}

/* ------------------------------------------------------------------ pick backend */
let current: Backend | null = null;
let auth = false;

export async function connect(): Promise<{ backend: Backend; needsPin: boolean }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`${BASE}/api/health`, { signal: ctrl.signal });
    clearTimeout(t);
    const h = await res.json();
    if (res.ok && h.ok) {
      current = serverBackend;
      auth = Boolean(h.auth);
      // Move documents saved in this browser by the old version onto the server, once.
      const old = readLegacy();
      if ((old.quotations.length || old.invoices.length) && !localStorage.getItem("synnex_legacy_uploaded")) {
        const needsPin = auth && !localStorage.getItem(TOKEN_KEY);
        if (!needsPin) {
          try {
            await serverBackend.importLegacy(old);
            localStorage.setItem("synnex_legacy_uploaded", nowIso());
            localStorage.removeItem(LEGACY_KEYS.quotations);
            localStorage.removeItem(LEGACY_KEYS.invoices);
          } catch {
            /* try again next time */
          }
        }
      }
      return { backend: current, needsPin: auth && !localStorage.getItem(TOKEN_KEY) };
    }
  } catch {
    /* no server: browser mode */
  }
  current = localBackend();
  return { backend: current, needsPin: false };
}

export function backend(): Backend {
  if (!current) throw new Error("Backend not connected yet.");
  return current;
}

export { defaults };
