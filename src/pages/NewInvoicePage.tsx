import { useState, useMemo, useEffect } from "react";
import { ArrowLeft, Trash2, Plus, FileDown, Eye, Save } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { saveInvoice } from "../utils/storage";
import { PDFDownloadLink, PDFViewer, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const companySettings = {
  name: "SYNNEX TECHNOLOGY",
  tagline: "Lightning & Surge Protection Professionals",
  address: "M.P.C.S Lane, Kopay North, Kopay",
  phone: "Tel: 0777588128",
  email: "Email: vkarull@gmail.com",
  closing: ["Thanking you.", "Yours faithfully."],
  signatory: "K. Arulalagan MIET-UK",
};

const unitOptions = [
  { label: "m", value: "m" },
  { label: "no.", value: "no." },
  { label: "set", value: "set" },
  { label: "ft.", value: "ft." },
];

export type InvoiceItemRow = {
  id: number;
  description: string;
  qty: string;
  unit: string;
  rate: string;
  discount: string;
};

export interface InvoiceFormData {
  recipient: { line1: string; line2: string; line3: string };
  items: { id: number; description: string; qty: number; unit: string; rate: number; discount: number }[];
  taxPercent: number;
  paymentsCredits: number;
  date: string;
  invoiceNo: string;
  notes: string[];
}

function getDefaultDate(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

let nextId = 1;
function emptyRow(): InvoiceItemRow {
  return { id: nextId++, description: "", qty: "", unit: "no.", rate: "", discount: "" };
}

function fmtNum(n: number): string {
  return n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQty(n: number): string {
  return n % 1 === 0 ? n.toLocaleString("en-LK") : n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function numVal(v: string): number {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

const ones = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function convertBelow1000(n: number): string {
  if (n === 0) return "";
  let s = "";
  if (n >= 100) {
    s += ones[Math.floor(n / 100)] + " hundred ";
    n %= 100;
  }
  if (n >= 20) {
    s += tens[Math.floor(n / 10)] + " ";
    n %= 10;
  }
  if (n > 0) {
    s += ones[n] + " ";
  }
  return s.trim();
}

function numberToWords(n: number): string {
  if (n === 0) return "zero rupees only";
  const num = Math.round(n);
  if (num === 0) return "zero rupees only";
  let s = "";
  const crores = Math.floor(num / 10000000);
  const lakhs = Math.floor((num % 10000000) / 100000);
  const thousands = Math.floor((num % 100000) / 1000);
  const hundreds = num % 1000;
  if (crores > 0) {
    s += convertBelow1000(crores) + " crore ";
  }
  if (lakhs > 0) {
    s += convertBelow1000(lakhs) + " lakh ";
  }
  if (thousands > 0) {
    s += convertBelow1000(thousands) + " thousand ";
  }
  if (hundreds > 0) {
    s += convertBelow1000(hundreds) + " ";
  }
  return s.trim() + " rupees only";
}

const pdfStyles = StyleSheet.create({
  page: { padding: "40 40 50", fontSize: 10, color: "#000", fontFamily: "Helvetica" },
  headerBlock: { marginBottom: 24, alignItems: "center" as const },
  tagline: { fontSize: 9, marginBottom: 2 },
  companyName: { fontSize: 16, fontWeight: 700, letterSpacing: 2 },
  contactRow: { fontSize: 9, marginTop: 1 },
  invoiceTitle: { fontSize: 16, fontWeight: 700, textAlign: "center" as const, marginVertical: 12 },
  recipientBlock: { marginBottom: 10 },
  recipientLine: { fontSize: 10, marginBottom: 1 },
  tableContainer: { borderWidth: 0.75, borderColor: "#000", marginBottom: 8 },
  tableHeader: { flexDirection: "row" as const, borderBottomWidth: 0.75, borderBottomColor: "#000" },
  tableHeaderCell: { fontSize: 9, paddingVertical: 4, paddingHorizontal: 4, textAlign: "center" as const, borderRightWidth: 0.75, borderRightColor: "#000" },
  tableRow: { flexDirection: "row" as const, borderBottomWidth: 0.5, borderBottomColor: "#000" },
  tableCell: { fontSize: 9, paddingVertical: 4, paddingHorizontal: 4, borderRightWidth: 0.75, borderRightColor: "#000" },
  lastCell: { borderRightWidth: 0 },
  colNo: { width: "6%" },
  colDesc: { width: "32%" },
  colQty: { width: "7%" },
  colUnit: { width: "7%" },
  colRate: { width: "14%" },
  colDisc: { width: "14%" },
  colAmt: { width: "14%" },
  amountWords: { fontSize: 9, marginBottom: 8 },
  amountWordsLabel: { fontSize: 9, marginBottom: 1 },
  summaryBlock: { alignItems: "flex-end" as const, marginBottom: 12 },
  summaryRow: { flexDirection: "row" as const, width: "55%" },
  summaryLabel: { fontSize: 10, textAlign: "right" as const, width: "50%", paddingRight: 6, paddingVertical: 2 },
  summaryValue: { fontSize: 10, textAlign: "right" as const, width: "50%", paddingVertical: 2 },
  summaryBold: { fontWeight: 700 },
  metadataBlock: { flexDirection: "row" as const, flexWrap: "wrap" as const, marginBottom: 6 },
  metaItem: { width: "50%", fontSize: 9, marginBottom: 2, textAlign: "left" as const },
  metaItemRight: { width: "50%", fontSize: 9, marginBottom: 2, textAlign: "right" as const },
  metaLabel: { fontWeight: 700 },
});

function InvoicePDF({ data }: { data: InvoiceFormData }) {
  const items = data.items.filter((i) => i.qty > 0 && i.rate > 0 && i.description.trim());
  const subtotal = items.reduce((s, i) => s + (i.qty * i.rate - i.discount), 0);
  const tax = subtotal * data.taxPercent / 100;
  const total = subtotal + tax;
  const balance = total - data.paymentsCredits;

  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <View style={pdfStyles.headerBlock}>
          <Text style={pdfStyles.tagline}>{companySettings.tagline}</Text>
          <Text style={pdfStyles.companyName}>{companySettings.name}</Text>
          <Text style={pdfStyles.contactRow}>{companySettings.address}</Text>
          <Text style={pdfStyles.contactRow}>{companySettings.phone}</Text>
          <Text style={pdfStyles.contactRow}>{companySettings.email}</Text>
        </View>

        <View style={pdfStyles.recipientBlock}>
          {data.recipient.line1 && <Text style={pdfStyles.recipientLine}>{data.recipient.line1}</Text>}
          {data.recipient.line2 && <Text style={pdfStyles.recipientLine}>{data.recipient.line2}</Text>}
          {data.recipient.line3 && <Text style={pdfStyles.recipientLine}>{data.recipient.line3}</Text>}
        </View>

        <View style={pdfStyles.metadataBlock}>
          <Text style={pdfStyles.metaItem}><Text style={pdfStyles.metaLabel}>Date: </Text>{data.date}</Text>
          <Text style={pdfStyles.metaItemRight}><Text style={pdfStyles.metaLabel}>Invoice No.: </Text>{data.invoiceNo}</Text>
        </View>

        <Text style={pdfStyles.invoiceTitle}>INVOICE</Text>

        <View style={pdfStyles.tableContainer}>
          <View style={pdfStyles.tableHeader}>
            <Text style={[pdfStyles.tableHeaderCell, pdfStyles.colNo]}>No.</Text>
            <Text style={[pdfStyles.tableHeaderCell, pdfStyles.colDesc]}>Description</Text>
            <Text style={[pdfStyles.tableHeaderCell, pdfStyles.colQty]}>Qty</Text>
            <Text style={[pdfStyles.tableHeaderCell, pdfStyles.colUnit]}>U/M</Text>
            <Text style={[pdfStyles.tableHeaderCell, pdfStyles.colRate]}>Normal Rate</Text>
            <Text style={[pdfStyles.tableHeaderCell, pdfStyles.colDisc]}>Discount</Text>
            <Text style={[pdfStyles.tableHeaderCell, pdfStyles.colAmt, pdfStyles.lastCell]}>Disc. Amount</Text>
          </View>

          {items.map((item, idx) => {
            const discAmt = item.qty * item.rate - item.discount;
            return (
              <View style={pdfStyles.tableRow} key={item.id}>
                <Text style={[pdfStyles.tableCell, pdfStyles.colNo]}>{idx + 1}</Text>
                <Text style={[pdfStyles.tableCell, pdfStyles.colDesc]}>{item.description}</Text>
                <Text style={[pdfStyles.tableCell, pdfStyles.colQty]}>{fmtQty(item.qty)}</Text>
                <Text style={[pdfStyles.tableCell, pdfStyles.colUnit]}>{item.unit}</Text>
                <Text style={[pdfStyles.tableCell, pdfStyles.colRate, { textAlign: "right" as const }]}>{fmtNum(item.rate)}</Text>
                <Text style={[pdfStyles.tableCell, pdfStyles.colDisc, { textAlign: "right" as const }]}>{item.discount > 0 ? fmtNum(item.discount) : "-"}</Text>
                <Text style={[pdfStyles.tableCell, pdfStyles.colAmt, pdfStyles.lastCell, { textAlign: "right" as const }]}>{fmtNum(discAmt)}</Text>
              </View>
            );
          })}
        </View>

        <Text style={pdfStyles.amountWordsLabel}>Amount in words (Rupees)</Text>
        <Text style={pdfStyles.amountWords}>{numberToWords(total)}</Text>

        <View style={pdfStyles.summaryBlock}>
          <View style={pdfStyles.summaryRow}>
            <Text style={pdfStyles.summaryLabel}>Subtotal</Text>
            <Text style={pdfStyles.summaryValue}>{fmtNum(subtotal)}</Text>
          </View>
          <View style={pdfStyles.summaryRow}>
            <Text style={pdfStyles.summaryLabel}>Sales Tax ({data.taxPercent}%)</Text>
            <Text style={pdfStyles.summaryValue}>{data.taxPercent > 0 ? fmtNum(tax) : "-"}</Text>
          </View>
          <View style={pdfStyles.summaryRow}>
            <Text style={[pdfStyles.summaryLabel, pdfStyles.summaryBold]}>Total</Text>
            <Text style={[pdfStyles.summaryValue, pdfStyles.summaryBold]}>{fmtNum(total)}</Text>
          </View>
          <View style={pdfStyles.summaryRow}>
            <Text style={pdfStyles.summaryLabel}>Payments/Credits</Text>
            <Text style={pdfStyles.summaryValue}>{data.paymentsCredits > 0 ? fmtNum(data.paymentsCredits) : "-"}</Text>
          </View>
          <View style={pdfStyles.summaryRow}>
            <Text style={[pdfStyles.summaryLabel, pdfStyles.summaryBold]}>Balance Due</Text>
            <Text style={[pdfStyles.summaryValue, pdfStyles.summaryBold]}>{fmtNum(balance)}</Text>
          </View>
        </View>

        {data.notes.length > 0 && (
          <View style={{ marginTop: 8 }}>
            <Text style={{ fontSize: 9, marginBottom: 2 }}>Notes:</Text>
            {data.notes.map((n, i) => (
              <Text key={i} style={{ fontSize: 9, marginBottom: 1 }}>{n}</Text>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
}

export default function NewInvoicePage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [recipient1, setRecipient1] = useState("");
  const [recipient2, setRecipient2] = useState("");
  const [recipient3, setRecipient3] = useState("");
  const [date, setDate] = useState(getDefaultDate);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [items, setItems] = useState<InvoiceItemRow[]>([emptyRow()]);
  const [taxPercent, setTaxPercent] = useState("0");
  const [paymentsCredits, setPaymentsCredits] = useState("0");
  const [showPreview, setShowPreview] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [notes, setNotes] = useState<string[]>([""]);

  useEffect(() => {
    const state = location.state as Record<string, unknown> | null;
    if (state?.loadInvoice) {
      const d = state.loadInvoice as {
        savedId: string;
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
      setSavedId(d.savedId);
      setRecipient1(d.recipient1);
      setRecipient2(d.recipient2);
      setRecipient3(d.recipient3);
      setDate(d.date);
      setInvoiceNo(d.invoiceNo);
      setItems(d.items);
      setTaxPercent(d.taxPercent);
      setPaymentsCredits(d.paymentsCredits);
      if (d.notes !== undefined) { setNotes(d.notes); if (d.notes.some((n) => n.trim())) setShowNote(true); }
    }
  }, []);

  function updateItem(id: number, field: keyof InvoiceItemRow, value: string) {
    setItems((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    );
  }

  function removeItem(id: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((row) => row.id !== id) : prev));
  }

  function addItem() {
    setItems((prev) => [...prev, emptyRow()]);
  }

  function addNote() {
    setNotes((prev) => [...prev, ""]);
  }

  function updateNote(idx: number, val: string) {
    setNotes((prev) => prev.map((n, i) => (i === idx ? val : n)));
  }

  function removeNote(idx: number) {
    setNotes((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  }

  const subtotal = useMemo(() => {
    return items.reduce((sum, row) => {
      const qty = numVal(row.qty);
      const rate = numVal(row.rate);
      const disc = numVal(row.discount);
      if (!row.description.trim() || qty === 0 || rate === 0) return sum;
      return sum + (qty * rate - disc);
    }, 0);
  }, [items]);

  const taxPct = numVal(taxPercent);
  const tax = subtotal * taxPct / 100;
  const total = subtotal + tax;
  const payments = numVal(paymentsCredits);

  const canGenerate =
    recipient1.trim().length > 0 &&
    items.some((row) => {
      const qty = numVal(row.qty);
      const rate = numVal(row.rate);
      return row.description.trim().length > 0 && qty > 0 && rate > 0;
    });

  function handleSave() {
    const id = savedId || crypto.randomUUID();
    saveInvoice({
      id,
      name: recipient1 || "Untitled",
      savedAt: new Date().toISOString(),
      data: { recipient1, recipient2, recipient3, date, invoiceNo, items, taxPercent, paymentsCredits, notes },
    });
    setSavedId(id);
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
  }

  function resetForm() {
    setRecipient1("");
    setRecipient2("");
    setRecipient3("");
    setDate(getDefaultDate());
    setInvoiceNo("");
    setTaxPercent("0");
    setPaymentsCredits("0");
    setItems([emptyRow()]);
    setShowNote(false);
    setNotes([""]);
    setSavedId(null);
  }

  const formData: InvoiceFormData = {
    recipient: { line1: recipient1, line2: recipient2, line3: recipient3 },
    items: items
      .map((r) => ({ ...r, qty: numVal(r.qty), rate: numVal(r.rate), discount: numVal(r.discount) }))
      .filter((r) => r.description.trim() || r.qty > 0 || r.rate > 0),
    taxPercent: taxPct,
    paymentsCredits: payments,
    date,
    invoiceNo,
    notes: notes.filter((n) => n.trim()),
  };

  const fileName = `invoice for ${(recipient1 || "unnamed").toLowerCase()}.pdf`;

  return (
    <>
      <div className="flex min-h-screen flex-col bg-white text-black font-sans">
        <header className="relative px-6 pt-14 pb-0 text-center">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="absolute left-6 top-14 inline-flex items-center gap-1 text-sm text-black transition-colors hover:text-gray-500"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <h1 className="text-2xl tracking-wide text-black">{companySettings.name}</h1>
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-6 pt-12 pb-16">
          <RecipientFields
            line1={recipient1}
            line2={recipient2}
            line3={recipient3}
            onLine1Change={setRecipient1}
            onLine2Change={setRecipient2}
            onLine3Change={setRecipient3}
          />

          <div className="flex items-center gap-2 text-xs text-black">
            <span className="whitespace-nowrap">Date:</span>
            <input
              type="text"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="flex-1 border-0 border-b border-gray-300 px-0 py-1.5 text-xs outline-none focus:border-black"
            />
            <span className="ml-auto whitespace-nowrap font-medium">Invoice No.:</span>
            <input
              type="text"
              placeholder="INV-001"
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              className="w-40 border-0 border-b border-gray-300 px-0 py-1.5 text-xs text-right outline-none focus:border-black"
            />
          </div>

          <InvoiceItemsTable
            items={items}
            onUpdate={updateItem}
            onRemove={removeItem}
            onAdd={addItem}
          />

          <AmountInWords total={total} />

          <FinancialSummary
            subtotal={subtotal}
            taxPercent={taxPct}
            tax={tax}
            total={total}
            paymentsCredits={payments}
            onTaxPercentChange={setTaxPercent}
            onPaymentsCreditsChange={setPaymentsCredits}
          />

          <button
            type="button"
            onClick={() => setShowNote((v) => !v)}
            className="inline-flex items-center gap-1.5 border border-black px-4 py-2 text-xs text-black transition-colors hover:bg-gray-100"
          >
            {showNote ? "Hide Notes" : "Add Note"}
          </button>

          {showNote && (
            <div className="space-y-2">
              {notes.map((n, i) => (
                <div key={i} className="flex items-start gap-2">
                  <textarea
                    placeholder="Add notes / terms & conditions here..."
                    value={n}
                    onChange={(e) => updateNote(i, e.target.value)}
                    rows={2}
                    className="flex-1 border border-black px-3 py-2 text-xs outline-none resize-y"
                  />
                  {notes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeNote(i)}
                      className="mt-1 text-gray-400 hover:text-black"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addNote}
                className="inline-flex items-center gap-1 border border-black px-3 py-1.5 text-xs text-black transition-colors hover:bg-gray-100"
              >
                <Plus className="h-3 w-3" />
                Add another note
              </button>
            </div>
          )}

          <div className="flex items-center gap-4 pt-4">
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              disabled={!canGenerate}
              className={`inline-flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
                canGenerate
                  ? "bg-black text-white hover:bg-gray-800"
                  : "cursor-not-allowed bg-gray-200 text-gray-400"
              }`}
            >
              <Eye className="h-4 w-4" />
              View PDF
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-2 border border-black px-6 py-3 text-sm font-medium text-black transition-colors hover:bg-gray-100"
            >
              <Save className="h-4 w-4" />
              {savedId ? "Update Saved" : "Save Invoice"}
            </button>

            <button
              type="button"
              onClick={resetForm}
              className="border border-black px-6 py-3 text-sm font-medium text-black transition-colors hover:bg-gray-100"
            >
              New Invoice
            </button>
          </div>

          {showSaved && (
            <p className="text-xs text-green-600">Invoice saved successfully.</p>
          )}
        </main>

        <footer className="px-6 py-6 pt-12 text-center">
          <p className="text-xs text-black">
            {companySettings.address.toUpperCase()}. &nbsp; TELEPHONE 021 223 1455, MOBILE. 0777588128
          </p>
        </footer>
      </div>

      {showPreview && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <button
              type="button"
              onClick={() => setShowPreview(false)}
              className="inline-flex items-center gap-1 text-sm text-black transition-colors hover:text-gray-500"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to form
            </button>
            <PDFDownloadLink document={<InvoicePDF data={formData} />} fileName={fileName}>
              {({ loading }) => (
                <button
                  type="button"
                  disabled={loading}
                  className="inline-flex items-center gap-2 bg-black px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
                >
                  <FileDown className="h-4 w-4" />
                  {loading ? "Generating..." : "Download PDF"}
                </button>
              )}
            </PDFDownloadLink>
          </div>
          <PDFViewer className="flex-1 w-full" showToolbar={false}>
            <InvoicePDF data={formData} />
          </PDFViewer>
        </div>
      )}
    </>
  );
}

function RecipientFields({
  line1, line2, line3,
  onLine1Change, onLine2Change, onLine3Change,
}: {
  line1: string; line2: string; line3: string;
  onLine1Change: (v: string) => void;
  onLine2Change: (v: string) => void;
  onLine3Change: (v: string) => void;
}) {
  return (
    <section>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Bill To</p>
      <input
        type="text"
        placeholder="Business or customer name"
        value={line1}
        onChange={(e) => onLine1Change(e.target.value)}
        className="mb-2 w-full border-0 border-b border-gray-300 px-0 py-1.5 text-sm outline-none focus:border-black"
      />
      <input
        type="text"
        placeholder="Address line 1"
        value={line2}
        onChange={(e) => onLine2Change(e.target.value)}
        className="mb-2 w-full border-0 border-b border-gray-300 px-0 py-1.5 text-sm outline-none focus:border-black"
      />
      <input
        type="text"
        placeholder="Address line 2"
        value={line3}
        onChange={(e) => onLine3Change(e.target.value)}
        className="mb-2 w-full border-0 border-b border-gray-300 px-0 py-1.5 text-sm outline-none focus:border-black"
      />
    </section>
  );
}

function InvoiceItemsTable({
  items, onUpdate, onRemove, onAdd,
}: {
  items: InvoiceItemRow[];
  onUpdate: (id: number, field: keyof InvoiceItemRow, value: string) => void;
  onRemove: (id: number) => void;
  onAdd: () => void;
}) {
  return (
    <section>
      <table className="w-full border-collapse border border-black text-sm" style={{ tableLayout: "fixed", fontFamily: "Helvetica, Arial, sans-serif" }}>
        <thead>
          <tr className="border border-black">
            <th className="w-[6%] border border-black px-1 py-2 text-center text-xs whitespace-nowrap">No.</th>
            <th className="w-[32%] border border-black px-1 py-2 text-center text-xs whitespace-nowrap">Description</th>
            <th className="w-[7%] border border-black px-1 py-2 text-center text-xs whitespace-nowrap">Qty</th>
            <th className="w-[7%] border border-black px-1 py-2 text-center text-xs whitespace-nowrap">U/M</th>
            <th className="w-[14%] border border-black px-1 py-2 text-center text-xs whitespace-nowrap">Normal Rate</th>
            <th className="w-[14%] border border-black px-1 py-2 text-center text-xs whitespace-nowrap">Discount</th>
            <th className="w-[14%] border border-black px-1 py-2 text-center text-xs whitespace-nowrap">Disc. Amount</th>
            <th className="w-[6%] border border-black px-1 py-2 text-center text-xs whitespace-nowrap" />
          </tr>
        </thead>
        <tbody>
          {items.map((row, idx) => {
            const qty = numVal(row.qty);
            const rate = numVal(row.rate);
            const disc = numVal(row.discount);
            const discAmt = row.description.trim() && qty > 0 && rate > 0 ? qty * rate - disc : null;

            return (
              <tr key={row.id} className="border border-black">
                <td className="w-[6%] border border-black px-1 py-2 text-center align-middle text-xs">{idx + 1}</td>
                <td className="w-[32%] border border-black px-1 py-2 align-middle" style={{ wordWrap: "break-word", overflowWrap: "break-word", whiteSpace: "normal" }}>
                  <textarea
                    placeholder="Item description"
                    value={row.description}
                    onChange={(e) => {
                      onUpdate(row.id, "description", e.target.value);
                      e.target.style.height = "auto";
                      e.target.style.height = e.target.scrollHeight + "px";
                    }}
                    className="w-full resize-none border-0 bg-transparent p-0 text-xs outline-none overflow-hidden"
                  />
                </td>
                <td className="w-[7%] border border-black px-1 py-2 align-middle">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    value={row.qty}
                    onChange={(e) => onUpdate(row.id, "qty", e.target.value)}
                    className="w-full border-0 bg-transparent p-0 text-center text-xs outline-none"
                  />
                </td>
                <td className="w-[7%] border border-black px-1 py-2 align-middle">
                  <select
                    value={row.unit}
                    onChange={(e) => onUpdate(row.id, "unit", e.target.value)}
                    className="w-full cursor-pointer border-0 bg-transparent p-0 text-center text-xs outline-none"
                  >
                    {unitOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </td>
                <td className="w-[14%] border border-black px-1 py-2 align-middle">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    value={row.rate}
                    onChange={(e) => onUpdate(row.id, "rate", e.target.value)}
                    className="w-full border-0 bg-transparent p-0 text-right text-xs outline-none"
                  />
                </td>
                <td className="w-[14%] border border-black px-1 py-2 align-middle">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="-"
                    value={row.discount}
                    onChange={(e) => onUpdate(row.id, "discount", e.target.value)}
                    className="w-full border-0 bg-transparent p-0 text-right text-xs outline-none"
                  />
                </td>
                <td className="w-[14%] border border-black px-1 py-2 text-right align-middle text-xs tabular-nums">
                  {discAmt !== null ? fmtNum(discAmt) : "—"}
                </td>
                <td className="w-[6%] border border-black px-1 py-2 text-center align-middle">
                  {items.length > 1 && (
                    <button type="button" onClick={() => onRemove(row.id)} className="text-black hover:text-gray-500">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <button
        type="button"
        onClick={onAdd}
        className="mt-3 inline-flex items-center gap-1.5 border border-black px-4 py-2 text-xs text-black transition-colors hover:bg-gray-100"
      >
        <Plus className="h-3.5 w-3.5" />
        Add item
      </button>
    </section>
  );
}

function AmountInWords({ total }: { total: number }) {
  return (
    <div>
      <p className="text-xs text-black">Amount in words (Rupees)</p>
      <p className="text-xs text-black capitalize">{numberToWords(total)}</p>
    </div>
  );
}

function FinancialSummary({
  subtotal, taxPercent, tax, total, paymentsCredits,
  onTaxPercentChange, onPaymentsCreditsChange,
}: {
  subtotal: number;
  taxPercent: number;
  tax: number;
  total: number;
  paymentsCredits: number;
  onTaxPercentChange: (v: string) => void;
  onPaymentsCreditsChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col items-end gap-1 pt-2">
      <div className="flex w-full max-w-xs items-center justify-between text-sm">
        <span>Subtotal</span>
        <span>{fmtNum(subtotal)}</span>
      </div>
      <div className="flex w-full max-w-xs items-center justify-between text-sm">
        <span className="flex items-center gap-1">
          Sales Tax (
          <input
            type="number"
            min="0"
            step="0.1"
            value={taxPercent}
            onChange={(e) => onTaxPercentChange(e.target.value)}
            className="w-12 border-0 border-b border-gray-300 px-0 py-0.5 text-right text-xs outline-none focus:border-black"
          />
          %)
        </span>
        <span>{taxPercent > 0 ? fmtNum(tax) : "-"}</span>
      </div>
      <div className="flex w-full max-w-xs items-center justify-between text-sm font-bold">
        <span>Total</span>
        <span>{fmtNum(total)}</span>
      </div>
      <div className="flex w-full max-w-xs items-center justify-between text-sm">
        <span className="flex items-center gap-1">
          Payments/Credits
        </span>
        <input
          type="number"
          min="0"
          step="any"
          value={paymentsCredits}
          onChange={(e) => onPaymentsCreditsChange(e.target.value)}
          className="w-24 border-0 border-b border-gray-300 px-0 py-0.5 text-right text-xs outline-none focus:border-black"
        />
      </div>
      <div className="flex w-full max-w-xs items-center justify-between text-sm font-bold">
        <span>Balance Due</span>
        <span>{fmtNum(total - paymentsCredits)}</span>
      </div>
    </div>
  );
}
