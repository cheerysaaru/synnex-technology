/* Builds and normalises document data so every document — new, old or partly
   filled — has the full shape the editor and PDF expect. */
import type { Customer, DocData, DocType, LineItem, Section, SectionType, Settings } from "../types";
import { addDays, todayIso } from "./calc";

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);

export const SECTION_INFO: Record<SectionType, { label: string; hint: string }> = {
  letterhead: { label: "Letterhead", hint: "Logo, company name and contact line. Edit them in Settings." },
  details: { label: "Document details", hint: "Title, number, dates and reference." },
  recipient: { label: "Customer", hint: "Who the document is addressed to." },
  salutation: { label: "Salutation", hint: "Opening greeting, e.g. “Dear Sir,”." },
  subject: { label: "Description of work", hint: "Headline of the job, shown in the Description of Work box." },
  intro: { label: "Work details", hint: "More detail about the job (or the letter text)." },
  items: { label: "Items table", hint: "Rows, group headings and columns." },
  totals: { label: "Totals", hint: "Discount, tax and payments received." },
  words: { label: "Amount in words", hint: "The grand total written out." },
  notes: { label: "Notes & terms", hint: "Payment terms, validity, warranty." },
  bank: { label: "Bank details", hint: "Where to pay. Edit them in Settings." },
  closing: { label: "Closing & signature", hint: "Sign-off lines and signatory." },
  acceptance: { label: "Customer acceptance", hint: "Boxes for the customer's signature, printed name and date." },
  custom: { label: "Custom section", hint: "Any extra heading and text." },
  footer: { label: "Footer", hint: "Address, phones and page number on every page." },
};

const ORDER: Record<DocType, [SectionType, boolean][]> = {
  quotation: [
    ["letterhead", true], ["details", true], ["recipient", true], ["salutation", false], ["subject", true],
    ["intro", true], ["items", true], ["totals", true], ["words", false], ["notes", true], ["bank", false],
    ["acceptance", true], ["closing", false], ["footer", true],
  ],
  invoice: [
    ["letterhead", true], ["details", true], ["recipient", true], ["salutation", false], ["subject", true],
    ["intro", false], ["items", true], ["totals", true], ["words", true], ["notes", true], ["bank", true],
    ["closing", true], ["acceptance", false], ["footer", true],
  ],
  letter: [
    ["letterhead", true], ["details", true], ["recipient", true], ["salutation", true], ["subject", true],
    ["intro", true], ["items", false], ["totals", false], ["words", false], ["notes", false], ["bank", false],
    ["closing", true], ["acceptance", false], ["footer", true],
  ],
};

export const TYPE_LABEL: Record<DocType, string> = { quotation: "Quotation", invoice: "Invoice", letter: "Letter" };
export const TYPE_PLURAL: Record<DocType, string> = { quotation: "Quotations", invoice: "Invoices", letter: "Letters" };

export const STATUSES: Record<DocType, string[]> = {
  quotation: ["draft", "sent", "accepted", "declined", "expired"],
  invoice: ["draft", "sent", "partial", "paid", "cancelled"],
  letter: ["draft", "sent"],
};

export function defaultSections(type: DocType): Section[] {
  return ORDER[type].map(([t, enabled]) => ({ id: t, type: t, enabled }));
}

export const emptyCustomer = (): Customer => ({ name: "", attention: "", line1: "", line2: "", line3: "", phone: "", email: "" });

export const emptyItem = (unit = "Nos."): LineItem => ({ id: uid(), kind: "item", description: "", unit, qty: null, rate: null, discount: null });
export const headingRow = (text = ""): LineItem => ({ id: uid(), kind: "heading", description: text, unit: "", qty: null, rate: null, discount: null });

export function newDocData(type: DocType, s: Settings): DocData {
  const issueDate = todayIso();
  return {
    type,
    title: type === "quotation" ? "QUOTATION" : type === "invoice" ? "INVOICE" : "",
    number: "",
    issueDate,
    dueDate:
      type === "quotation" ? addDays(issueDate, s.defaults.quotationValidDays) : type === "invoice" ? addDays(issueDate, s.defaults.invoiceDueDays) : "",
    reference: "",
    customer: emptyCustomer(),
    salutation: type === "letter" ? "Dear Sir," : "",
    subject: "",
    intro: "",
    items: type === "letter" ? [] : [emptyItem(s.defaults.units[0])],
    columns: { unit: true, qty: true, rate: true, discount: false },
    align: { vertical: "top", text: "left", numbers: "right" },
    titlePlace: "table",
    labels: { no: "No.", description: type === "invoice" ? "Description" : "Itemized costs", unit: "Unit", qty: "Qty", rate: "Unit price", discount: "Discount", amount: "Amount" },
    discount: { mode: "amount", value: 0 },
    tax: { label: s.defaults.taxLabel || "Tax", percent: Number(s.defaults.taxPercent) || 0 },
    paid: 0,
    grandTotalLabel: type === "invoice" ? "TOTAL DUE" : "TOTAL QUOTE",
    thankYouNote: s.defaults.thankYouNote || "Thank you for your business!",
    notesTitle: "",
    notes: type === "quotation" ? [...s.defaults.quotationTerms] : type === "invoice" ? [...s.defaults.invoiceTerms] : [],
    closing: type === "letter" ? s.signatory.closing : "",
    signatoryName: s.signatory.name,
    signatoryTitle: s.signatory.title,
    showSignatureLine: true,
    sections: defaultSections(type),
  };
}

/** Fill any missing fields (old or partial records) from the defaults. */
export function normalizeDoc(type: DocType, raw: Partial<DocData> | undefined, s: Settings): DocData {
  const base = newDocData(type, s);
  const d = (raw || {}) as Partial<DocData>;
  const merged: DocData = {
    ...base,
    ...d,
    type,
    customer: { ...base.customer, ...(d.customer || {}) },
    columns: { ...base.columns, ...(d.columns || {}) },
    labels: { ...base.labels, ...(d.labels || {}) },
    align: { ...base.align, ...(d.align || {}) },
    discount: { ...base.discount, ...(d.discount || {}) },
    tax: { ...base.tax, ...(d.tax || {}) },
    items: (d.items ?? base.items).map((it) => ({ ...emptyItem(), ...it, id: it.id || uid() })),
    notes: d.notes ?? base.notes,
  };
  // Sections: keep the saved order, add any built-in sections the record lacks.
  const saved = Array.isArray(d.sections) && d.sections.length ? d.sections : null;
  if (saved) {
    const have = new Set(saved.map((x) => x.type));
    merged.sections = [...saved, ...base.sections.filter((x) => x.type !== "custom" && !have.has(x.type)).map((x) => ({ ...x, enabled: false }))];
  }
  return merged;
}

export function customerLines(c: Customer): string[] {
  return [c.name, c.attention ? `Attn: ${c.attention}` : "", c.line1, c.line2, c.line3, c.phone ? `Tel: ${c.phone}` : "", c.email].filter((x) => x && x.trim());
}

export function fileNameFor(d: DocData): string {
  const who = (d.customer.name || "customer").replace(/[^\w\s-]/g, "").trim();
  const what = d.type === "letter" ? "Letter" : d.type === "invoice" ? "Invoice" : "Quotation";
  return `${what} ${d.number || ""} ${who}`.replace(/\s+/g, " ").trim() + ".pdf";
}

/* Sections that print a heading, and the wording used when none is set. */
export function defaultHeading(type: SectionType, docType: DocType): string | null {
  switch (type) {
    case "recipient": return docType === "invoice" ? "Bill to" : docType === "letter" ? "To" : "Customer info";
    case "subject": return docType === "letter" ? null : "Description of work";
    case "items": return "";
    case "bank": return "Payment details";
    case "acceptance": return "Customer acceptance";
    case "custom": return "";
    default: return null;
  }
}
