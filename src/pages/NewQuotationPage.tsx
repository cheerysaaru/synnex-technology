import { useState, useMemo, useEffect } from "react";
import { ArrowLeft, Trash2, Plus, FileDown, Eye, Save } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { saveQuotation } from "../utils/storage";
import { PDFDownloadLink, PDFViewer, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const companySettings = {
  name: "SYNNEX TECHNOLOGY",
  tagline: "Electrical & Network Solutions",
  address: "M.P.C.S Lane, Kopay North, Kopay",
  phone: ["021 223 1455", "077 758 8128"],
  salutation: "Sir,",
  closing: ["Thanking you.", "Yours faithfully,"],
  signatory: "K. Arulalagan MIET-UK",
};

const salutationOptions = ["Sir", "Madam", "Sir / Madam"];

const unitOptions = [
  { label: "Nos.", value: "Nos." },
  { label: "Set", value: "Set" },
  { label: "Mtr.", value: "Mtr." },
  { label: "Ft.", value: "Ft." },
  { label: "Lot", value: "Lot" },
];

export type ItemRow = {
  id: number;
  description: string;
  unit: string;
  qty: string;
  rate: string;
};

export interface QuotationFormData {
  recipient: { line1: string; line2: string; line3: string; date: string };
  salutation: string;
  subject: string;
  items: { id: number; description: string; unit: string; qty: number; rate: number }[];
  discount: number;
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
function emptyRow(): ItemRow {
  return { id: nextId++, description: "", unit: "Nos.", qty: "", rate: "" };
}

function fmtNum(n: number): string {
  return n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQty(n: number): string {
  return n % 1 === 0 ? n.toLocaleString("en-LK") : n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function qtyRateNum(v: string): number {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

const pdfStyles = StyleSheet.create({
  page: { padding: "40 50 40", fontSize: 10, color: "#000", fontFamily: "Helvetica" },
  header: { marginBottom: 28, alignItems: "center" as const },
  headerTitle: { fontSize: 18, fontWeight: 700 },
  footer: { alignItems: "center" as const },
  footerText: { fontSize: 8, color: "#000" },
  recipientBlock: { marginBottom: 8 },
  recipientLine: { fontSize: 10, marginBottom: 1 },
  dateLine: { fontSize: 10, marginTop: 2, marginBottom: 8 },
  salutation: { fontSize: 10, marginBottom: 8 },
  subjectBlock: { marginVertical: 8 },
  subjectLine: { fontSize: 12, fontWeight: 700, textAlign: "center" as const, lineHeight: 1.3 },
  tableContainer: { marginTop: 4, borderWidth: 1, borderColor: "#000" },
  tableHeader: { flexDirection: "row" as const },
  tableHeaderCell: { fontSize: 9, fontWeight: 700, paddingVertical: 3, paddingHorizontal: 4, textAlign: "center" as const, borderRightWidth: 1, borderRightColor: "#000", borderBottomWidth: 1, borderBottomColor: "#000" },
  tableRow: { flexDirection: "row" as const },
  tableCell: { fontSize: 9, paddingVertical: 4, paddingHorizontal: 4, borderRightWidth: 1, borderRightColor: "#000", borderBottomWidth: 1, borderBottomColor: "#000" },
  colNo: { width: "8%", textAlign: "center" as const },
  colDesc: { width: "49%", textAlign: "left" as const },
  colUnit: { width: "9%", textAlign: "center" as const },
  colQty: { width: "8%", textAlign: "center" as const },
  colRate: { width: "13%", textAlign: "center" as const },
  colAmount: { width: "13%", textAlign: "center" as const, borderRightWidth: 0 },
  totalRow: { flexDirection: "row" as const },
  totalLabel: { fontSize: 10, fontWeight: 700, textAlign: "right" as const, width: "87%", paddingVertical: 2, paddingRight: 6 },
  totalValue: { fontSize: 11, fontWeight: 700, textAlign: "right" as const, width: "13%", paddingVertical: 2, paddingRight: 6 },
  closingBlock: { marginTop: 12 },
  closingLine: { fontSize: 10, marginBottom: 1 },
  signatory: { fontSize: 10, marginTop: 2 },
});

function QuotationPDF({ data }: { data: QuotationFormData }) {
  const items = data.items.filter((i) => i.qty > 0 && i.rate > 0 && i.description.trim());
  const subtotal = items.reduce((s, i) => s + i.qty * i.rate, 0);
  const grandTotal = Math.max(0, subtotal - data.discount);

  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <View style={pdfStyles.header}>
          <Text style={pdfStyles.headerTitle}>{companySettings.name}</Text>
        </View>

        <View style={pdfStyles.recipientBlock}>
          {data.recipient.line1 && <Text style={pdfStyles.recipientLine}>{data.recipient.line1}</Text>}
          {data.recipient.line2 && <Text style={pdfStyles.recipientLine}>{data.recipient.line2}</Text>}
          {data.recipient.line3 && <Text style={pdfStyles.recipientLine}>{data.recipient.line3}</Text>}
          <Text style={pdfStyles.dateLine}>{data.recipient.date}</Text>
        </View>

        <Text style={pdfStyles.salutation}>{data.salutation},</Text>

        {data.subject && (
          <View style={pdfStyles.subjectBlock}>
            <Text style={pdfStyles.subjectLine}>{data.subject.toUpperCase()}</Text>
          </View>
        )}

        <View style={pdfStyles.tableContainer}>
          <View style={pdfStyles.tableHeader}>
            <Text style={[pdfStyles.tableHeaderCell, pdfStyles.colNo]}>Item</Text>
            <Text style={[pdfStyles.tableHeaderCell, pdfStyles.colDesc]}>Description</Text>
            <Text style={[pdfStyles.tableHeaderCell, pdfStyles.colUnit]}>Unit</Text>
            <Text style={[pdfStyles.tableHeaderCell, pdfStyles.colQty]}>Qty</Text>
            <Text style={[pdfStyles.tableHeaderCell, pdfStyles.colRate]}>Rate</Text>
            <Text style={[pdfStyles.tableHeaderCell, pdfStyles.colAmount]}>Amount</Text>
          </View>

          {items.map((item, idx) => (
            <View style={pdfStyles.tableRow} key={item.id}>
              <Text style={[pdfStyles.tableCell, pdfStyles.colNo]}>{idx + 1}</Text>
              <Text style={[pdfStyles.tableCell, pdfStyles.colDesc]}>{item.description}</Text>
              <Text style={[pdfStyles.tableCell, pdfStyles.colUnit]}>{item.unit}</Text>
              <Text style={[pdfStyles.tableCell, pdfStyles.colQty]}>{fmtQty(item.qty)}</Text>
              <Text style={[pdfStyles.tableCell, pdfStyles.colRate]}>{fmtNum(item.rate)}</Text>
              <Text style={[pdfStyles.tableCell, pdfStyles.colAmount]}>{fmtNum(item.qty * item.rate)}</Text>
            </View>
          ))}

          <View style={[pdfStyles.totalRow, { borderBottomWidth: 1, borderBottomColor: "#000" }]}>
            <Text style={pdfStyles.totalLabel}>TOTAL</Text>
            <Text style={pdfStyles.totalValue}>{fmtNum(subtotal)}</Text>
          </View>

          {data.discount > 0 && (
            <View style={pdfStyles.totalRow}>
              <Text style={[pdfStyles.totalLabel, { fontWeight: 400 }]}>Discount</Text>
              <Text style={[pdfStyles.totalValue, { fontWeight: 400 }]}>{fmtNum(data.discount)}</Text>
            </View>
          )}

        </View>

        <View style={[pdfStyles.totalRow, { marginTop: 4 }]}>
          <Text style={pdfStyles.totalLabel}>GRAND TOTAL</Text>
          <Text style={pdfStyles.totalValue}>{fmtNum(grandTotal)}</Text>
        </View>

        {data.notes.length > 0 && (
          <View style={{ marginTop: 8 }}>
            <Text style={{ fontSize: 9, marginBottom: 2 }}>Notes:</Text>
            {data.notes.map((n, i) => (
              <Text key={i} style={{ fontSize: 9, marginBottom: 1 }}>{n}</Text>
            ))}
          </View>
        )}

        <View style={pdfStyles.closingBlock}>
          {companySettings.closing.map((l, i) => (
            <Text key={i} style={pdfStyles.closingLine}>{l}</Text>
          ))}
          <Text style={pdfStyles.signatory}>K. Arulalagan MIET-UK</Text>
        </View>

        <View style={{ position: "absolute", bottom: 30, left: 50, right: 50 }}>
          <View style={pdfStyles.footer}>
            <Text style={pdfStyles.footerText}>{companySettings.address.toUpperCase()}. TELEPHONE {companySettings.phone[0].replace(/\s/g, "")}, MOBILE. {companySettings.phone[1].replace(/\s/g, "")}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export default function NewQuotationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [savedId, setSavedId] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);

  const [recipient1, setRecipient1] = useState("");
  const [recipient2, setRecipient2] = useState("");
  const [recipient3, setRecipient3] = useState("");
  const [date, setDate] = useState(getDefaultDate);
  const [subject, setSubject] = useState("");
  const [salutation, setSalutation] = useState("Sir");
  const [items, setItems] = useState<ItemRow[]>([emptyRow()]);
  const [showDiscount, setShowDiscount] = useState(false);
  const [discount, setDiscount] = useState("0");
  const [showNote, setShowNote] = useState(false);
  const [notes, setNotes] = useState<string[]>([""]);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    const state = location.state as Record<string, unknown> | null;
    if (state?.loadQuotation) {
      const d = state.loadQuotation as {
        savedId: string;
        recipient1: string;
        recipient2: string;
        recipient3: string;
        date: string;
        subject: string;
        salutation: string;
        items: ItemRow[];
        discount?: string;
        notes?: string[];
      };
      setSavedId(d.savedId);
      setRecipient1(d.recipient1);
      setRecipient2(d.recipient2);
      setRecipient3(d.recipient3);
      setDate(d.date);
      setSubject(d.subject);
      setSalutation(d.salutation);
      setItems(d.items);
      if (d.discount !== undefined) { setDiscount(d.discount); setShowDiscount(true); }
      if (d.notes !== undefined) { setNotes(d.notes); if (d.notes.some((n) => n.trim())) setShowNote(true); }
    }
  }, []);

  function updateItem(id: number, field: keyof ItemRow, value: string) {
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
      const qty = qtyRateNum(row.qty);
      const rate = qtyRateNum(row.rate);
      if (!row.description.trim() || qty === 0 || rate === 0) return sum;
      return sum + qty * rate;
    }, 0);
  }, [items]);

  const discVal = showDiscount ? qtyRateNum(discount) : 0;
  const grandTotal = Math.max(0, subtotal - discVal);

  const canGenerate =
    recipient1.trim().length > 0 &&
    items.some((row) => {
      const qty = qtyRateNum(row.qty);
      const rate = qtyRateNum(row.rate);
      return row.description.trim().length > 0 && qty > 0 && rate > 0;
    });

  function handleSave() {
    const id = savedId || crypto.randomUUID();
    saveQuotation({
      id,
      name: recipient1 || "Untitled",
      savedAt: new Date().toISOString(),
      data: { recipient1, recipient2, recipient3, date, subject, salutation, items, discount, showDiscount, notes },
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
    setSalutation("Sir");
    setSubject("");
    setItems([emptyRow()]);
    setShowDiscount(false);
    setDiscount("0");
    setShowNote(false);
    setNotes([""]);
    setSavedId(null);
  }

  const formData: QuotationFormData = {
    recipient: { line1: recipient1, line2: recipient2, line3: recipient3, date },
    salutation,
    subject,
    items: items
      .map((r) => ({ ...r, qty: qtyRateNum(r.qty), rate: qtyRateNum(r.rate) }))
      .filter((r) => r.description.trim() || r.qty > 0 || r.rate > 0),
    discount: discVal,
    notes: notes.filter((n) => n.trim()),
  };

  const fileName = `quotation for ${(subject || "no title").toLowerCase()} for ${(recipient1 || "unnamed").toLowerCase()}.pdf`;

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
        <h1 className="text-3xl tracking-wide text-black">{companySettings.name}</h1>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pt-12 pb-16">
        <div className="w-full max-w-3xl space-y-6">
        <RecipientFields
          line1={recipient1}
          line2={recipient2}
          line3={recipient3}
          date={date}
          onLine1Change={setRecipient1}
          onLine2Change={setRecipient2}
          onLine3Change={setRecipient3}
          onDateChange={setDate}
        />

        <div className="flex items-center gap-2 text-sm text-black">
          <select
            value={salutation}
            onChange={(e) => setSalutation(e.target.value)}
            className="border-0 border-b border-gray-300 bg-transparent px-0 py-0.5 text-sm text-black outline-none focus:border-black"
          >
            {salutationOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          <span>,</span>
        </div>
        <SubjectField value={subject} onChange={setSubject} />

        <ItemsTable items={items} onUpdate={updateItem} onRemove={removeItem} onAdd={addItem} total={subtotal} />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDiscount((v) => !v)}
              className="inline-flex items-center gap-1.5 border border-black px-4 py-2 text-xs text-black transition-colors hover:bg-gray-100"
            >
              {showDiscount ? "Remove Discount" : "Add Discount"}
            </button>
            <button
              type="button"
              onClick={() => setShowNote((v) => !v)}
              className="inline-flex items-center gap-1.5 border border-black px-4 py-2 text-xs text-black transition-colors hover:bg-gray-100"
            >
              {showNote ? "Hide Notes" : "Add Note"}
            </button>
          </div>

          {showDiscount && (
            <div className="flex flex-col items-end gap-1 text-sm">
              <div className="flex items-center gap-4">
                <span>Subtotal</span>
                <span className="w-24 text-right tabular-nums">Rs {fmtNum(subtotal)}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">Discount Rs</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="w-24 border-0 border-b border-gray-300 px-0 py-0.5 text-right text-sm outline-none focus:border-black tabular-nums"
                />
              </div>
              <div className="flex items-center gap-4 font-bold">
                <span>Grand Total</span>
                <span className="w-24 text-right tabular-nums">Rs {fmtNum(grandTotal)}</span>
              </div>
            </div>
          )}
        </div>

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
            {savedId ? "Update Saved" : "Save Quotation"}
          </button>

          <button
            type="button"
            onClick={resetForm}
            className="border border-black px-6 py-3 text-sm font-medium text-black transition-colors hover:bg-gray-100"
          >
            New Quotation
          </button>
        </div>

        {showSaved && (
          <p className="text-xs text-green-600">Quotation saved successfully.</p>
        )}
        </div>
      </main>

      <footer className="px-6 py-6 pt-12 text-center">
        <p className="text-xs text-black">
          {companySettings.address.toUpperCase()}. &nbsp; TELEPHONE {companySettings.phone[0].replace(/\s/g, "")}, MOBILE. {companySettings.phone[1].replace(/\s/g, "")}
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
            <PDFDownloadLink document={<QuotationPDF data={formData} />} fileName={fileName}>
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
            <QuotationPDF data={formData} />
          </PDFViewer>
        </div>
      )}
    </>
  );
}

function RecipientFields({
  line1, line2, line3, date,
  onLine1Change, onLine2Change, onLine3Change, onDateChange,
}: {
  line1: string; line2: string; line3: string; date: string;
  onLine1Change: (v: string) => void;
  onLine2Change: (v: string) => void;
  onLine3Change: (v: string) => void;
  onDateChange: (v: string) => void;
}) {
  return (
    <section>
      <input
        type="text"
        placeholder="Business or customer name"
        value={line1}
        onChange={(e) => onLine1Change(e.target.value)}
        className="mb-2 w-full border-0 border-b border-gray-300 px-0 py-1.5 text-sm outline-none focus:border-black"
      />
      <input
        type="text"
        placeholder="Area"
        value={line2}
        onChange={(e) => onLine2Change(e.target.value)}
        className="mb-2 w-full border-0 border-b border-gray-300 px-0 py-1.5 text-sm outline-none focus:border-black"
      />
      <input
        type="text"
        placeholder="Town / District"
        value={line3}
        onChange={(e) => onLine3Change(e.target.value)}
        className="mb-2 w-full border-0 border-b border-gray-300 px-0 py-1.5 text-sm outline-none focus:border-black"
      />
      <div className="flex items-center gap-2 text-xs text-black">
        <span className="whitespace-nowrap">Date:</span>
        <input
          type="text"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          className="w-full border-0 border-b border-gray-300 px-0 py-1.5 text-xs outline-none focus:border-black"
        />
      </div>
    </section>
  );
}

function SubjectField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <input
        type="text"
        placeholder="QUOTATION FOR THE SUPPLY AND INSTALLATION OF SURGE POWER POINTS AND NETWORK POINTS"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border-0 border-b border-gray-300 px-0 py-1.5 text-center text-sm font-bold uppercase outline-none focus:border-black"
        style={{ wordBreak: "normal", overflowWrap: "normal" }}
      />
    </div>
  );
}

function ItemsTable({
  items, onUpdate, onRemove, onAdd, total,
}: {
  items: ItemRow[];
  onUpdate: (id: number, field: keyof ItemRow, value: string) => void;
  onRemove: (id: number) => void;
  onAdd: () => void;
  total: number;
}) {
  return (
    <section>
      <table className="w-full border-collapse border border-black text-sm" style={{ tableLayout: "fixed", fontFamily: "Helvetica, Arial, sans-serif" }}>
        <thead>
          <tr className="border border-black">
            <th className="w-[7%] border border-black px-2 py-2.5 text-center text-xs whitespace-nowrap">Item</th>
            <th className="w-[45%] border border-black px-2 py-2.5 text-center text-xs whitespace-nowrap">Description</th>
            <th className="w-[10%] border border-black px-2 py-2.5 text-center text-xs whitespace-nowrap">Unit</th>
            <th className="w-[9%] border border-black px-2 py-2.5 text-center text-xs whitespace-nowrap">Qty</th>
            <th className="w-[12%] border border-black px-2 py-2.5 text-center text-xs whitespace-nowrap">Rate (Rs)</th>
            <th className="w-[10%] border border-black px-2 py-2.5 text-center text-xs whitespace-nowrap">Amount (Rs)</th>
            <th className="w-[7%] border border-black px-2 py-2.5 text-center text-xs whitespace-nowrap" />
          </tr>
        </thead>
        <tbody>
          {items.map((row, idx) => {
            const qty = qtyRateNum(row.qty);
            const rate = qtyRateNum(row.rate);
            const amount = row.description.trim() && qty > 0 && rate > 0 ? qty * rate : null;

            return (
              <tr key={row.id} className="border border-black">
                <td className="w-[7%] border border-black px-2 py-2.5 text-center align-middle text-xs">{idx + 1}</td>
                <td className="w-[45%] border border-black px-2 py-2.5 align-middle" style={{ wordWrap: "break-word", overflowWrap: "break-word", whiteSpace: "normal" }}>
                  <textarea
                    placeholder="Item description"
                    value={row.description}
                    onChange={(e) => {
                      onUpdate(row.id, "description", e.target.value);
                      e.target.style.height = "auto";
                      e.target.style.height = e.target.scrollHeight + "px";
                    }}
                    className="w-full resize-none border-0 bg-transparent p-0 text-sm outline-none overflow-hidden"
                  />
                </td>
                <td className="w-[10%] border border-black px-2 py-2.5 align-middle">
                  <select
                    value={row.unit}
                    onChange={(e) => onUpdate(row.id, "unit", e.target.value)}
                    className="w-full cursor-pointer border-0 bg-transparent p-0 text-center text-sm outline-none"
                  >
                    {unitOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </td>
                <td className="w-[9%] border border-black px-2 py-2.5 align-middle">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    value={row.qty}
                    onChange={(e) => onUpdate(row.id, "qty", e.target.value)}
                     className="w-full border-0 bg-transparent p-0 text-center text-sm outline-none"
                  />
                </td>
                <td className="w-[12%] border border-black px-2 py-2.5 align-middle">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    value={row.rate}
                    onChange={(e) => onUpdate(row.id, "rate", e.target.value)}
                    className="w-full border-0 bg-transparent p-0 text-right text-sm outline-none"
                  />
                </td>
                <td className="w-[10%] border border-black px-2 py-2.5 text-right align-middle text-sm tabular-nums">
                  {amount !== null ? fmtNum(amount) : "—"}
                </td>
                <td className="w-[7%] border border-black px-2 py-2.5 text-center align-middle">
                  {items.length > 1 && (
                    <button type="button" onClick={() => onRemove(row.id)} className="text-black hover:text-gray-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border border-black">
            <td colSpan={5} className="border border-black px-2 py-2.5 text-right text-sm font-bold align-middle">
              TOTAL
            </td>
            <td className="w-[10%] border border-black px-2 py-2.5 text-right text-sm font-bold tabular-nums align-middle">
              Rs {fmtNum(total)}
            </td>
            <td className="w-[7%] border border-black px-2 py-2.5 align-middle" />
          </tr>
        </tfoot>
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
