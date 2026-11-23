/* Word (.docx) export. Builds the same document as the PDF (simple layout):
   centred letterhead, customer, date / number line, title, full-grid items
   table with totals rows, amount in words, notes, acceptance and sign-off.
   Everything is ordinary Word text and tables, so it can be edited freely.
   No library needed: a .docx is a zip of XML files, written here directly. */
import type { DocData, Section, Settings } from "../types";
import { amountInWords, computeTotals, formatDate, lineAmount, money, qtyText } from "./calc";
import { defaultHeading, fileNameFor } from "./document";
import { applyCase, applyOverrides, resolveText, type TextRole, type TextStyle } from "./typography";
import { isRich, parseRich, plainText, richLines, type Run } from "./rich";

/* ------------------------------------------------------------------ zip */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* A zip with the files stored uncompressed (Word reads that fine). */
export function zip(files: { name: string; data: string }[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = enc.encode(f.data);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, data.length, true);
    cen.setUint32(24, data.length, true);
    cen.setUint16(28, name.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cenSize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cenSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let p = 0;
  for (const a of all) {
    out.set(a, p);
    p += a.length;
  }
  return out;
}

/* ------------------------------------------------------------------ xml pieces */

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const has = (v: unknown) => (typeof v === "string" ? plainText(v).trim().length > 0 : v != null);
const hex = (c?: string) => (c || "").replace("#", "").toUpperCase();

type RunOpts = { b?: boolean; i?: boolean; u?: boolean; color?: string; size?: number; spacing?: number };
/* One run of text. size in pt; spacing = letter spacing in pt. Line breaks become <w:br/>. */
function run(text: string, o: RunOpts = {}): string {
  if (!text) return "";
  const pr = [
    o.b ? "<w:b/><w:bCs/>" : "",
    o.i ? "<w:i/><w:iCs/>" : "",
    o.u ? '<w:u w:val="single"/>' : "",
    o.color ? `<w:color w:val="${hex(o.color)}"/>` : "",
    o.spacing ? `<w:spacing w:val="${Math.round(o.spacing * 20)}"/>` : "",
    o.size ? `<w:sz w:val="${Math.round(o.size * 2)}"/><w:szCs w:val="${Math.round(o.size * 2)}"/>` : "",
  ].join("");
  return text
    .split("\n")
    .map((t, k) => `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ""}${k ? "<w:br/>" : ""}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`)
    .join("");
}

type ParaOpts = { align?: "left" | "center" | "right" | "both"; after?: number; before?: number; keepNext?: boolean; line?: number };
/* A paragraph. after/before in pt. */
function para(runs: string, o: ParaOpts = {}): string {
  const pr = [
    o.keepNext ? "<w:keepNext/>" : "",
    `<w:spacing w:before="${Math.round((o.before ?? 0) * 20)}" w:after="${Math.round((o.after ?? 0) * 20)}" w:line="${Math.round((o.line ?? 1.15) * 240)}" w:lineRule="auto"/>`,
    o.align && o.align !== "left" ? `<w:jc w:val="${o.align}"/>` : "",
  ].join("");
  return `<w:p><w:pPr>${pr}</w:pPr>${runs}</w:p>`;
}

const BORDER = 'w:val="single" w:sz="4" w:space="0" w:color="8C8C8C"';
const NONE = 'w:val="nil"';

type Cell = { xml: string; w: number; span?: number; borders?: string; vAlign?: "top" | "center" };
function cell(c: Cell): string {
  return `<w:tc><w:tcPr><w:tcW w:w="${c.w}" w:type="dxa"/>${c.span && c.span > 1 ? `<w:gridSpan w:val="${c.span}"/>` : ""}${c.borders ? `<w:tcBorders>${c.borders}</w:tcBorders>` : ""}<w:vAlign w:val="${c.vAlign || "top"}"/></w:tcPr>${c.xml || "<w:p/>"}</w:tc>`;
}
function table(grid: number[], rows: string[], o: { borders?: boolean; align?: "left" | "right" | "center"; width?: number; flush?: boolean } = {}): string {
  const pad = o.flush ? 0 : 100;
  const w = o.width ?? grid.reduce((a, b) => a + b, 0);
  const borders = o.borders === false
    ? `<w:tblBorders><w:top ${NONE}/><w:left ${NONE}/><w:bottom ${NONE}/><w:right ${NONE}/><w:insideH ${NONE}/><w:insideV ${NONE}/></w:tblBorders>`
    : `<w:tblBorders><w:top ${BORDER}/><w:left ${BORDER}/><w:bottom ${BORDER}/><w:right ${BORDER}/><w:insideH ${BORDER}/><w:insideV ${BORDER}/></w:tblBorders>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${w}" w:type="dxa"/>${o.align && o.align !== "left" ? `<w:jc w:val="${o.align}"/>` : ""}${borders}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="${pad}" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="${pad}" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid.map((g) => `<w:gridCol w:w="${g}"/>`).join("")}</w:tblGrid>${rows.join("")}</w:tbl>`;
}
const row = (cells: string[], o: { cantSplit?: boolean; height?: number } = {}) =>
  `<w:tr>${o.cantSplit || o.height ? `<w:trPr>${o.cantSplit ? "<w:cantSplit/>" : ""}${o.height ? `<w:trHeight w:val="${o.height}" w:hRule="atLeast"/>` : ""}</w:trPr>` : ""}${cells.join("")}</w:tr>`;

/* ------------------------------------------------------------------ the document */

export function buildDocx(data: DocData, settings: Settings): Uint8Array {
  const co = settings.company;
  const SIMPLE = (settings.brand.layout || "simple") === "simple";
  const TITLE = settings.brand.primary || "#3F3F3F";
  const TX = applyOverrides(resolveText("simple", settings.brand.text), data.text);
  const fmt = (iso: string) => formatDate(iso, settings.defaults.dateFormat);
  const cur = settings.defaults.currency || "Rs";
  const totals = computeTotals(data);
  const enabled = data.sections.filter((x) => x.enabled);
  const secOf = (t: Section["type"]) => enabled.find((x) => x.type === t);
  const cols = data.columns;
  const font = settings.brand.font === "Helvetica" ? "Arial" : settings.brand.font === "IBM Plex Sans" ? "IBM Plex Sans" : "Calibri";
  const letter = (settings.defaults.pageSize || "A4") === "LETTER";
  const PAGE_W = letter ? 12240 : 11906;
  const PAGE_H = letter ? 15840 : 16838;
  const MARGIN = 850; // ~1.5 cm
  const W = PAGE_W - MARGIN * 2;

  /* Style of a part (size, bold, colour, letter case) as run options. */
  const st = (r: TextRole, extra: RunOpts = {}): RunOpts => {
    const s: TextStyle = TX[r];
    return { size: s.size + 1, b: s.weight === "semibold" || s.weight === "bold", color: s.color || (r === "name" || r === "title" ? TITLE : undefined), ...extra };
  };
  const cased = (t: string, r: TextRole) => (TX[r].case ? applyCase(t, TX[r].case) : t);
  /* Stored text (plain or formatted) as runs in a part's style. */
  const rich = (v: string | null | undefined, r: TextRole, extra: RunOpts = {}): string => {
    const base = st(r, extra);
    if (!isRich(v)) return run(cased(v || "", r), base);
    return parseRich(v)
      .map((line, li) => (li ? "<w:r><w:br/></w:r>" : "") + line.map((x: Run) => run(cased(x.text, r), { ...base, b: x.b || base.b, i: x.i || base.i, u: x.u || base.u, color: x.c || base.color, size: x.s ? x.s + 1 : base.size })).join(""))
      .join("");
  };

  const headingOf = (sec: Section | undefined, type: Section["type"]): string | null => {
    if (sec?.hideHeading) return null;
    if (type === "custom") return has(sec?.title) ? sec!.title! : null;
    if (SIMPLE && (type === "recipient" || type === "subject")) return has(sec?.heading) ? sec!.heading!.trim() : null;
    const h = (sec?.heading ?? "").trim() || defaultHeading(type, data.type) || "";
    return h || null;
  };
  const headingPara = (h: string) => para(run(cased(h, "headings"), st("headings")), { after: 3, keepNext: true });

  /* Title (QUOTATION, INVOICE…) and where it goes. */
  const tCase = data.titleCase || (data.titleCaps === false ? "typed" : "upper");
  const titleText = tCase === "typed" ? data.title || "" : applyCase(data.title || "", tCase);
  const visibleItems = data.items.filter((it) => has(it.description) || it.qty != null || it.rate != null);
  const itemsOn = !!secOf("items") && (visibleItems.length > 0 || data.type !== "letter");
  const titleAtTable = has(data.title) && data.titlePlace !== "top" && itemsOn;
  const titlePara = () => para(run(titleText, st("title", { spacing: tCase === "upper" ? 2 : 0 })), { align: "center", before: 6, after: 6, keepNext: true });

  const body: string[] = [];

  /* --- letterhead */
  const letterhead = () => {
    if (has(co.tagline)) body.push(para(run(co.tagline, { size: 9, color: "#666666" }), { align: "center" }));
    body.push(para(run(TX.name.case ? cased(co.name, "name") : co.name.toUpperCase(), st("name", { spacing: TX.name.case && TX.name.case !== "upper" ? 0.5 : 2.5 })), { align: "center", after: 2 }));
    const lines = [
      [co.addressLine1, co.addressLine2].filter(has).join(" "),
      [co.phone && `Tel: ${co.phone}`, co.mobile && `Mobile: ${co.mobile}`].filter(has).join("   "),
      co.email && `Email: ${co.email}`,
      co.website,
      co.registrationNo && `Reg. No. ${co.registrationNo}`,
    ].filter(has) as string[];
    lines.forEach((l, i) => body.push(para(run(l, { size: TX.body.size, color: "#4D4D4D" }), { align: "center", after: i === lines.length - 1 ? 14 : 0 })));
  };

  /* --- customer */
  const c = data.customer;
  const custLines = [c.name, c.attention && `Attn: ${c.attention}`, c.line1, c.line2, c.line3, [c.phone, c.email].filter(has).join(", ")].filter(has) as string[];
  const recipient = () => {
    if (!custLines.length) return;
    const h = headingOf(secOf("recipient"), "recipient");
    if (h) body.push(headingPara(h));
    custLines.forEach((l, i) => body.push(para(i === 0 && has(c.name) ? run(cased(l, "customer"), st("customer")) : run(cased(l, "body"), { size: TX.body.size + 1, color: TX.body.color }), { after: i === custLines.length - 1 ? 12 : 0 })));
  };

  /* --- date / number line */
  const metaLabel = data.type === "invoice" ? "Invoice No." : data.type === "quotation" ? "Quotation No." : "Ref. No.";
  const details = () => {
    const left: [string, string][] = [["Date", data.issueDate ? fmt(data.issueDate) : ""], [data.type === "quotation" ? "Valid until" : data.type === "invoice" ? "Due date" : "", data.dueDate ? fmt(data.dueDate) : ""]];
    const right: [string, string][] = [[metaLabel, data.number], ["Reference", data.reference]];
    const rows = [0, 1].map((r) => [left[r], right[r]]).filter(([l, rr]) => (l[0] && has(l[1])) || has(rr[1]));
    const pair = ([k, v]: [string, string]) => (k && has(v) ? run(`${cased(k, "labels")}: `, st("labels")) + run(v, { size: TX.body.size + 1, color: TX.body.color }) : "");
    if (rows.length) {
      body.push(table([W / 2, W / 2].map(Math.round), rows.map(([l, r]) => row([cell({ xml: para(pair(l)), w: Math.round(W / 2) }), cell({ xml: para(pair(r), { align: "right" }), w: Math.round(W / 2) })])), { borders: false, width: W, flush: true }));
    }
    if (has(data.title) && !titleAtTable) body.push(titlePara());
    else body.push(para("", { after: 4 }));
  };

  /* --- items table, with totals rows */
  const widthsPct: Record<string, number> = { no: 6, unit: cols.unit ? 8 : 0, qty: cols.qty ? 8 : 0, rate: cols.rate ? 15 : 0, discount: cols.discount ? 12 : 0, amount: 17 };
  widthsPct.description = 100 - Object.values(widthsPct).reduce((a, b) => a + b, 0);
  const keys = (["no", "description", "unit", "qty", "rate", "discount", "amount"] as const).filter((k) => widthsPct[k] > 0);
  const tw = keys.map((k) => Math.round((W * widthsPct[k]) / 100));
  const relabel = (v: string, from: string, to: string) => (v.trim().toLowerCase() === from ? to : v);
  const head: Record<string, string> = {
    no: data.labels.no || "No.",
    description: relabel(data.labels.description, "itemized costs", "Description"),
    unit: relabel(data.labels.unit, "unit", "U/M"),
    qty: data.labels.qty,
    rate: relabel(data.labels.rate, "unit price", "Rate"),
    discount: data.labels.discount,
    amount: data.labels.amount,
  };
  const A = data.align || { vertical: "top", text: "left", numbers: "right" };
  const alignOf = (k: string): "left" | "center" | "right" => (k === "description" ? A.text : k === "no" ? "center" : A.numbers === "right" ? (k === "unit" || k === "qty" ? "center" : "right") : A.numbers);
  const vAlign = A.vertical === "middle" ? "center" : "top";

  const totalLines = () => {
    const rows: { label: string; value: string; strong?: boolean }[] = [{ label: "Subtotal", value: totals.subtotal ? money(totals.subtotal) : "" }];
    if (totals.discount > 0) rows.push({ label: data.discount.mode === "percent" ? `Discount (${data.discount.value}%)` : "Discount", value: `(${money(totals.discount)})` });
    if (totals.tax > 0 || data.type === "invoice") rows.push({ label: `${data.tax.label || "Tax"} (${data.tax.percent || 0}%)`, value: totals.tax ? money(totals.tax) : "" });
    const tl = (data.grandTotalLabel || "Total").trim();
    rows.push({ label: tl === tl.toUpperCase() ? tl.charAt(0) + tl.slice(1).toLowerCase() : tl, value: totals.total ? `${cur} ${money(totals.total)}` : "", strong: true });
    if (data.type === "invoice") {
      rows.push({ label: "Payments / credits", value: totals.paid ? money(totals.paid) : "" });
      rows.push({ label: "Balance due", value: totals.balance ? `${cur} ${money(totals.balance)}` : "", strong: true });
    }
    return rows;
  };

  const itemsTable = (withTotals: boolean) => {
    const rows: string[] = [];
    if (!secOf("items")?.hideHeading) {
      rows.push(row(keys.map((k, i) => cell({ w: tw[i], vAlign: "center", xml: para(run(cased(head[k], "tableHead"), st("tableHead")), { align: "center" }) })), { cantSplit: true }));
    }
    let n = 0;
    for (const it of visibleItems) {
      if (it.kind === "heading") {
        rows.push(row([cell({ w: W, span: keys.length, xml: para(rich(it.description, "table", { b: true }), { align: A.text, keepNext: true }) })], { cantSplit: true }));
        continue;
      }
      n += 1;
      const amt = lineAmount(it, cols.discount);
      const val: Record<string, string> = { no: String(n), unit: it.unit, qty: qtyText(it.qty), rate: it.rate != null ? money(it.rate) : "", discount: it.discount ? money(it.discount) : "-", amount: amt != null ? money(amt) : "" };
      rows.push(row(keys.map((k, i) => cell({ w: tw[i], vAlign, xml: para(k === "description" ? rich(it.description, "table") : run(val[k], st("table")), { align: alignOf(k) }) }))));
    }
    if (withTotals) {
      // Label under the number columns, value under Amount; blank cells on the left have no lines.
      const numKeys = keys.filter((k) => k !== "no" && k !== "description" && k !== "amount");
      const blankKeys = numKeys.length ? keys.filter((k) => k === "no" || k === "description") : keys.filter((k) => k === "no");
      const labelKeys = numKeys.length ? numKeys : (["description"] as const);
      const wOf = (ks: readonly string[]) => ks.reduce((a, k) => a + tw[keys.indexOf(k as (typeof keys)[number])], 0);
      totalLines().forEach((t, i) => {
        const role = t.strong ? "grandTotal" : "totals";
        const blankBorders = `${i === 0 ? `<w:top ${BORDER}/>` : `<w:top ${NONE}/>`}<w:left ${NONE}/><w:bottom ${NONE}/>`;
        rows.push(row([
          cell({ w: wOf(blankKeys), span: blankKeys.length, borders: blankBorders, xml: "<w:p/>" }),
          cell({ w: wOf(labelKeys), span: labelKeys.length, xml: para(run(cased(t.label, role), st(role)), { align: "right" }) }),
          cell({ w: tw[keys.length - 1], xml: para(run(t.value, st(role)), { align: "right" }) }),
        ], { cantSplit: true }));
      });
    }
    body.push(table(tw, rows, { width: W }));
    body.push(para("", { after: 6 }));
  };

  const totalsList = () => {
    const rows = totalLines().map((t) => {
      const role = t.strong ? "grandTotal" : "totals";
      return row([cell({ w: Math.round(W * 0.28), xml: para(run(cased(t.label, role), st(role)), { align: "right" }) }), cell({ w: Math.round(W * 0.2), xml: para(run(t.value, st(role)), { align: "right" }) })]);
    });
    body.push(table([Math.round(W * 0.28), Math.round(W * 0.2)], rows, { borders: false, align: "right" }));
    body.push(para("", { after: 6 }));
  };

  const words = () => {
    if (!totals.total) return;
    const w = amountInWords(data.type === "invoice" && totals.paid > 0 ? totals.balance : totals.total).replace(/^Rupees\s/i, "").replace(/^./, (x) => x.toUpperCase());
    body.push(para(run(`Amount in words (${cur === "Rs" ? "Rupees" : cur})`, { size: TX.body.size, color: "#666666" })));
    body.push(para(run(w, { size: TX.body.size + 1, color: TX.body.color }), { after: 10 }));
  };

  const paragraphs = (v: string, justify = false) =>
    richLines(v).filter((l) => has(l)).forEach((l) => body.push(para(rich(l, "body"), { after: 4, align: justify ? "both" : "left" })));

  /* --- walk the sections in order */
  const seq = enabled.filter((x) => x.type !== "footer");
  for (let i = 0; i < seq.length; i++) {
    const sec = seq[i];
    const next = seq[i + 1]?.type;
    switch (sec.type) {
      case "letterhead":
        letterhead();
        break;
      case "details":
        if (next === "recipient") {
          recipient();
          i++;
        }
        details();
        break;
      case "recipient":
        recipient();
        break;
      case "salutation":
        if (has(data.salutation)) body.push(para(rich(data.salutation, "body"), { after: 8 }));
        break;
      case "subject": {
        const withIntro = next === "intro" && has(data.intro);
        if (data.type === "letter") {
          if (has(data.subject)) body.push(para(run("Re: ", st("body", { b: true })) + rich(data.subject, "body", { b: true }), { after: 8 }));
          break;
        }
        const h = headingOf(sec, "subject");
        if (h && (has(data.subject) || withIntro)) body.push(headingPara(h));
        if (has(data.subject)) body.push(para(rich(data.subject, "body", { b: true }), { after: 4 }));
        if (withIntro) {
          paragraphs(data.intro);
          i++;
        }
        if (has(data.subject) || withIntro) body.push(para("", { after: 4 }));
        break;
      }
      case "intro":
        if (has(data.intro)) paragraphs(data.intro, true);
        break;
      case "items": {
        if (!itemsOn) break;
        if (titleAtTable) body.push(titlePara());
        const later: string[] = [];
        for (let j = i + 1; j < seq.length && later.length < 2 && (seq[j].type === "totals" || seq[j].type === "words"); j++) later.push(seq[j].type);
        const rowsHere = data.totalsStyle !== "list" && later.includes("totals");
        itemsTable(rowsHere);
        if (later.includes("words")) words();
        if (!rowsHere && later.includes("totals")) totalsList();
        i += later.length;
        break;
      }
      case "totals":
        totalsList();
        break;
      case "words":
        words();
        break;
      case "notes": {
        const notes = data.notes.filter((x) => has(x));
        if (!notes.length) break;
        if (has(data.notesTitle)) body.push(para(run(cased(data.notesTitle, "headings"), st("headings")), { after: 3, keepNext: true }));
        body.push(para(notes.map((x, k) => (k ? run(" ") : "") + rich(x, "body")).join(""), { after: 10 }));
        break;
      }
      case "bank": {
        const b = settings.bank;
        const rows = [b.accountName && `Account name: ${b.accountName}`, b.bankName && `Bank: ${b.bankName}${b.branch ? `, ${b.branch}` : ""}`, b.accountNo && `Account no: ${b.accountNo}`].filter(has) as string[];
        if (!rows.length) break;
        const h = headingOf(sec, "bank");
        if (h) body.push(headingPara(h));
        rows.forEach((r, k) => body.push(para(run(r, st("body")), { after: k === rows.length - 1 ? 10 : 0 })));
        break;
      }
      case "custom": {
        const h = headingOf(sec, "custom");
        if (!h && !has(sec.text)) break;
        if (h) body.push(headingPara(h));
        paragraphs(sec.text || "");
        body.push(para("", { after: 4 }));
        break;
      }
      case "acceptance": {
        const h = headingOf(sec, "acceptance");
        if (h) body.push(para(run(h, st("body")), { after: 2, keepNext: true }));
        const g = [0.45, 0.3, 0.25].map((f) => Math.round(W * f));
        const capBorders = `<w:top ${BORDER}/><w:left ${NONE}/><w:bottom ${NONE}/><w:right ${NONE}/>`;
        body.push(table(g, [
          row([cell({ w: g[0], vAlign: "top", xml: para(run("x", { size: 9 })) }), cell({ w: g[1], xml: "<w:p/>" }), cell({ w: g[2], xml: "<w:p/>" })], { height: 600, cantSplit: true }),
          row(["Signature", "Printed name", "Date"].map((t, k) => cell({ w: g[k], borders: capBorders, xml: para(run(t, { size: 8, color: "#666666" })) })), { cantSplit: true }),
        ], { width: W }));
        body.push(para("", { after: 8 }));
        break;
      }
      case "closing":
        if (!has(data.closing) && !has(data.signatoryName)) break;
        richLines(data.closing).filter((l) => has(l)).forEach((l) => body.push(para(rich(l, "body"))));
        body.push(para("", { after: data.showSignatureLine ? 24 : 16 }));
        if (data.showSignatureLine) body.push(para(run("______________________________")));
        if (has(data.signatoryName)) body.push(para(run(data.signatoryName, st("body", { b: true }))));
        if (has(data.signatoryTitle)) body.push(para(run(data.signatoryTitle, { size: TX.body.size + 1, color: "#666666" })));
        if (data.type !== "letter") body.push(para(run("Authorised signature", { size: TX.body.size + 1, color: "#666666" })));
        break;
      default:
        break;
    }
  }

  const footerOn = !!secOf("footer");
  const contact = [settings.signatory.name, co.phone || co.mobile, co.email].filter(has).join(", ");
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const sect = `<w:sectPr>${footerOn ? '<w:footerReference w:type="default" r:id="rIdFooter"/>' : ""}<w:pgSz w:w="${PAGE_W}" w:h="${PAGE_H}"/><w:pgMar w:top="760" w:right="${MARGIN}" w:bottom="1000" w:left="${MARGIN}" w:header="400" w:footer="450" w:gutter="0"/></w:sectPr>`;
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body.join("")}${sect}</w:body></w:document>`;
  const footerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}>${para(run(`If you have any questions, please contact ${contact}`, st("footer", { color: TX.footer.color || "#4D4D4D" })), { align: "center" })}<w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:sz w:val="14"/><w:color w:val="666666"/></w:rPr><w:t xml:space="preserve">Page </w:t></w:r><w:r><w:rPr><w:sz w:val="14"/><w:color w:val="666666"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:sz w:val="14"/><w:color w:val="666666"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:rPr><w:sz w:val="14"/><w:color w:val="666666"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}" w:cs="${font}"/><w:sz w:val="${Math.round((TX.body.size + 1) * 2)}"/><w:szCs w:val="${Math.round((TX.body.size + 1) * 2)}"/><w:color w:val="${hex(TX.body.color) || "262626"}"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;
  const title = esc(`${data.title || data.type} ${data.number}`.trim());

  return zip([
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
    { name: "docProps/core.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${title}</dc:title><dc:creator>${esc(co.name)}</dc:creator></cp:coreProperties>` },
    { name: "word/_rels/document.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>` },
    { name: "word/styles.xml", data: stylesXml },
    { name: "word/footer1.xml", data: footerXml },
    { name: "word/document.xml", data: documentXml },
  ]);
}

/* Save the Word file. */
export function downloadDocx(data: DocData, settings: Settings) {
  const bytes = buildDocx(data, settings);
  const blob = new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileNameFor(data).replace(/\.pdf$/i, ".docx");
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
