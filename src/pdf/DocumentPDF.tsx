/* The printable document, laid out like a classic business quotation:
   company block top-left, large title and a boxed info grid top-right, grey
   heading bars, an itemised table with column rules, totals block, terms,
   customer acceptance boxes and a centred contact line at the foot.
   One renderer for quotations, invoices and letters. Hidden or empty
   sections are skipped, so a half-finished document still exports cleanly. */
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { DocData, Section, Settings } from "../types";
import { amountInWords, computeTotals, formatDate, lineAmount, money, qtyText } from "../lib/calc";
import { registerFonts } from "./fonts";
import { defaultHeading } from "../lib/document";
import { applyOverrides, resolveText, type TextRole, type Weight } from "../lib/typography";

registerFonts();

const INK = "#262626";
const MUTE = "#666666";
const RULE = "#8c8c8c";

/* Font roles. Embedded typefaces use a light title, regular text and a
   semi-bold (not bold) for headings; Helvetica is the plain fallback. */
type Face = { fontFamily: string; fontWeight?: number; fontStyle?: "italic" | "normal" };
function typeset(font: string): { light: Face; regular: Face; strong: Face; italic: Face; embedded: boolean } {
  if (font === "Source Sans 3") return { embedded: true, light: { fontFamily: font, fontWeight: 300, fontStyle: "normal" }, regular: { fontFamily: font, fontWeight: 400, fontStyle: "normal" }, strong: { fontFamily: font, fontWeight: 600, fontStyle: "normal" }, italic: { fontFamily: font, fontWeight: 400, fontStyle: "italic" } };
  if (font === "IBM Plex Sans") return { embedded: true, light: { fontFamily: font, fontWeight: 300, fontStyle: "normal" }, regular: { fontFamily: font, fontWeight: 400, fontStyle: "normal" }, strong: { fontFamily: font, fontWeight: 500, fontStyle: "normal" }, italic: { fontFamily: font, fontWeight: 400, fontStyle: "italic" } };
  return { embedded: false, light: { fontFamily: "Helvetica" }, regular: { fontFamily: "Helvetica" }, strong: { fontFamily: "Helvetica-Bold" }, italic: { fontFamily: "Helvetica-Oblique" } };
}
/* The face for a chosen weight. IBM Plex uses Medium for semi-bold, which
   reads closer to Source Sans semi-bold. Helvetica only has regular and bold. */
function faceFor(font: string, w: Weight): Face {
  if (font === "Source Sans 3" || font === "IBM Plex Sans") {
    const n = { light: 300, regular: 400, semibold: font === "IBM Plex Sans" ? 500 : 600, bold: 700 }[w];
    return { fontFamily: font, fontWeight: n, fontStyle: "normal" };
  }
  return { fontFamily: w === "semibold" || w === "bold" ? "Helvetica-Bold" : "Helvetica" };
}
/* Copy of a style sheet with every font size multiplied by k. */
function scaleSheet<T extends Record<string, Record<string, unknown>>>(sheet: T, k: number): T {
  const out = {} as Record<string, Record<string, unknown>>;
  for (const [name, st] of Object.entries(sheet)) out[name] = typeof st.fontSize === "number" ? { ...st, fontSize: Math.round(st.fontSize * k * 100) / 100 } : st;
  return out as T;
}
const MIN_ROWS = 12;

/* The built-in PDF fonts lack some symbols; swap them for plain equivalents. */
const clean = (t: string) => (t || "").replace(/²/g, "2").replace(/³/g, "3").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/–|—/g, "-");
const has = (v: unknown) => (typeof v === "string" ? v.trim().length > 0 : v != null);

const base = StyleSheet.create({
  page: { paddingTop: 38, paddingHorizontal: 42, paddingBottom: 64, fontSize: 9.4, color: INK },
  // header
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  coName: { fontSize: 17, marginBottom: 5, letterSpacing: 0.2 },
  coLine: { fontSize: 8.8, lineHeight: 1.4, color: "#4d4d4d" },
  title: { fontSize: 25, textAlign: "right", letterSpacing: 2.5, marginBottom: 10 },
  grid: { borderWidth: 0.6, borderColor: RULE, width: 220, alignSelf: "flex-end" },
  gridRow: { flexDirection: "row" },
  gridHead: { flex: 1, fontSize: 7.4, textAlign: "center", paddingVertical: 2.5, letterSpacing: 0.8 },
  gridCell: { flex: 1, fontSize: 8.8, textAlign: "center", paddingVertical: 2.5, minHeight: 15 },
  // bars & boxes
  bar: { fontSize: 7.6, letterSpacing: 0.9, paddingVertical: 3, paddingHorizontal: 6, borderWidth: 0.6, borderColor: RULE },
  box: { borderWidth: 0.6, borderTopWidth: 0, borderColor: RULE, paddingVertical: 6, paddingHorizontal: 8, minHeight: 46 },
  block: { marginBottom: 14 },
  line: { fontSize: 9.2, lineHeight: 1.4 },
  para: { fontSize: 9.2, lineHeight: 1.45, marginBottom: 4 },
  // table
  table: { borderWidth: 0.6, borderColor: RULE },
  tr: { flexDirection: "row" },
  th: { fontSize: 7.6, letterSpacing: 0.9, paddingVertical: 3.5, paddingHorizontal: 6 },
  td: { fontSize: 9.2, paddingVertical: 1.8, paddingHorizontal: 6, lineHeight: 1.35, minHeight: 13.5 },
  vline: { borderRightWidth: 0.6, borderRightColor: RULE },
  // totals
  totalsRow: { flexDirection: "row", borderWidth: 0.6, borderTopWidth: 0, borderColor: RULE },
  thanks: { fontSize: 9.4, textAlign: "center", alignSelf: "center", color: "#4d4d4d" },
  totLabel: { fontSize: 8.6, letterSpacing: 0.6, paddingVertical: 4.5, paddingHorizontal: 8 },
  totValue: { fontSize: 9.4, paddingVertical: 4.5, paddingHorizontal: 6, textAlign: "right" },
  words: { fontSize: 9, marginTop: 6, color: "#4d4d4d" },
  // acceptance
  accLabel: { fontSize: 9.2, marginBottom: 2 },
  accRow: { flexDirection: "row", borderWidth: 0.6, borderColor: RULE, height: 22 },
  accCaption: { fontSize: 8, color: MUTE, paddingTop: 2, paddingHorizontal: 4 },
  // footer
  footer: { position: "absolute", left: 42, right: 42, bottom: 30, textAlign: "center", fontSize: 8.8, color: "#4d4d4d" },
  pageNo: { position: "absolute", right: 42, bottom: 18, fontSize: 7, color: MUTE, textAlign: "right", width: 120 },
});

export function DocumentPDF({ data: raw, settings }: { data: DocData; settings: Settings }) {
  const T = typeset(settings.brand.font || "Source Sans 3");
  const data: DocData = T.embedded ? raw : JSON.parse(JSON.stringify(raw), (_k, v) => (typeof v === "string" ? clean(v) : v));
  const TITLE = settings.brand.primary || "#3F3F3F";
  const FILL = settings.brand.accent || "#D9D9D9";
  const zebra = Boolean(settings.brand.zebra);
  const co = settings.company;
  const fmt = (iso: string) => formatDate(iso, settings.defaults.dateFormat);
  const cur = settings.defaults.currency || "Rs";
  const totals = computeTotals(data);
  const enabled = data.sections.filter((x) => x.enabled);
  const isOn = (t: Section["type"]) => enabled.some((x) => x.type === t);
  const cols = data.columns;
  const word = data.type === "invoice" ? "INVOICE" : data.type === "quotation" ? "QUOTE" : "REF";

  /* "simple": centred letterhead, open layout, full-grid table (default).
     "boxed": company left, info grid right, grey heading bars. */
  const SIMPLE = (settings.brand.layout || "simple") === "simple";
  /* Size and weight per part: the saved default, then this document's own. Body
     text scales everything that has no setting of its own. */
  const font = settings.brand.font || "Source Sans 3";
  const TX = applyOverrides(resolveText(SIMPLE ? "simple" : "boxed", settings.brand.text), data.text);
  const F = (r: TextRole) => faceFor(font, TX[r].weight);
  /* Size, plus colour when one was picked (name and title default to the brand colour). */
  const fs = (r: TextRole): { fontSize: number; color?: string } => {
    const c = TX[r].color || (r === "name" || r === "title" ? TITLE : undefined);
    return c ? { fontSize: TX[r].size, color: c } : { fontSize: TX[r].size };
  };
  const k = TX.body.size / 9.2;
  const z = (n: number) => Math.round(n * k * 100) / 100;
  const s = scaleSheet(base, k);
  s.td = { ...s.td, fontSize: TX.table.size, ...(TX.table.color ? { color: TX.table.color } : {}) };
  const fill = { backgroundColor: FILL };
  /* Heading text for a section, or null when the user hid it. */
  const headingOf = (sec: Section | undefined, type: Section["type"]): string | null => {
    if (sec?.hideHeading) return null;
    if (type === "custom") return has(sec?.title) ? sec!.title! : null;
    if (SIMPLE && (type === "recipient" || type === "subject")) return has(sec?.heading) ? sec!.heading!.trim() : null;
    const h = (sec?.heading ?? "").trim() || defaultHeading(type, data.type) || "";
    return h || null;
  };
  const secOf = (type: Section["type"]) => enabled.find((x) => x.type === type);
  const Bar = ({ children, width }: { children: string; width?: string }) =>
    SIMPLE ? (
      <Text style={[F("headings"), fs("headings"), { marginBottom: 2 }]}>{children}</Text>
    ) : (
      <Text style={[s.bar, F("headings"), fs("headings"), fill, width ? { width } : {}]}>{children.toUpperCase()}</Text>
    );

  /* --- header: company left, title + info grid right */
  const companyLines = [
    co.addressLine1,
    co.addressLine2,
    co.phone && `Phone: ${co.phone}`,
    co.mobile && `Mobile: ${co.mobile}`,
    co.email && `E-mail: ${co.email}`,
    co.website,
    co.registrationNo && `Reg. No. ${co.registrationNo}`,
  ].filter(has) as string[];

  const Company = () => (
    <View style={{ maxWidth: "52%" }}>
      {co.logo ? <Image src={co.logo} style={{ height: 40, maxWidth: 150, objectFit: "contain", marginBottom: 6 }} /> : null}
      <Text style={[s.coName, F("name"), fs("name")]}>{co.name.replace(/\b([A-Z])([A-Z]+)\b/g, (_m, a, b) => a + b.toLowerCase())}</Text>
      {companyLines.map((l, i) => <Text key={i} style={s.coLine}>{l}</Text>)}
    </View>
  );

  const pairs: [string, string][] = [
    [`${word} #`, data.number],
    ["DATE", data.issueDate ? fmt(data.issueDate) : ""],
    [data.type === "letter" ? "" : "REFERENCE", data.reference],
    [data.type === "quotation" ? "VALID UNTIL" : data.type === "invoice" ? "DUE DATE" : "", data.dueDate ? fmt(data.dueDate) : ""],
  ];
  const gridRows: [string, string][][] = [];
  const usable = pairs.filter(([l]) => l);
  for (let i = 0; i < usable.length; i += 2) gridRows.push(usable.slice(i, i + 2));

  const Details = () => (
    <View style={{ alignItems: "flex-end" }}>
      {has(data.title) && !titleAtTable ? <Text style={[s.title, F("title"), fs("title")]}>{data.title.toUpperCase()}</Text> : null}
      <View style={s.grid}>
        {gridRows.map((row, ri) => (
          <View key={ri}>
            <View style={[s.gridRow, fill, ri > 0 ? { borderTopWidth: 0.75, borderTopColor: RULE } : {}]}>
              {row.map(([l], ci) => <Text key={l} style={[s.gridHead, F("labels"), fs("labels"), ci === 0 && row.length > 1 ? s.vline : {}]}>{l}</Text>)}
            </View>
            <View style={[s.gridRow, { borderTopWidth: 0.75, borderTopColor: RULE }]}>
              {row.map(([l, v], ci) => <Text key={l} style={[s.gridCell, ci === 0 && row.length > 1 ? s.vline : {}]}>{v}</Text>)}
            </View>
          </View>
        ))}
      </View>
    </View>
  );

  /* --- simple layout header pieces */
  const SimpleLetterhead = () => (
    <View style={{ alignItems: "center", marginBottom: 16 }}>
      {co.logo ? <Image src={co.logo} style={{ height: 38, maxWidth: 150, objectFit: "contain", marginBottom: 5 }} /> : null}
      {has(co.tagline) ? <Text style={{ fontSize: z(8.8), color: MUTE, marginBottom: 2 }}>{co.tagline}</Text> : null}
      <Text style={[F("name"), fs("name"), { letterSpacing: 3, marginBottom: 3 }]}>{co.name.toUpperCase()}</Text>
      {[[co.addressLine1, co.addressLine2].filter(has).join(" "), [co.phone && `Tel: ${co.phone}`, co.mobile && `Mobile: ${co.mobile}`].filter(has).join("   "), co.email && `Email: ${co.email}`, co.website, co.registrationNo && `Reg. No. ${co.registrationNo}`]
        .filter(has)
        .map((l, i) => <Text key={i} style={{ fontSize: z(9), lineHeight: 1.4, color: "#4d4d4d" }}>{l}</Text>)}
    </View>
  );
  const metaLabel = data.type === "invoice" ? "Invoice No." : data.type === "quotation" ? "Quotation No." : "Ref. No.";
  const SimpleDetails = () => {
    const left: [string, string][] = [["Date", data.issueDate ? fmt(data.issueDate) : ""], [data.type === "quotation" ? "Valid until" : data.type === "invoice" ? "Due date" : "", data.dueDate ? fmt(data.dueDate) : ""]];
    const right: [string, string][] = [[metaLabel, data.number], ["Reference", data.reference]];
    const rows = [0, 1].map((r) => [left[r], right[r]]).filter(([l, rr]) => (l[0] && has(l[1])) || has(rr[1]));
    return (
      <View style={{ marginBottom: 6 }}>
        {rows.map(([l, r], k) => (
          <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
            <Text style={{ fontSize: z(9.2) }}>{l[0] && has(l[1]) ? <><Text style={[F("labels"), fs("labels")]}>{l[0]}: </Text>{l[1]}</> : " "}</Text>
            <Text style={{ fontSize: z(9.2) }}>{has(r[1]) ? <><Text style={[F("labels"), fs("labels")]}>{r[0]}: </Text>{r[1]}</> : " "}</Text>
          </View>
        ))}
        {has(data.title) && !titleAtTable ? <Text style={[F("title"), fs("title"), { letterSpacing: 2.5, textAlign: "center", marginTop: 10, marginBottom: 4 }]}>{data.title.toUpperCase()}</Text> : null}
      </View>
    );
  };

  /* --- customer */
  const c = data.customer;
  const custLines = [c.name, c.attention && `Attn: ${c.attention}`, c.line1, c.line2, c.line3, [c.phone, c.email].filter(has).join(", ")].filter(has) as string[];
  const SimpleRecipient = () => (
    <View style={{ marginBottom: 14 }}>
      {headingOf(secOf("recipient"), "recipient") ? <Bar>{headingOf(secOf("recipient"), "recipient")!}</Bar> : null}
      {custLines.map((l, i) => <Text key={i} style={i === 0 && has(c.name) ? [s.line, F("customer"), fs("customer")] : [s.line, { fontSize: z(9.6) }]}>{l}</Text>)}
    </View>
  );
  const Recipient = () => SIMPLE ? <SimpleRecipient /> : (
    <View style={[s.block, { flexDirection: "row", justifyContent: "space-between" }]}>
      <View style={{ width: "40%" }}>
        {headingOf(secOf("recipient"), "recipient") ? <Bar>{headingOf(secOf("recipient"), "recipient")!}</Bar> : null}
        <View style={{ paddingTop: headingOf(secOf("recipient"), "recipient") ? 3 : 0, paddingHorizontal: 1 }}>
          {custLines.map((l, i) => <Text key={i} style={i === 0 && has(c.name) ? [s.line, F("customer"), fs("customer")] : s.line}>{l}</Text>)}
        </View>
      </View>
      {has(data.signatoryName) && data.type !== "letter" ? (
        <View style={{ width: "50%", paddingTop: 3 }}>
          <Text style={[T.italic, { fontSize: z(9.2), color: "#4d4d4d" }]}>
            Prepared by: <Text style={[T.regular, { color: INK }]}>{data.signatoryName}{has(data.signatoryTitle) ? `, ${data.signatoryTitle}` : ""}</Text>
          </Text>
        </View>
      ) : null}
    </View>
  );

  /* --- items */
  const visibleItems = data.items.filter((it) => has(it.description) || it.qty != null || it.rate != null);
  const itemsOn = isOn("items") && (visibleItems.length > 0 || data.type !== "letter");
  /* The title sits right above the table unless you moved it to the top
     (or there is no table to sit above). */
  const titleAtTable = has(data.title) && data.titlePlace !== "top" && itemsOn;
  const TableTitle = () => (
    <Text style={[F("title"), fs("title"), { letterSpacing: 2.5, textAlign: "center", marginTop: 4, marginBottom: 8 }]} minPresenceAhead={60}>{data.title.toUpperCase()}</Text>
  );
  const widths: Record<string, number> = { no: SIMPLE ? 6 : 0, unit: cols.unit ? 8 : 0, qty: cols.qty ? 8 : 0, rate: cols.rate ? 15 : 0, discount: cols.discount ? 12 : 0, amount: 17 };
  widths.description = 100 - Object.values(widths).reduce((a, b) => a + b, 0);
  const colKeys = (["no", "description", "unit", "qty", "rate", "discount", "amount"] as const).filter((k) => widths[k] > 0);
  /* The simple layout swaps the boxed layout's default wording. */
  const simpleLabel = (v: string, from: string, to: string) => (SIMPLE && v.trim().toLowerCase() === from ? to : v);
  const head: Record<string, string> = {
    no: data.labels.no || "No.",
    description: simpleLabel(data.labels.description, "itemized costs", "Description"),
    unit: simpleLabel(data.labels.unit, "unit", "U/M"),
    qty: data.labels.qty,
    rate: simpleLabel(data.labels.rate, "unit price", "Rate"),
    discount: data.labels.discount,
    amount: data.labels.amount,
  };
  /* Table alignment chosen in the editor. "numbers: right" keeps the classic
     look: unit and qty centred, money right-aligned. */
  const A = data.align || { vertical: "top", text: "left", numbers: "right" };
  const align = (k: string): "left" | "center" | "right" => {
    if (k === "description") return A.text;
    if (k === "no") return "center";
    if (A.numbers === "right") return k === "unit" || k === "qty" ? "center" : "right";
    return A.numbers;
  };
  /* A table cell: carries the column rule and the vertical alignment. */
  const Cell = ({ k, last, children }: { k: string; last: boolean; children: React.ReactNode }) => (
    <View style={[{ width: `${widths[k]}%`, justifyContent: A.vertical === "middle" ? "center" : "flex-start" }, last ? {} : s.vline]}>{children}</View>
  );

  /* Full-grid table: every cell ruled, numbered rows, plain header. */
  const SimpleTable = () => {
    let n = 0;
    const rowRule = { borderTopWidth: 0.6, borderTopColor: RULE };
    return (
      <View style={[s.table, { marginBottom: 8 }]}>
        {secOf("items")?.hideHeading ? null : (
          <View style={s.tr} minPresenceAhead={30}>
            {colKeys.map((k, i) => (
              <Text key={k} style={[s.td, F("tableHead"), fs("tableHead"), { width: `${widths[k]}%`, textAlign: "center", paddingVertical: 4 }, i < colKeys.length - 1 ? s.vline : {}]}>{head[k]}</Text>
            ))}
          </View>
        )}
        {visibleItems.map((it, idx) => {
          const first = idx === 0 && secOf("items")?.hideHeading;
          if (it.kind === "heading") {
            return (
              <View key={it.id} style={[s.tr, first ? {} : rowRule]} wrap={false}>
                <Text style={[s.td, T.strong, { width: "100%", paddingVertical: 4, textAlign: A.text }]}>{it.description}</Text>
              </View>
            );
          }
          n += 1;
          const amt = lineAmount(it, cols.discount);
          const cell: Record<string, string> = {
            no: String(n),
            description: it.description,
            unit: it.unit,
            qty: qtyText(it.qty),
            rate: it.rate != null ? money(it.rate) : "",
            discount: it.discount ? money(it.discount) : "-",
            amount: amt != null ? money(amt) : "",
          };
          return (
            <View key={it.id} style={[s.tr, first ? {} : rowRule, zebra && n % 2 === 0 ? { backgroundColor: "#f4f4f4" } : {}]} wrap={false}>
              {colKeys.map((k, i) => (
                <Cell key={k} k={k} last={i === colKeys.length - 1}>
                  <Text style={[s.td, F("table"), { textAlign: align(k), paddingVertical: 3 }]}>{cell[k]}</Text>
                </Cell>
              ))}
            </View>
          );
        })}
      </View>
    );
  };

  /* Plain right-aligned totals list. */
  const SimpleTotals = () => {
    const rows: { label: string; value: string; strong?: boolean }[] = [{ label: "Subtotal", value: money(totals.subtotal) }];
    if (totals.discount > 0) rows.push({ label: data.discount.mode === "percent" ? `Discount (${data.discount.value}%)` : "Discount", value: `(${money(totals.discount)})` });
    if (totals.tax > 0 || data.type === "invoice") rows.push({ label: `${data.tax.label || "Tax"} (${data.tax.percent || 0}%)`, value: totals.tax > 0 ? money(totals.tax) : "-" });
    const totalLabel = (data.grandTotalLabel || "Total").trim();
    rows.push({ label: totalLabel === totalLabel.toUpperCase() ? totalLabel.charAt(0) + totalLabel.slice(1).toLowerCase() : totalLabel, value: `${cur} ${money(totals.total)}`, strong: true });
    if (data.type === "invoice") {
      rows.push({ label: "Payments / credits", value: totals.paid > 0 ? money(totals.paid) : "-" });
      rows.push({ label: "Balance due", value: `${cur} ${money(totals.balance)}`, strong: true });
    }
    return (
      <View style={{ alignSelf: "flex-end", width: "48%", marginBottom: 12 }} wrap={false}>
        {rows.map((r) => (
          <View key={r.label} style={{ flexDirection: "row", paddingVertical: 2 }}>
            <Text style={[F(r.strong ? "grandTotal" : "totals"), fs(r.strong ? "grandTotal" : "totals"), { flex: 1, textAlign: "right", paddingRight: 14 }]}>{r.label}</Text>
            <Text style={[F(r.strong ? "grandTotal" : "totals"), fs(r.strong ? "grandTotal" : "totals"), { width: 110, textAlign: "right" }]}>{r.value}</Text>
          </View>
        ))}
      </View>
    );
  };

  const wordsText = () => amountInWords(data.type === "invoice" && totals.paid > 0 ? totals.balance : totals.total);
  const SimpleWords = () => (
    <View style={{ marginBottom: 6 }}>
      <Text style={{ fontSize: z(9), color: MUTE }}>Amount in words ({cur === "Rs" ? "Rupees" : cur})</Text>
      <Text style={{ fontSize: z(9.4) }}>{wordsText().replace(/^Rupees\s/i, "").replace(/^./, (c) => c.toUpperCase())}</Text>
    </View>
  );

  const ItemsTable = ({ withTotals }: { withTotals: boolean }) => {
    const filler = Math.max(0, MIN_ROWS - visibleItems.length);
    return (
      <View style={withTotals ? {} : s.block}>
        <View style={s.table}>
          {secOf("items")?.hideHeading ? null : <View style={[s.tr, fill, { borderBottomWidth: 0.6, borderBottomColor: RULE }]} minPresenceAhead={30}>
            {colKeys.map((k, i) => (
              <Text key={k} style={[s.th, F("tableHead"), fs("tableHead"), { width: `${widths[k]}%`, textAlign: k === "description" ? "left" : "center" }, i < colKeys.length - 1 ? s.vline : {}]}>{head[k].toUpperCase()}</Text>
            ))}
          </View>}
          {visibleItems.map((it, idx) => {
            if (it.kind === "heading") {
              return (
                <View key={it.id} style={s.tr} wrap={false}>
                  {colKeys.map((k, i) => (
                    <Cell key={k} k={k} last={i === colKeys.length - 1}>
                      <Text style={[s.td, T.strong, { paddingTop: 5, textAlign: k === "description" ? A.text : "left" }]}>{k === "description" ? it.description : ""}</Text>
                    </Cell>
                  ))}
                </View>
              );
            }
            const amt = lineAmount(it, cols.discount);
            const cell: Record<string, string> = {
              description: it.description,
              unit: it.unit,
              qty: qtyText(it.qty),
              rate: it.rate != null ? money(it.rate) : "",
              discount: it.discount ? money(it.discount) : "",
              amount: amt != null ? money(amt) : "-",
            };
            return (
              <View key={it.id} style={[s.tr, zebra && idx % 2 ? { backgroundColor: "#f2f2f2" } : {}]} wrap={false}>
                {colKeys.map((k, i) => (
                  <Cell key={k} k={k} last={i === colKeys.length - 1}>
                    <Text style={[s.td, F("table"), { textAlign: align(k), paddingLeft: k === "description" && A.text === "left" ? 12 : 6 }]}>{cell[k]}</Text>
                  </Cell>
                ))}
              </View>
            );
          })}
          {Array.from({ length: filler }).map((_, f) => (
            <View key={`f${f}`} style={s.tr}>
              {colKeys.map((k, i) => (
                <Cell key={k} k={k} last={i === colKeys.length - 1}>
                  <Text style={[s.td, { textAlign: k === "amount" ? align("amount") : "left" }]}>{k === "amount" ? "-" : " "}</Text>
                </Cell>
              ))}
            </View>
          ))}
        </View>
        {withTotals ? <Totals attached /> : null}
      </View>
    );
  };

  /* --- totals */
  const Totals = ({ attached }: { attached: boolean }) => {
    const rows: { label: string; value: string; total?: boolean }[] = [{ label: "SUBTOTAL", value: money(totals.subtotal) }];
    if (totals.discount > 0) rows.push({ label: data.discount.mode === "percent" ? `DISCOUNT (${data.discount.value}%)` : "DISCOUNT", value: `(${money(totals.discount)})` });
    if (totals.tax > 0) rows.push({ label: `${(data.tax.label || "Tax").toUpperCase()} (${data.tax.percent}%)`, value: money(totals.tax) });
    if (totals.discount === 0 && totals.tax === 0) rows.push({ label: "OTHER", value: "-" });
    rows.push({ label: (data.grandTotalLabel || "TOTAL").toUpperCase(), value: money(totals.total), total: true });
    if (totals.paid > 0) {
      rows.push({ label: "PAID", value: `(${money(totals.paid)})` });
      rows.push({ label: "BALANCE DUE", value: money(totals.balance), total: true });
    }
    const leftW = 100 - widths.amount - widths.rate - widths.qty - widths.discount;
    const rightW = 100 - leftW;
    return (
      <View style={[{ flexDirection: "row" }, attached ? {} : { marginBottom: 14 }]} wrap={false}>
        <View style={[{ width: `${leftW}%`, justifyContent: "center", minHeight: 24 }, attached ? { borderWidth: 0.75, borderTopWidth: 0, borderColor: RULE } : {}]}>
          {attached && has(data.thankYouNote) ? <Text style={[s.thanks, T.italic]}>{data.thankYouNote}</Text> : null}
        </View>
        <View style={{ width: `${rightW}%` }}>
          {rows.map((r, i) => (
            <View key={r.label + i} style={[{ flexDirection: "row", borderWidth: 0.75, borderColor: RULE, borderTopWidth: attached || i > 0 ? 0 : 0.75, borderLeftWidth: attached ? 0 : 0.75 }, r.total ? fill : {}]}>
              <Text style={[s.totLabel, F(r.total ? "grandTotal" : "totals"), fs(r.total ? "grandTotal" : "totals"), { flex: 1, fontSize: r.total ? Math.max(TX.totals.size, TX.grandTotal.size - 1.2) : TX.totals.size }]}>{r.label}</Text>
              {r.total ? <Text style={[s.totValue, T.regular, { width: 26, textAlign: "left", paddingHorizontal: 0 }]}>{cur}</Text> : null}
              <Text style={[s.totValue, r.total ? F("grandTotal") : T.regular, fs(r.total ? "grandTotal" : "totals"), { width: `${(widths.amount / rightW) * 100}%`, fontSize: r.total ? TX.grandTotal.size : TX.totals.size + 0.8 }]}>{r.value}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  /* --- walk sections in order */
  const out: React.ReactNode[] = [];
  const seq = enabled.filter((x) => x.type !== "footer");
  for (let i = 0; i < seq.length; i++) {
    const sec = seq[i];
    const next = seq[i + 1]?.type;
    switch (sec.type) {
      case "letterhead":
      case "details":
      case "recipient":
        if (SIMPLE) {
          if (sec.type === "letterhead") {
            out.push(<SimpleLetterhead key={sec.id} />);
          } else if (sec.type === "details" && next === "recipient") {
            // Customer first, then the date / number line and the title.
            if (custLines.length) out.push(<SimpleRecipient key={`${sec.id}-r`} />);
            out.push(<SimpleDetails key={sec.id} />);
            i++;
          } else if (sec.type === "details") {
            out.push(<SimpleDetails key={sec.id} />);
          } else if (custLines.length) {
            out.push(<SimpleRecipient key={sec.id} />);
          }
          break;
        }
        if (sec.type === "recipient") {
          if (custLines.length || has(data.signatoryName)) out.push(<Recipient key={sec.id} />);
          break;
        }
        {
        const pair = (sec.type === "letterhead" && next === "details") || (sec.type === "details" && next === "letterhead");
        if (pair) {
          out.push(
            <View key={sec.id} style={s.top}>
              <Company />
              <Details />
            </View>,
          );
          i++;
        } else {
          out.push(<View key={sec.id} style={[s.top, sec.type === "details" ? { justifyContent: "flex-end" } : {}]}>{sec.type === "letterhead" ? <Company /> : <Details />}</View>);
        }
        break;
        }
      case "salutation":
        if (has(data.salutation)) out.push(<Text key={sec.id} style={[s.para, { marginBottom: 8 }]}>{data.salutation}</Text>);
        break;
      case "subject": {
        const withIntro = next === "intro" && has(data.intro);
        if (SIMPLE && data.type !== "letter") {
          const h = headingOf(sec, "subject");
          if (has(data.subject) || withIntro) {
            out.push(
              <View key={sec.id} style={{ marginBottom: 10 }} wrap={false}>
                {h ? <Bar>{h}</Bar> : null}
                {has(data.subject) ? <Text style={[T.strong, { fontSize: z(9.8), marginBottom: 4 }]}>{data.subject}</Text> : null}
                {withIntro ? data.intro.split("\n").filter(has).map((p, k) => <Text key={k} style={s.para}>{p}</Text>) : null}
              </View>,
            );
            if (withIntro) i++;
          }
          break;
        }
        if (data.type === "letter") {
          if (has(data.subject)) out.push(<Text key={sec.id} style={[T.strong, { fontSize: z(9.8), marginBottom: 8 }]}>Re: {data.subject}</Text>);
          break;
        }
        if (has(data.subject) || withIntro) {
          out.push(
            <View key={sec.id} style={s.block} wrap={false}>
              {headingOf(sec, "subject") ? <Bar>{headingOf(sec, "subject")!}</Bar> : null}
              <View style={[s.box, headingOf(sec, "subject") ? {} : { borderTopWidth: 0.6 }]}>
                {has(data.subject) ? <Text style={[T.strong, { fontSize: z(9.6), marginBottom: withIntro ? 4 : 0 }]}>{data.subject}</Text> : null}
                {withIntro ? data.intro.split("\n").filter(has).map((p, k) => <Text key={k} style={s.para}>{p}</Text>) : null}
              </View>
            </View>,
          );
          if (withIntro) i++;
        }
        break;
      }
      case "intro":
        if (has(data.intro)) {
          out.push(
            <View key={sec.id} style={s.block}>
              {data.intro.split(/\n/).filter(has).map((p, k) => <Text key={k} style={[s.para, { textAlign: "justify" }]}>{p}</Text>)}
            </View>,
          );
        }
        break;
      case "items":
        if (itemsOn && SIMPLE) {
          if (titleAtTable) out.push(<TableTitle key={`${sec.id}-title`} />);
          out.push(<SimpleTable key={sec.id} />);
          // Amount in words sits under the table, then the totals — like a classic invoice.
          const later: string[] = [];
          for (let j = i + 1; j < seq.length && later.length < 2 && (seq[j].type === "totals" || seq[j].type === "words"); j++) later.push(seq[j].type);
          if (later.includes("words") && totals.total > 0) out.push(<SimpleWords key={`${sec.id}-w`} />);
          if (later.includes("totals")) out.push(<SimpleTotals key={`${sec.id}-t`} />);
          i += later.length;
          break;
        }
        if (itemsOn) {
          if (titleAtTable) out.push(<TableTitle key={`${sec.id}-title`} />);
          const attach = next === "totals";
          out.push(
            <View key={sec.id} style={attach ? s.block : {}}>
              <ItemsTable withTotals={attach} />
              {attach && isOn("words") && seq[i + 2]?.type === "words" && totals.total > 0 ? (
                <Text style={[s.words, T.italic]}>Amount in words: {amountInWords(data.type === "invoice" && totals.paid > 0 ? totals.balance : totals.total)}</Text>
              ) : null}
            </View>,
          );
          if (attach) {
            i++;
            if (seq[i + 1]?.type === "words") i++;
          }
        }
        break;
      case "totals":
        out.push(SIMPLE ? <SimpleTotals key={sec.id} /> : <Totals key={sec.id} attached={false} />);
        break;
      case "words":
        if (SIMPLE && totals.total > 0) out.push(<SimpleWords key={sec.id} />);
        else if (totals.total > 0) out.push(<Text key={sec.id} style={[s.words, T.italic, { marginBottom: 12 }]}>Amount in words: {amountInWords(data.type === "invoice" && totals.paid > 0 ? totals.balance : totals.total)}</Text>);
        break;
      case "notes": {
        const notes = data.notes.filter(has);
        if (notes.length) {
          out.push(
            <View key={sec.id} style={s.block} wrap={false}>
              {has(data.notesTitle) ? <Text style={[F("headings"), fs("headings"), { fontSize: SIMPLE ? TX.headings.size : z(9.2), marginBottom: 3 }]}>{data.notesTitle}</Text> : null}
              <Text style={s.para}>{notes.join(" ")}</Text>
            </View>,
          );
        }
        break;
      }
      case "bank": {
        const b = settings.bank;
        const rows = [b.accountName && `Account name: ${b.accountName}`, b.bankName && `Bank: ${b.bankName}${b.branch ? `, ${b.branch}` : ""}`, b.accountNo && `Account no: ${b.accountNo}`].filter(has) as string[];
        if (rows.length) {
          out.push(
            <View key={sec.id} style={[s.block, { width: "50%" }]} wrap={false}>
              {headingOf(sec, "bank") ? <Bar>{headingOf(sec, "bank")!}</Bar> : null}
              <View style={{ paddingTop: headingOf(sec, "bank") ? 3 : 0, paddingHorizontal: 1 }}>{rows.map((r) => <Text key={r} style={s.line}>{r}</Text>)}</View>
            </View>,
          );
        }
        break;
      }
      case "custom":
        if (headingOf(sec, "custom") || has(sec.text)) {
          out.push(
            <View key={sec.id} style={s.block} wrap={false}>
              {headingOf(sec, "custom") ? <Bar>{headingOf(sec, "custom")!}</Bar> : null}
              <View style={headingOf(sec, "custom") ? [s.box, { minHeight: 0 }] : {}}>
                {(sec.text || "").split("\n").filter(has).map((p, k) => <Text key={k} style={s.para}>{p}</Text>)}
              </View>
            </View>,
          );
        }
        break;
      case "acceptance":
        out.push(
          <View key={sec.id} style={s.block} wrap={false}>
            {headingOf(sec, "acceptance") ? <Text style={s.accLabel}>{headingOf(sec, "acceptance")}</Text> : null}
            <View style={s.accRow}>
              <View style={[{ width: "45%", justifyContent: "flex-end", padding: 3 }, s.vline]}><Text style={{ fontSize: z(9) }}>x</Text></View>
              <View style={[{ width: "30%" }, s.vline]} />
              <View style={{ width: "25%" }} />
            </View>
            <View style={{ flexDirection: "row" }}>
              <Text style={[s.accCaption, { width: "45%" }]}>Signature</Text>
              <Text style={[s.accCaption, { width: "30%" }]}>Printed name</Text>
              <Text style={[s.accCaption, { width: "25%" }]}>Date</Text>
            </View>
          </View>,
        );
        break;
      case "closing":
        if (has(data.closing) || has(data.signatoryName)) {
          out.push(
            <View key={sec.id} style={[s.block, { marginTop: 4 }]} wrap={false}>
              {(data.closing || "").split("\n").filter(has).map((l, k) => <Text key={k} style={s.line}>{l}</Text>)}
              {data.showSignatureLine ? <View style={{ width: 170, borderTopWidth: 0.75, borderTopColor: INK, marginTop: 30, marginBottom: 3 }} /> : <View style={{ height: 20 }} />}
              {has(data.signatoryName) ? <Text style={[T.strong, { fontSize: z(9.4) }]}>{data.signatoryName}</Text> : null}
              {has(data.signatoryTitle) ? <Text style={[s.line, { color: MUTE }]}>{data.signatoryTitle}</Text> : null}
              {data.type !== "letter" ? <Text style={[s.line, { color: MUTE }]}>Authorised signature</Text> : null}
            </View>,
          );
        }
        break;
      default:
        break;
    }
  }

  const footerOn = isOn("footer");
  const contact = [settings.signatory.name, co.phone || co.mobile, co.email].filter(has).join(", ");

  return (
    <Document title={`${data.title || data.type} ${data.number}`.trim()} author={co.name} creator={co.name} producer={co.name}>
      <Page size={(settings.defaults.pageSize as "A4" | "LETTER") || "A4"} style={[s.page, F("body"), TX.body.color ? { color: TX.body.color } : {}]}>
        {out}
        {footerOn ? <Text style={[s.footer, F("footer"), fs("footer")]} fixed>If you have any questions, please contact {contact}</Text> : null}
        {footerOn ? <Text style={s.pageNo} fixed render={({ pageNumber, totalPages }) => (totalPages > 1 ? `Page ${pageNumber} of ${totalPages}` : "")} /> : null}
      </Page>
    </Document>
  );
}

export default DocumentPDF;
