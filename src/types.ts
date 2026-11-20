import type { TextOverrides } from "./lib/typography";
import type defaults from "../shared/defaults.json";

export type DocType = "quotation" | "invoice" | "letter";

export type SectionType =
  | "letterhead"
  | "details"
  | "recipient"
  | "salutation"
  | "subject"
  | "intro"
  | "items"
  | "totals"
  | "words"
  | "notes"
  | "bank"
  | "closing"
  | "acceptance"
  | "custom"
  | "footer";

export interface Section {
  id: string;
  type: SectionType;
  enabled: boolean;
  /** custom sections only */
  title?: string;
  text?: string;
  /** Heading bar / table header: hidden when true */
  hideHeading?: boolean;
  /** Custom wording for the heading (built-in sections) */
  heading?: string;
}

export interface LineItem {
  id: string;
  kind: "item" | "heading";
  description: string;
  unit: string;
  qty: number | null;
  rate: number | null;
  discount: number | null;
}

export interface Customer {
  id?: string;
  name: string;
  attention: string;
  line1: string;
  line2: string;
  line3: string;
  phone: string;
  email: string;
  notes?: string;
}

export interface Columns {
  unit: boolean;
  qty: boolean;
  rate: boolean;
  discount: boolean;
}

export interface Labels {
  no: string;
  description: string;
  unit: string;
  qty: string;
  rate: string;
  discount: string;
  amount: string;
}

export interface TableAlign {
  /** Vertical position of cell content in each row */
  vertical: "top" | "middle";
  /** Horizontal alignment of the description column */
  text: "left" | "center";
  /** Horizontal alignment of qty, unit, price, discount and amount */
  numbers: "left" | "center" | "right";
}

export interface DocData {
  type: DocType;
  title: string;
  number: string;
  issueDate: string;
  dueDate: string;
  reference: string;
  customer: Customer;
  salutation: string;
  subject: string;
  intro: string;
  items: LineItem[];
  columns: Columns;
  labels: Labels;
  align: TableAlign;
  /** Where the title (QUOTATION, INVOICE) prints: just above the table, or at the top with the date and number. */
  titlePlace?: "table" | "top";
  /** Print the title in capitals (default) or exactly as typed. */
  titleCaps?: boolean;
  /** Text size and weight for this document (only the parts you changed). */
  text?: TextOverrides;
  discount: { mode: "amount" | "percent"; value: number };
  tax: { label: string; percent: number };
  paid: number;
  grandTotalLabel: string;
  thankYouNote: string;
  notesTitle: string;
  notes: string[];
  closing: string;
  signatoryName: string;
  signatoryTitle: string;
  showSignatureLine: boolean;
  sections: Section[];
  sourceId?: string | null;
}

export interface Totals {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  balance: number;
}

export interface DocRecord {
  id: string;
  type: DocType;
  number: string;
  status: string;
  customer_name: string;
  subject: string;
  issue_date: string;
  total: number;
  balance: number;
  source_id: string | null;
  data: DocData;
  created_at: string;
  updated_at: string;
}

export type DocSummary = Omit<DocRecord, "data"> & { dueDate: string | null; customer: string };

export interface CatalogItem {
  id: string;
  description: string;
  unit: string;
  rate: number | null;
  category?: string;
}

export type Settings = Omit<typeof defaults, "brand"> & {
  /* layout: "simple" | "boxed"; text: size and weight per part of the page. */
  brand: typeof defaults.brand & { layout?: string; text?: TextOverrides };
};

export interface Stats {
  quotations: number;
  quotationsThisMonth: number;
  quotedThisMonth: number;
  openQuotations: number;
  acceptedQuotations: number;
  invoices: number;
  invoicedThisMonth: number;
  outstanding: number;
  overdue: number;
  paidThisMonth: number;
  customers: number;
  recent: DocSummary[];
  monthly: { month: string; quoted: number; invoiced: number }[];
  awaiting: DocSummary[];
  overdueList: DocSummary[];
}
