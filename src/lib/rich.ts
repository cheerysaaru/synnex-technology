/* Formatted text, Word style: bold, italic, underline, colour and size on any
   words. Stored in the same string fields as before, so old plain text still
   works unchanged. A formatted run looks like
     <r b i u c="#C00000" s="12">some words</r>
   Runs never span a line break; lines are separated by "\n". */

export type Run = { text: string; b?: boolean; i?: boolean; u?: boolean; c?: string; s?: number };

const RUN_RE = /<r((?:\s+[a-z]+(?:="[^"]*")?)*)\s*>([\s\S]*?)<\/r>/g;

export const isRich = (v: string | null | undefined) => typeof v === "string" && /<r[\s>]/.test(v);

const decode = (t: string) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const encode = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const hex = (c: unknown) => (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? c.toUpperCase() : undefined);

function parseAttrs(a: string): Omit<Run, "text"> {
  const out: Omit<Run, "text"> = {};
  for (const m of a.matchAll(/([a-z]+)(?:="([^"]*)")?/g)) {
    const [, k, v] = m;
    if (k === "b") out.b = true;
    else if (k === "i") out.i = true;
    else if (k === "u") out.u = true;
    else if (k === "c") out.c = hex(v);
    else if (k === "s" && v && Number(v) >= 4 && Number(v) <= 72) out.s = Number(v);
  }
  return out;
}

/* One line of stored text as runs. Plain text is one unformatted run.
   "rich" says whether the whole value is formatted text: then every line,
   even one without runs, has & < > stored as &amp; &lt; &gt;. */
export function parseLine(line: string, rich = isRich(line)): Run[] {
  if (!rich) return line ? [{ text: line }] : [];
  const runs: Run[] = [];
  let last = 0;
  for (const m of line.matchAll(RUN_RE)) {
    if (m.index! > last) runs.push({ text: decode(line.slice(last, m.index)) });
    runs.push({ text: decode(m[2]), ...parseAttrs(m[1] || "") });
    last = m.index! + m[0].length;
  }
  if (last < line.length) runs.push({ text: decode(line.slice(last)) });
  return runs.filter((r) => r.text);
}

export const parseRich = (v: string | null | undefined): Run[][] => {
  const rich = isRich(v);
  return (v || "").split("\n").map((line) => parseLine(line, rich));
};

const styled = (r: Run) => Boolean(r.b || r.i || r.u || r.c || r.s);
const sameStyle = (a: Run, b: Run) => !!a.b === !!b.b && !!a.i === !!b.i && !!a.u === !!b.u && a.c === b.c && a.s === b.s;

/* Lines of runs back to a stored string. Unformatted text stays plain. */
export function serializeRich(lines: Run[][]): string {
  const anyStyle = lines.some((l) => l.some(styled));
  return lines
    .map((line) => {
      const merged: Run[] = [];
      for (const r of line) {
        if (!r.text) continue;
        const prev = merged[merged.length - 1];
        if (prev && sameStyle(prev, r)) prev.text += r.text;
        else merged.push({ ...r });
      }
      if (!anyStyle) return merged.map((r) => r.text).join("");
      return merged
        .map((r) => {
          if (!styled(r)) return encode(r.text);
          const at = [r.b && "b", r.i && "i", r.u && "u", r.c && `c="${r.c}"`, r.s && `s="${r.s}"`].filter(Boolean).join(" ");
          return `<r ${at}>${encode(r.text)}</r>`;
        })
        .join("");
    })
    .join("\n");
}

/* Split stored text into lines that each stand on their own (a line without
   formatting comes back as plain text). */
export const richLines = (v: string | null | undefined): string[] => (isRich(v) ? parseRich(v).map((l) => serializeRich([l])) : (v || "").split("\n"));

/* Text without formatting, for lists, search and file names. */
export const plainText = (v: string | null | undefined) => (isRich(v) ? parseRich(v).map((l) => l.map((r) => r.text).join("")).join("\n") : v || "");

/* --- editor <-> stored text */

const escHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* Stored text as HTML for the editable box. */
export function richToHtml(v: string | null | undefined): string {
  return parseRich(v)
    .map((line) =>
      line
        .map((r) => {
          const css = [r.b && "font-weight:700", r.i && "font-style:italic", r.u && "text-decoration:underline", r.c && `color:${r.c}`, r.s && `font-size:${r.s}pt`].filter(Boolean).join(";");
          return css ? `<span style="${css}">${escHtml(r.text)}</span>` : escHtml(r.text);
        })
        .join(""),
    )
    .join("<br>");
}

const cssColorToHex = (c: string): string | undefined => {
  if (!c) return undefined;
  if (c.startsWith("#")) return hex(c.length === 4 ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}` : c);
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? hex(`#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`) : undefined;
};
const sizeToPt = (v: string): number | undefined => {
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return undefined;
  const pt = v.endsWith("px") ? n * 0.75 : v.endsWith("em") || v.endsWith("rem") ? undefined : n;
  return pt ? Math.round(pt * 2) / 2 : undefined;
};

/* The editable box's content back to a stored string. */
export function htmlToRich(root: HTMLElement): string {
  const lines: Run[][] = [[]];
  const walk = (node: Node, st: Omit<Run, "text">) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent || "").replace(/ /g, " ").replace(/​/g, "");
      if (t) lines[lines.length - 1].push({ text: t, ...st });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const tag = node.tagName;
    if (tag === "BR") {
      lines.push([]);
      return;
    }
    const block = tag === "DIV" || tag === "P";
    if (block && lines[lines.length - 1].length) lines.push([]);
    const next = { ...st };
    if (tag === "B" || tag === "STRONG") next.b = true;
    if (tag === "I" || tag === "EM") next.i = true;
    if (tag === "U") next.u = true;
    if (tag === "FONT" && node.getAttribute("color")) next.c = cssColorToHex(node.getAttribute("color")!);
    const s = node.style;
    if (s.fontWeight) next.b = s.fontWeight === "bold" || Number(s.fontWeight) >= 600;
    if (s.fontStyle) next.i = s.fontStyle === "italic";
    if (s.textDecoration || s.textDecorationLine) next.u = (s.textDecorationLine || s.textDecoration).includes("underline");
    if (s.color) next.c = cssColorToHex(s.color);
    if (s.fontSize) next.s = sizeToPt(s.fontSize);
    node.childNodes.forEach((ch) => walk(ch, next));
  };
  root.childNodes.forEach((ch) => walk(ch, {}));
  // A trailing empty line comes from the browser's placeholder <br>.
  while (lines.length > 1 && !lines[lines.length - 1].length) lines.pop();
  return serializeRich(lines);
}
