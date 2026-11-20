/* The quotation / invoice / letter editor.
   Every part of the document is a section card: edit it, hide it from the PDF,
   move it up or down, or add your own sections. The PDF preview updates as you
   type, and you can download at any time — nothing has to be complete first. */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowDown, ArrowLeft, ArrowRightLeft, ArrowUp, BookmarkPlus, Check, ChevronDown, Columns3, Copy, Eye, EyeOff, FileDown,
  Heading, ListPlus, Loader2, Monitor, PenLine, Plus, Printer, Redo2, RotateCcw, Trash2, Type, Undo2, UserPlus,
} from "lucide-react";
import { Button, ConfirmDelete, Field, IconButton, Input, Modal, NumberInput, Select, Spinner, Toggle, cx } from "../components/ui";
import { backend, ApiError } from "../lib/api";
import { useApp } from "../lib/app";
import { amountInWords, computeTotals, lineAmount, money } from "../lib/calc";
import { SECTION_INFO, STATUSES, defaultHeading, TYPE_LABEL, TYPE_PLURAL, emptyCustomer, emptyItem, headingRow, newDocData, normalizeDoc, uid } from "../lib/document";
import { downloadPdf, printPdf, renderPdf } from "../lib/pdf";
import { PdfPages } from "../components/PdfPages";
import { TextControls } from "../components/TextControls";
import { RichInput } from "../components/RichInput";
import { plainText } from "../lib/rich";
import { TEXT_ROLES, applyOverrides, layoutDefaults, resolveText, withColors, type TextOverrides, type TextStyle } from "../lib/typography";
import type { CatalogItem, Customer, DocData, DocType, LineItem, Section, SectionType } from "../types";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export default function Editor({ id, newType }: { id?: string; newType?: DocType }) {
  const { settings, toast } = useApp();
  const navigate = useNavigate();
  const [recId, setRecId] = useState<string | undefined>(id);
  const [status, setStatus] = useState("draft");
  const [doc, setDoc] = useState<DocData | null>(newType ? newDocData(newType, settings) : null);
  const [save, setSave] = useState<SaveState>("idle");
  const [loadError, setLoadError] = useState("");
  const [customers, setCustomers] = useState<(Customer & { id: string })[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [textOpen, setTextOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const savingRef = useRef(false);
  const queued = useRef(false);
  const docRef = useRef(doc);
  docRef.current = doc;
  const statusRef = useRef(status);
  statusRef.current = status;
  const recIdRef = useRef(recId);
  recIdRef.current = recId;

  /* ---------------------------------------------------------------- load */
  useEffect(() => {
    if (!id) return;
    backend()
      .getDoc(id)
      .then((r) => {
        setDoc(normalizeDoc(r.type, r.data, settings));
        setStatus(r.status);
        setSave("saved");
      })
      .catch((e) => setLoadError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    backend().customers().then(setCustomers).catch(() => {});
    backend().catalog().then(setCatalog).catch(() => {});
  }, []);

  /* ---------------------------------------------------------------- save */
  const persist = useCallback(async () => {
    const current = docRef.current;
    if (!current) return;
    if (savingRef.current) {
      queued.current = true;
      return;
    }
    savingRef.current = true;
    setSave("saving");
    try {
      if (!recIdRef.current) {
        const rec = await backend().createDoc(current.type, current, statusRef.current);
        setRecId(rec.id);
        recIdRef.current = rec.id;
        // Keep the number the server assigned, without remounting the editor.
        setDoc((d) => (d && !d.number ? { ...d, number: rec.number } : d));
        window.history.replaceState(null, "", `#/doc/${rec.id}`);
      } else {
        await backend().updateDoc(recIdRef.current, current, statusRef.current);
      }
      setSave(queued.current ? "dirty" : "saved");
    } catch (e) {
      setSave("error");
      toast(e instanceof ApiError ? e.message : "Could not save.", "error");
    } finally {
      savingRef.current = false;
      if (queued.current) {
        queued.current = false;
        persist();
      }
    }
  }, [toast]);

  // Autosave shortly after the last change.
  useEffect(() => {
    if (save !== "dirty") return;
    const t = setTimeout(persist, 1200);
    return () => clearTimeout(t);
  }, [doc, status, save, persist]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        persist();
      }
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (save === "dirty" || save === "saving") e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [persist, save]);

  /* ---------------------------------------------------------------- undo / redo
     Every change keeps the version before it. Typing in a burst counts as one
     step, so Undo takes back a whole word or phrase, not one letter. */
  const past = useRef<DocData[]>([]);
  const future = useRef<DocData[]>([]);
  const lastStep = useRef(0);
  const [, setHistoryTick] = useState(0);

  const update = useCallback((patch: Partial<DocData> | ((d: DocData) => Partial<DocData>)) => {
    const cur = docRef.current;
    if (cur) {
      const now = Date.now();
      if (now - lastStep.current > 800 || !past.current.length) {
        past.current.push(cur);
        if (past.current.length > 150) past.current.shift();
      }
      lastStep.current = now;
      future.current = [];
      setHistoryTick((n) => n + 1);
    }
    setDoc((d) => (d ? { ...d, ...(typeof patch === "function" ? patch(d) : patch) } : d));
    setSave("dirty");
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev || !docRef.current) return;
    future.current.push(docRef.current);
    lastStep.current = 0;
    setDoc(prev);
    setSave("dirty");
    setHistoryTick((n) => n + 1);
  }, []);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next || !docRef.current) return;
    past.current.push(docRef.current);
    lastStep.current = 0;
    setDoc(next);
    setSave("dirty");
    setHistoryTick((n) => n + 1);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const changeStatus = (s: string) => {
    setStatus(s);
    setSave("dirty");
  };

  /* ---------------------------------------------------------------- sections */
  const setSections = (fn: (s: Section[]) => Section[]) => update((d) => ({ sections: fn(d.sections) }));
  const moveSection = (idx: number, dir: -1 | 1) =>
    setSections((s) => {
      const next = [...s];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return s;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  const toggleSection = (sid: string) => setSections((s) => s.map((x) => (x.id === sid ? { ...x, enabled: !x.enabled } : x)));
  const removeSection = (sid: string) => setSections((s) => s.filter((x) => x.id !== sid));
  const patchSection = (sid: string, patch: Partial<Section>) => setSections((s) => s.map((x) => (x.id === sid ? { ...x, ...patch } : x)));
  const addCustom = () => setSections((s) => {
    const closingAt = s.findIndex((x) => x.type === "closing");
    const sec: Section = { id: uid(), type: "custom", enabled: true, title: "", text: "" };
    const next = [...s];
    next.splice(closingAt >= 0 ? closingAt : next.length, 0, sec);
    return next;
  });

  /* ---------------------------------------------------------------- actions */
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message || "Something went wrong.", "error");
    } finally {
      setBusy(null);
    }
  };

  const ensureSaved = async () => {
    if (save === "dirty" || !recIdRef.current) await persist();
    return recIdRef.current;
  };

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-mute">{loadError}</p>
        <Button onClick={() => navigate("/")}>Back to dashboard</Button>
      </div>
    );
  }
  if (!doc) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const totals = computeTotals(doc);
  const listPath = `/${doc.type === "letter" ? "letters" : `${doc.type}s`}`;
  const hidden = doc.sections.filter((s) => !s.enabled && s.type !== "custom");

  return (
    <div className="flex h-screen flex-col bg-panel lg:gap-3 lg:bg-frame lg:p-3">
      {/* ------------------------------------------------ top bar */}
      <header className="z-20 flex flex-wrap items-center gap-2 border-b border-line bg-white px-3 py-2.5 sm:px-5 lg:rounded-[20px] lg:border-0">
        <Link to={listPath} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3 text-[13px] font-semibold text-ink hover:border-ink/30">
          <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">{TYPE_PLURAL[doc.type]}</span>
        </Link>
        <div className="mr-auto flex min-w-0 items-center gap-2">
          <h1 className="truncate text-base font-bold tracking-tight text-ink sm:text-lg">
            {TYPE_LABEL[doc.type]} {doc.number || <span className="font-normal text-mute">(new)</span>}
          </h1>
          <SaveIndicator state={save} />
        </div>

        <Select value={status} onChange={(e) => changeStatus(e.target.value)} className="h-9 w-auto! rounded-full! capitalize" aria-label="Status">
          {STATUSES[doc.type].map((s) => (
            <option key={s} value={s} className="capitalize">{s}</option>
          ))}
        </Select>

        <div className="flex rounded-full border border-line p-0.5 xl:hidden" role="group" aria-label="View">
          {(["edit", "preview"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} className={cx("h-8 rounded-full px-3 text-[13px] font-semibold capitalize", view === v ? "bg-ink text-white" : "text-ink")}>
              {v}
            </button>
          ))}
        </div>

        <SaveButton state={save} onSave={() => persist()} />
        <div className="flex items-center rounded-full border border-line p-0.5" role="group" aria-label="Undo and redo">
          <button type="button" onClick={undo} disabled={!past.current.length} className="flex h-8 items-center gap-1 rounded-full px-2.5 text-[13px] font-semibold text-ink hover:bg-panel disabled:opacity-30 disabled:hover:bg-transparent" title="Undo (Ctrl+Z)" aria-label="Undo">
            <Undo2 className="h-4 w-4" /> <span className="hidden 2xl:inline">Undo</span>
          </button>
          <button type="button" onClick={redo} disabled={!future.current.length} className="flex h-8 items-center gap-1 rounded-full px-2.5 text-[13px] font-semibold text-ink hover:bg-panel disabled:opacity-30 disabled:hover:bg-transparent" title="Redo (Ctrl+Y)" aria-label="Redo">
            <Redo2 className="h-4 w-4" /> <span className="hidden 2xl:inline">Redo</span>
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            setTextOpen(true);
            setView("edit");
            setTimeout(() => document.getElementById("text-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-ink hover:bg-panel"
          title="Font size and bold"
        >
          <Type className="h-4 w-4" /> <span className="hidden sm:inline">Text size</span>
        </button>
        <Button size="sm" variant="ghost" icon={<Printer className="h-4 w-4" />} loading={busy === "print"} onClick={() => run("print", () => printPdf(doc, settings))} className="hidden sm:inline-flex">
          Print
        </Button>
        <Button size="sm" variant="primary" icon={<FileDown className="h-4 w-4" />} loading={busy === "pdf"} onClick={() => run("pdf", () => downloadPdf(doc, settings))}>
          Download PDF
        </Button>
        <MoreMenu
          items={[
            { label: "Save now", icon: <Check className="h-4 w-4" />, onClick: () => persist() },
            {
              label: "Duplicate",
              icon: <Copy className="h-4 w-4" />,
              onClick: () => run("dup", async () => {
                const rid = await ensureSaved();
                if (!rid) return;
                const n = await backend().duplicateDoc(rid);
                toast(`Copied as ${n.number}.`);
                navigate(`/doc/${n.id}`);
              }),
            },
            ...(doc.type === "quotation"
              ? [{
                  label: "Convert to invoice",
                  icon: <ArrowRightLeft className="h-4 w-4" />,
                  onClick: () => run("convert", async () => {
                    const rid = await ensureSaved();
                    if (!rid) return;
                    const n = await backend().convertDoc(rid);
                    toast(`Invoice ${n.number} created from this quotation.`);
                    navigate(`/doc/${n.id}`);
                  }),
                }]
              : []),
            {
              label: "Reset layout",
              icon: <RotateCcw className="h-4 w-4" />,
              onClick: () => update({ sections: newDocData(doc.type, settings).sections }),
            },
            ...(recId
              ? [{
                  label: "Delete document",
                  icon: <Trash2 className="h-4 w-4" />,
                  danger: true,
                  onClick: () => run("del", async () => {
                    if (!window.confirm(`Delete ${TYPE_LABEL[doc.type].toLowerCase()} ${doc.number}? This cannot be undone.`)) return;
                    await backend().deleteDoc(recId);
                    toast("Deleted.");
                    navigate(listPath);
                  }),
                }]
              : []),
          ]}
        />
      </header>

      <div className="flex min-h-0 flex-1 lg:gap-3">
        {/* ------------------------------------------------ editor */}
        <div className={cx("scroll-thin min-h-0 flex-1 overflow-y-auto bg-panel lg:rounded-[20px]", view === "preview" && "hidden xl:block")}>
          <div className="mx-auto max-w-3xl space-y-3 px-3 py-5 sm:px-5">
            <TextPanel doc={doc} update={update} open={textOpen} setOpen={setTextOpen} />
            {doc.sections.map((sec, idx) => (
              <SectionCard
                key={sec.id}
                section={sec}
                first={idx === 0}
                last={idx === doc.sections.length - 1}
                onUp={() => moveSection(idx, -1)}
                onDown={() => moveSection(idx, 1)}
                onToggle={() => toggleSection(sec.id)}
                onRemove={sec.type === "custom" ? () => removeSection(sec.id) : undefined}
                summary={sectionSummary(sec, doc, totals.total, settings.defaults.currency)}
                saveState={save}
                onSave={() => persist()}
              >
                <HeadingControl section={sec} docType={doc.type} onChange={(p) => patchSection(sec.id, p)} />
                <SectionBody
                  section={sec}
                  doc={doc}
                  update={update}
                  patchSection={(p) => patchSection(sec.id, p)}
                  customers={customers}
                  setCustomers={setCustomers}
                  catalog={catalog}
                  setCatalog={setCatalog}
                  totals={totals}
                />
              </SectionCard>
            ))}

            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-line bg-white/60 p-3">
              <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={addCustom}>
                Add custom section
              </Button>
              {hidden.length ? <span className="text-[13px] text-mute">Show again:</span> : null}
              {hidden.map((h) => (
                <button key={h.id} type="button" onClick={() => toggleSection(h.id)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-white px-3 text-[13px] text-ink hover:border-navy/50">
                  <Eye className="h-3.5 w-3.5" /> {SECTION_INFO[h.type].label}
                </button>
              ))}
            </div>
            <p className="pb-6 text-center text-xs text-mute">Changes save automatically. Press Ctrl+S to save straight away.</p>
          </div>
        </div>

        {/* ------------------------------------------------ preview */}
        <div className={cx("min-h-0 w-full flex-col overflow-hidden bg-[#e6e8ec] lg:rounded-[20px] xl:flex xl:w-[46%] 2xl:w-[48%]", view === "preview" ? "flex" : "hidden")}>
          <Preview doc={doc} />
        </div>
      </div>
    </div>
  );
}

/* ================================================================ pieces */

/* Save now. Lights up when there are unsaved changes; changes also save on their own after a moment. */
function SaveButton({ state, onSave, compact }: { state: SaveState; onSave: () => void; compact?: boolean }) {
  const pending = state === "dirty" || state === "error" || state === "idle";
  const saving = state === "saving";
  return (
    <button
      type="button"
      onClick={onSave}
      disabled={saving || state === "saved"}
      title="Save (Ctrl+S)"
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full font-semibold transition",
        compact ? "h-8 px-3 text-[12px]" : "h-9 px-3.5 text-[13px]",
        pending ? "bg-signal text-white hover:bg-signal/90" : "border border-line text-mute",
      )}
    >
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      {saving ? "Saving…" : state === "saved" ? "Saved" : "Save"}
    </button>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const map: Record<SaveState, ReactNode> = {
    idle: <span className="text-mute">Not saved yet</span>,
    dirty: <span className="text-mute">Unsaved changes</span>,
    saving: <span className="inline-flex items-center gap-1 text-mute"><Loader2 className="h-3 w-3 animate-spin" /> Saving…</span>,
    saved: <span className="inline-flex items-center gap-1 text-emerald-700"><Check className="h-3 w-3" /> Saved</span>,
    error: <span className="text-red-600">Not saved — check connection</span>,
  };
  return <span className="hidden whitespace-nowrap text-xs sm:inline">{map[state]}</span>;
}

function MoreMenu({ items }: { items: { label: string; icon: ReactNode; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)} aria-expanded={open} icon={<ChevronDown className="h-4 w-4" />}>
        More
      </Button>
      {open ? (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-52 rounded-2xl border border-line bg-white p-1.5 shadow-xl">
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                className={cx("flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-panel", it.danger ? "text-red-600" : "text-ink")}
              >
                {it.icon}
                {it.label}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Preview({ doc }: { doc: DocData }) {
  const { settings } = useApp();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      setRendering(true);
      try {
        const b = await renderPdf({ ...doc, number: doc.number || "DRAFT" }, settings);
        if (alive) {
          setBlob(b);
          setError("");
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setRendering(false);
      }
    }, 600);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [doc, settings]);

  return (
    <>
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-black/5 px-4 text-xs text-mute">
        <span className="inline-flex items-center gap-1.5"><Monitor className="h-3.5 w-3.5" /> Live preview — exactly what the PDF will look like</span>
        {rendering ? <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Updating</span> : null}
      </div>
      <div className="relative min-h-0 flex-1">
        {error ? <p className="p-6 text-sm text-red-600">Preview failed: {error}</p> : null}
        {blob ? <PdfPages blob={blob} onError={setError} /> : <div className="flex h-full items-center justify-center"><Spinner /></div>}
      </div>
    </>
  );
}

function sectionSummary(sec: Section, d: DocData, total: number, cur: string): string {
  switch (sec.type) {
    case "details": return [d.title, d.number, d.issueDate].filter(Boolean).join(" · ");
    case "recipient": return d.customer.name || "No customer yet";
    case "salutation": return plainText(d.salutation);
    case "subject": return plainText(d.subject);
    case "intro": return plainText(d.intro).slice(0, 80);
    case "items": {
      const n = d.items.filter((i) => i.kind === "item").length;
      return `${n} item${n === 1 ? "" : "s"}`;
    }
    case "totals": return `${cur} ${money(total)}`;
    case "notes": return `${d.notes.filter((x) => x.trim()).length} line(s)`;
    case "custom": return sec.title || "Untitled";
    case "closing": return d.signatoryName;
    default: return "";
  }
}

function SectionCard({
  section, first, last, onUp, onDown, onToggle, onRemove, summary, children, saveState, onSave,
}: {
  section: Section; first: boolean; last: boolean; onUp: () => void; onDown: () => void; onToggle: () => void; onRemove?: () => void; summary: string; children: ReactNode; saveState: SaveState; onSave: () => void;
}) {
  const info = SECTION_INFO[section.type];
  const [collapsed, setCollapsed] = useState(false);
  const open = section.enabled && !collapsed;
  return (
    <section className={cx("rounded-2xl border bg-white transition", section.enabled ? "border-transparent shadow-[0_1px_2px_rgba(18,18,18,0.04)]" : "border-dashed border-line bg-white/40")}>
      <header className="flex items-center gap-2 px-4 py-3">
        <button type="button" onClick={() => section.enabled && setCollapsed((v) => !v)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open}>
          <ChevronDown className={cx("h-4 w-4 shrink-0 text-mute transition-transform", !open && "-rotate-90")} />
          <span className={cx("text-sm font-bold", section.enabled ? "text-ink" : "text-mute")}>{section.type === "custom" ? section.title || info.label : info.label}</span>
          {!section.enabled ? <span className="rounded-full bg-panel px-2 py-0.5 text-[11px] text-mute">Hidden from PDF</span> : !open && summary ? <span className="truncate text-[13px] text-mute">— {summary}</span> : null}
        </button>
        <div className="flex shrink-0 items-center">
          <IconButton label="Move up" onClick={onUp} disabled={first}><ArrowUp className="h-4 w-4" /></IconButton>
          <IconButton label="Move down" onClick={onDown} disabled={last}><ArrowDown className="h-4 w-4" /></IconButton>
          <IconButton label={section.enabled ? "Hide from PDF" : "Show in PDF"} onClick={onToggle} className={section.enabled ? "" : "text-signal"}>
            {section.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </IconButton>
          {onRemove ? <ConfirmDelete iconOnly label="Delete section" onConfirm={onRemove} /> : null}
        </div>
      </header>
      {open ? (
        <div className="border-t border-line-2 px-4 py-4">
          {children}
          <div className="mt-4 flex items-center justify-end gap-2 border-t border-line-2 pt-3">
            <span className="text-[11px] text-mute">{saveState === "saved" ? "All changes saved" : saveState === "error" ? "Not saved — check connection" : saveState === "saving" ? "" : "Saves automatically, or press Save"}</span>
            <SaveButton state={saveState} onSave={onSave} compact />
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* ================================================================ title */

const TITLE_SUGGESTIONS: Record<DocType, string[]> = {
  quotation: ["QUOTATION", "PRICE QUOTATION", "ESTIMATE", "PROFORMA INVOICE"],
  invoice: ["INVOICE", "TAX INVOICE", "PROFORMA INVOICE", "RECEIPT"],
  letter: [],
};

/* The document title (QUOTATION, INVOICE…): wording, capitals and position. */
function TitleEditor({ doc, update, compact }: { doc: DocData; update: (p: Partial<DocData>) => void; compact?: boolean }) {
  const caps = doc.titleCaps !== false;
  const hasTable = doc.type !== "letter";
  return (
    <div className="space-y-2.5">
      <Field label={compact ? "Title above the table" : "Title on the document"} hint="Type any title, or leave empty to hide it">
        {(id) => <Input id={id} value={doc.title} placeholder="e.g. QUOTATION" onChange={(e) => update({ title: e.target.value })} />}
      </Field>
      {TITLE_SUGGESTIONS[doc.type].length ? (
        <div className="flex flex-wrap gap-1.5">
          {TITLE_SUGGESTIONS[doc.type].map((t) => (
            <button key={t} type="button" onClick={() => update({ title: t })} aria-pressed={doc.title === t} className={cx("h-7 rounded-full border px-2.5 text-[12px]", doc.title === t ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink/30")}>
              {t}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-end gap-4">
        <Segmented label="Letters" value={caps ? "caps" : "typed"} options={[["caps", "ALL CAPITALS"], ["typed", "As typed"]]} onChange={(v) => update({ titleCaps: v === "caps" })} />
        {hasTable ? (
          <Segmented
            label="Where it prints"
            value={doc.titlePlace === "top" ? "top" : "table"}
            options={[["table", "Above the table"], ["top", "At the top, under the date"]]}
            onChange={(v) => update({ titlePlace: v as "table" | "top" })}
          />
        ) : null}
      </div>
    </div>
  );
}

/* ================================================================ text */

/* Font size and weight, set inside the document. The preview shows each change. */
function TextPanel({ doc, update, open, setOpen }: { doc: DocData; update: (p: Partial<DocData>) => void; open: boolean; setOpen: (v: boolean) => void }) {
  const { settings, setSettings, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const layout = settings.brand.layout || "simple";
  const primary = settings.brand.primary || "#3F3F3F";
  const base = withColors(resolveText(layout, settings.brand.text), primary);
  const cur = applyOverrides(base, doc.text);
  const same = (a: TextStyle, b: TextStyle) => a.size === b.size && a.weight === b.weight && (a.color || "").toLowerCase() === (b.color || "").toLowerCase();
  const changed = TEXT_ROLES.filter(({ role }) => !same(cur[role], base[role])).length;
  const word = TYPE_LABEL[doc.type].toLowerCase();

  /* Save these sizes as the starting point for every document. */
  const makeDefault = async () => {
    setBusy(true);
    try {
      const plain = withColors(layoutDefaults(layout), primary);
      const text: TextOverrides = {};
      for (const { role } of TEXT_ROLES) {
        const c = cur[role];
        if (same(c, plain[role])) text[role] = null;
        else text[role] = { size: c.size, weight: c.weight, ...(c.color && c.color.toLowerCase() !== (plain[role].color || "").toLowerCase() ? { color: c.color } : {}) };
      }
      const res = await backend().saveSettings({ brand: { ...settings.brand, text } });
      setSettings(res.settings, res.counters);
      update({ text: undefined });
      toast("Saved. All documents now use these text sizes.");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="text-panel" className="scroll-mt-4 rounded-2xl border border-transparent bg-white shadow-[0_1px_2px_rgba(18,18,18,0.04)]">
      <header className="flex items-center gap-2 px-4 py-3">
        <button type="button" onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open}>
          <ChevronDown className={cx("h-4 w-4 shrink-0 text-mute transition-transform", !open && "-rotate-90")} />
          <Type className="h-4 w-4 shrink-0 text-ink" />
          <span className="text-sm font-bold text-ink">Text size, bold & colour</span>
          {!open ? <span className="truncate text-[13px] text-mute">— {changed ? `${changed} part${changed > 1 ? "s" : ""} changed` : "standard sizes"}</span> : null}
        </button>
      </header>
      {open ? (
        <div className="border-t border-line-2 px-4 py-4">
          <TextControls base={base} font={settings.brand.font || "Source Sans 3"} value={doc.text} onChange={(text) => update({ text })} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-mute">Changes apply to this {word}. Watch the preview as you go.</p>
            <Button size="sm" variant="ghost" loading={busy} disabled={!changed} onClick={makeDefault} title="New and existing documents without their own text sizes will use these">
              Use for all documents
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* ================================================================ headings */

/* Show / hide (and reword) the heading a section prints. */
function HeadingControl({ section, docType, onChange }: { section: Section; docType: DocType; onChange: (p: Partial<Section>) => void }) {
  const { settings } = useApp();
  const simple = (settings.brand.layout || "simple") === "simple";
  let def = defaultHeading(section.type, docType);
  if (def === null) return null;
  // The simple layout prints no heading here unless you type one.
  if (simple && (section.type === "recipient" || section.type === "subject")) def = "No heading — type one to add it";
  const shown = !section.hideHeading;

  if (section.type === "items" || section.type === "custom") {
    return (
      <div className="mb-4 rounded-xl bg-panel px-3 py-2.5">
        <Toggle
          checked={shown}
          onChange={(v) => onChange({ hideHeading: !v })}
          label={section.type === "items" ? "Column headings" : "Heading"}
          description={section.type === "items" ? "The header row of the table (No., Description, Qty…). Rename columns under Columns & alignment." : "Prints the heading below above the text."}
        />
      </div>
    );
  }

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-xl bg-panel px-3 py-2.5 sm:flex-row sm:items-center">
      <Toggle checked={shown} onChange={(v) => onChange({ hideHeading: !v })} label="Heading" />
      <Input
        value={section.heading ?? ""}
        placeholder={def}
        disabled={!shown}
        onChange={(e) => onChange({ heading: e.target.value })}
        className="h-9 sm:max-w-xs"
        aria-label="Heading text"
      />
      <span className="text-xs text-mute">{shown ? "Leave empty to use the standard wording." : "No heading on the PDF."}</span>
    </div>
  );
}

/* ================================================================ section editors */

interface BodyProps {
  section: Section;
  doc: DocData;
  update: (p: Partial<DocData> | ((d: DocData) => Partial<DocData>)) => void;
  patchSection: (p: Partial<Section>) => void;
  customers: (Customer & { id: string })[];
  setCustomers: (c: (Customer & { id: string })[]) => void;
  catalog: CatalogItem[];
  setCatalog: (c: CatalogItem[]) => void;
  totals: ReturnType<typeof computeTotals>;
}

function SectionBody(p: BodyProps) {
  const { section, doc, update } = p;
  const { settings } = useApp();
  const t: SectionType = section.type;

  if (t === "acceptance") {
    return <p className="text-sm text-mute">Prints boxes for the customer to sign, write their name and date when they accept.</p>;
  }

  if (t === "letterhead" || t === "bank" || t === "footer") {
    const c = settings.company;
    const b = settings.bank;
    const text =
      t === "letterhead"
        ? `${c.name} · ${c.tagline} · ${[c.addressLine1, c.addressLine2].join(" ")} · ${c.phone} · ${c.mobile}`
        : t === "bank"
          ? [b.accountName, b.bankName, b.branch, b.accountNo].filter(Boolean).join(" · ") || "No bank details yet."
          : `“If you have any questions, please contact ${settings.signatory.name}, ${c.phone || c.mobile}, ${c.email}”`;
    return (
      <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-mute">{text}</p>
        <Link to="/settings" className="shrink-0 rounded-full border border-line px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-ink hover:text-white">Edit in Settings</Link>
      </div>
    );
  }

  if (t === "details") {
    const dueLabel = doc.type === "quotation" ? "Valid until" : doc.type === "invoice" ? "Due date" : "";
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:order-last sm:col-span-2"><TitleEditor doc={doc} update={update} /></div>
        <Field label={`${TYPE_LABEL[doc.type]} number`} hint={doc.number ? undefined : "Given automatically when first saved"}>{(id) => <Input id={id} value={doc.number} placeholder="Automatic" onChange={(e) => update({ number: e.target.value })} />}</Field>
        <Field label="Date">{(id) => <Input id={id} type="date" value={doc.issueDate} onChange={(e) => update({ issueDate: e.target.value })} />}</Field>
        {dueLabel ? <Field label={dueLabel} optional>{(id) => <Input id={id} type="date" value={doc.dueDate} onChange={(e) => update({ dueDate: e.target.value })} />}</Field> : null}
        <Field label="Reference" optional hint="PO number, tender or quotation number" className="sm:col-span-2">{(id) => <Input id={id} value={doc.reference} onChange={(e) => update({ reference: e.target.value })} />}</Field>
      </div>
    );
  }

  if (t === "recipient") return <CustomerEditor {...p} />;

  if (t === "salutation") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <RichInput value={doc.salutation} onChange={(v) => update({ salutation: v })} className="max-w-xs" ariaLabel="Salutation" />
        {["Dear Sir,", "Dear Madam,", "Dear Sir / Madam,", "Sir,"].map((x) => (
          <button key={x} type="button" onClick={() => update({ salutation: x })} className="h-8 rounded-full border border-line px-3 text-[13px] hover:border-navy/50">{x}</button>
        ))}
      </div>
    );
  }

  if (t === "subject") {
    return <RichInput value={doc.subject} onChange={(v) => update({ subject: v })} placeholder={doc.type === "letter" ? "Subject of the letter" : "Supply and installation of surge power points and network points"} ariaLabel="Description of work" />;
  }

  if (t === "intro") {
    return <RichInput multiline minRows={3} value={doc.intro} onChange={(v) => update({ intro: v })} placeholder={doc.type === "letter" ? "Write the letter here…" : "Scope, location, timing — printed inside the Description of Work box"} ariaLabel={doc.type === "letter" ? "Letter text" : "Work details"} />;
  }

  if (t === "items") return <ItemsEditor {...p} />;
  if (t === "totals") return <TotalsEditor {...p} />;

  if (t === "words") {
    const amt = doc.type === "invoice" && p.totals.paid > 0 ? p.totals.balance : p.totals.total;
    return <p className="text-sm italic text-mute">{amt > 0 ? amountInWords(amt) : "Shown once there is a total."}</p>;
  }

  if (t === "notes") return <NotesEditor {...p} />;

  if (t === "custom") {
    return (
      <div className="space-y-3">
        <Field label="Heading" optional>{(id) => <Input id={id} value={section.title || ""} onChange={(e) => p.patchSection({ title: e.target.value })} placeholder="e.g. Scope of work, Warranty, Delivery" />}</Field>
        <Field label="Text">{() => <RichInput multiline minRows={4} value={section.text || ""} onChange={(v) => p.patchSection({ text: v })} ariaLabel="Section text" />}</Field>
      </div>
    );
  }

  if (t === "closing") {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Closing lines" className="sm:col-span-2">{() => <RichInput multiline minRows={2} value={doc.closing} onChange={(v) => update({ closing: v })} ariaLabel="Closing lines" />}</Field>
        <Field label="Signatory name">{(id) => <Input id={id} value={doc.signatoryName} onChange={(e) => update({ signatoryName: e.target.value })} />}</Field>
        <Field label="Title / qualification" optional>{(id) => <Input id={id} value={doc.signatoryTitle} onChange={(e) => update({ signatoryTitle: e.target.value })} />}</Field>
        <div className="sm:col-span-2"><Toggle checked={doc.showSignatureLine} onChange={(v) => update({ showSignatureLine: v })} label="Signature line" description="A line to sign above the name." /></div>
      </div>
    );
  }
  return null;
}

/* ---------------------------------------------------------------- customer */
function CustomerEditor({ doc, update, customers, setCustomers }: BodyProps) {
  const { toast } = useApp();
  const c = doc.customer;
  const set = (patch: Partial<Customer>) => update((d) => ({ customer: { ...d.customer, ...patch } }));
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => customers.filter((x) => !q || x.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8), [customers, q]);
  const saved = c.id && customers.some((x) => x.id === c.id);

  const saveCustomer = async () => {
    try {
      const row = await backend().saveCustomer({ ...c, id: saved ? c.id : undefined });
      set({ id: row.id });
      setCustomers([...customers.filter((x) => x.id !== row.id), row].sort((a, b) => a.name.localeCompare(b.name)));
      toast(saved ? "Customer updated." : "Customer saved for next time.");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <div className="space-y-4">
      {customers.length ? (
        <div className="relative">
          <Input placeholder="Pick a saved customer…" value={q} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} aria-label="Search saved customers" />
          {open && matches.length ? (
            <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-white py-1 shadow-xl">
              {matches.map((m) => (
                <li key={m.id}>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { update({ customer: { ...emptyCustomer(), ...m } }); setQ(""); setOpen(false); }} className="block w-full px-3 py-2 text-left hover:bg-panel">
                    <span className="block text-sm font-medium text-ink">{m.name}</span>
                    <span className="block text-xs text-mute">{[m.line1, m.line2, m.phone].filter(Boolean).join(" · ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name or business" className="sm:col-span-2">{(id) => <Input id={id} value={c.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. The Manager / Kopay Hospital" />}</Field>
        <Field label="Attention" optional>{(id) => <Input id={id} value={c.attention} onChange={(e) => set({ attention: e.target.value })} placeholder="Contact person" />}</Field>
        <Field label="Address line 1" optional>{(id) => <Input id={id} value={c.line1} onChange={(e) => set({ line1: e.target.value })} placeholder="Area" />}</Field>
        <Field label="Address line 2" optional>{(id) => <Input id={id} value={c.line2} onChange={(e) => set({ line2: e.target.value })} placeholder="Town" />}</Field>
        <Field label="Address line 3" optional>{(id) => <Input id={id} value={c.line3} onChange={(e) => set({ line3: e.target.value })} placeholder="District" />}</Field>
        <Field label="Phone" optional>{(id) => <Input id={id} type="tel" value={c.phone} onChange={(e) => set({ phone: e.target.value })} />}</Field>
        <Field label="Email" optional>{(id) => <Input id={id} type="email" value={c.email} onChange={(e) => set({ email: e.target.value })} />}</Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<UserPlus className="h-4 w-4" />} onClick={saveCustomer} disabled={!c.name.trim()}>
          {saved ? "Update saved customer" : "Save to customers"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => update({ customer: emptyCustomer() })}>Clear</Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- items */
function ItemsEditor({ doc, update, catalog, setCatalog }: BodyProps) {
  const { settings, toast } = useApp();
  const [showCols, setShowCols] = useState(false);
  const [picker, setPicker] = useState(false);
  const cols = doc.columns;
  const units = settings.defaults.units;

  const setItems = (fn: (items: LineItem[]) => LineItem[]) => update((d) => ({ items: fn(d.items) }));
  const patch = (iid: string, p: Partial<LineItem>) => setItems((items) => items.map((x) => (x.id === iid ? { ...x, ...p } : x)));
  const move = (idx: number, dir: -1 | 1) =>
    setItems((items) => {
      const next = [...items];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return items;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  const addFromCatalog = (rows: CatalogItem[]) => {
    setItems((items) => [...items.filter((x) => x.kind === "heading" || x.description.trim() || x.qty != null || x.rate != null), ...rows.map((r) => ({ ...emptyItem(r.unit), description: r.description, rate: r.rate, qty: 1 }))]);
    setPicker(false);
  };
  const saveToCatalog = async (it: LineItem) => {
    try {
      const row = await backend().saveCatalog({ description: plainText(it.description), unit: it.unit, rate: it.rate });
      setCatalog([...catalog, row]);
      toast("Saved to Items & rates.");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  let n = 0;
  return (
    <div className="space-y-3">
      {doc.titlePlace !== "top" ? <div className="rounded-2xl bg-panel p-3"><TitleEditor doc={doc} update={update} compact /></div> : null}
      <div className="space-y-2">
        {doc.items.length === 0 ? <p className="text-sm text-mute">No rows yet.</p> : null}
        {doc.items.map((it, idx) => {
          if (it.kind === "heading") {
            return (
              <div key={it.id} className="flex items-center gap-2 rounded-xl bg-panel px-2 py-1.5">
                <Heading className="h-4 w-4 shrink-0 text-signal" />
                <RichInput value={it.description} onChange={(v) => patch(it.id, { description: v })} placeholder="Group heading, e.g. Electrical works" className="min-w-0 flex-1" textClassName="min-h-9 py-1.5 font-semibold" ariaLabel="Group heading" />
                <RowActions idx={idx} count={doc.items.length} onMove={move} onCopy={() => setItems((items) => [...items.slice(0, idx + 1), { ...it, id: uid() }, ...items.slice(idx + 1)])} onDelete={() => setItems((items) => items.filter((x) => x.id !== it.id))} />
              </div>
            );
          }
          n += 1;
          const amount = lineAmount(it, cols.discount);
          return (
            <div key={it.id} className="rounded-xl border border-line p-2.5">
              <div className="flex items-start gap-2">
                <span className="mt-2 w-5 shrink-0 text-center text-xs font-medium text-mute">{n}</span>
                <DescriptionInput value={it.description} catalog={catalog} onChange={(v) => patch(it.id, { description: v })} onPick={(c) => patch(it.id, { description: c.description, unit: c.unit || it.unit, rate: c.rate ?? it.rate, qty: it.qty ?? 1 })} />
                <RowActions
                  idx={idx}
                  count={doc.items.length}
                  onMove={move}
                  onCopy={() => setItems((items) => [...items.slice(0, idx + 1), { ...it, id: uid() }, ...items.slice(idx + 1)])}
                  onDelete={() => setItems((items) => items.filter((x) => x.id !== it.id))}
                  onBookmark={plainText(it.description).trim() ? () => saveToCatalog(it) : undefined}
                />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 pl-7 sm:grid-cols-[repeat(auto-fit,minmax(88px,1fr))]">
                {cols.unit ? (
                  <label className="text-[11px] text-mute">{doc.labels.unit}
                    <Input list="units" value={it.unit} onChange={(e) => patch(it.id, { unit: e.target.value })} className="mt-0.5 h-9" />
                  </label>
                ) : null}
                {cols.qty ? (
                  <label className="text-[11px] text-mute">{doc.labels.qty}
                    <NumberInput value={it.qty} onChange={(v) => patch(it.id, { qty: v })} className="mt-0.5 h-9 text-right" placeholder="0" />
                  </label>
                ) : null}
                {cols.rate ? (
                  <label className="text-[11px] text-mute">{doc.labels.rate}
                    <NumberInput value={it.rate} onChange={(v) => patch(it.id, { rate: v })} className="mt-0.5 h-9 text-right" placeholder="0.00" />
                  </label>
                ) : null}
                {cols.discount ? (
                  <label className="text-[11px] text-mute">{doc.labels.discount}
                    <NumberInput value={it.discount} onChange={(v) => patch(it.id, { discount: v })} className="mt-0.5 h-9 text-right" placeholder="0.00" />
                  </label>
                ) : null}
                <div className="text-[11px] text-mute">{doc.labels.amount}
                  <div className="mt-0.5 flex h-9 items-center justify-end rounded-xl bg-panel px-3 text-sm font-semibold tabular-nums text-ink">{amount != null ? money(amount) : "—"}</div>
                </div>
              </div>
            </div>
          );
        })}
        <datalist id="units">{units.map((u) => <option key={u} value={u} />)}</datalist>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setItems((items) => [...items, emptyItem(units[0])])}>Add item</Button>
        <Button size="sm" icon={<Heading className="h-4 w-4" />} onClick={() => setItems((items) => [...items, headingRow()])}>Add group heading</Button>
        <Button size="sm" icon={<ListPlus className="h-4 w-4" />} onClick={() => setPicker(true)} disabled={!catalog.length} title={catalog.length ? "" : "Save items to Items & rates first"}>From saved items</Button>
        <Button size="sm" variant="ghost" icon={<Columns3 className="h-4 w-4" />} onClick={() => setShowCols((v) => !v)} aria-expanded={showCols}>Columns & alignment</Button>
      </div>

      {showCols ? (
        <div className="rounded-2xl bg-panel p-3">
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Segmented
              label="In each row"
              value={doc.align.vertical}
              options={[["top", "Top"], ["middle", "Middle"]]}
              onChange={(v) => update((d) => ({ align: { ...d.align, vertical: v as "top" | "middle" } }))}
              hint="Where values sit when a description wraps"
            />
            <Segmented
              label="Description"
              value={doc.align.text}
              options={[["left", "Left"], ["center", "Centre"]]}
              onChange={(v) => update((d) => ({ align: { ...d.align, text: v as "left" | "center" } }))}
            />
            <Segmented
              label="Qty, price & amount"
              value={doc.align.numbers}
              options={[["left", "Left"], ["center", "Centre"], ["right", "Right"]]}
              onChange={(v) => update((d) => ({ align: { ...d.align, numbers: v as "left" | "center" | "right" } }))}
            />
          </div>
          <p className="mb-3 text-xs text-mute">Choose which columns appear in the table and rename the headings.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(["description", "unit", "qty", "rate", "discount", "amount"] as const).map((k) => {
              const toggleable = k === "unit" || k === "qty" || k === "rate" || k === "discount";
              return (
                <div key={k} className="flex items-center gap-2">
                  {toggleable ? (
                    <input type="checkbox" className="h-4 w-4 accent-[#2F6BFF]" checked={cols[k]} onChange={(e) => update((d) => ({ columns: { ...d.columns, [k]: e.target.checked } }))} aria-label={`Show ${k} column`} />
                  ) : (
                    <span className="h-4 w-4" />
                  )}
                  <Input value={doc.labels[k]} onChange={(e) => update((d) => ({ labels: { ...d.labels, [k]: e.target.value } }))} className="h-9" aria-label={`${k} column heading`} />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {picker ? <CatalogPicker catalog={catalog} onClose={() => setPicker(false)} onAdd={addFromCatalog} /> : null}
    </div>
  );
}

function Segmented({ label, value, options, onChange, hint }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void; hint?: string }) {
  return (
    <div>
      <p className="mb-1.5 text-[12px] font-semibold text-ink">{label}</p>
      <div className="inline-flex rounded-full border border-line bg-white p-0.5" role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={cx("h-7 rounded-full px-3 text-[12px] font-semibold", value === v ? "bg-ink text-white" : "text-ink hover:bg-panel")}>
            {l}
          </button>
        ))}
      </div>
      {hint ? <p className="mt-1 text-[11px] text-mute">{hint}</p> : null}
    </div>
  );
}

function RowActions({ idx, count, onMove, onCopy, onDelete, onBookmark }: { idx: number; count: number; onMove: (i: number, d: -1 | 1) => void; onCopy: () => void; onDelete: () => void; onBookmark?: () => void }) {
  return (
    <div className="flex shrink-0 items-center">
      <IconButton label="Move up" onClick={() => onMove(idx, -1)} disabled={idx === 0}><ArrowUp className="h-3.5 w-3.5" /></IconButton>
      <IconButton label="Move down" onClick={() => onMove(idx, 1)} disabled={idx === count - 1}><ArrowDown className="h-3.5 w-3.5" /></IconButton>
      <IconButton label="Duplicate row" onClick={onCopy} className="hidden sm:inline-flex"><Copy className="h-3.5 w-3.5" /></IconButton>
      {onBookmark ? <IconButton label="Save to Items & rates" onClick={onBookmark} className="hidden sm:inline-flex"><BookmarkPlus className="h-3.5 w-3.5" /></IconButton> : null}
      <IconButton label="Delete row" onClick={onDelete} className="hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></IconButton>
    </div>
  );
}

function DescriptionInput({ value, onChange, onPick, catalog }: { value: string; onChange: (v: string) => void; onPick: (c: CatalogItem) => void; catalog: CatalogItem[] }) {
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const q = plainText(value).trim().toLowerCase();
    if (q.length < 2) return [];
    return catalog.filter((c) => c.description.toLowerCase().includes(q) && c.description.toLowerCase() !== q).slice(0, 6);
  }, [value, catalog]);
  return (
    <div className="relative min-w-0 flex-1">
      <RichInput multiline value={value} onChange={onChange} onTyping={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} placeholder="Item description" ariaLabel="Item description" textClassName="min-h-9 py-1.5" />
      {open && matches.length ? (
        <ul className="absolute z-20 mt-1 w-full rounded-lg border border-line bg-white py-1 shadow-xl">
          {matches.map((m) => (
            <li key={m.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(m); setOpen(false); }} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-panel">
                <span className="min-w-0 truncate">{m.description}</span>
                <span className="shrink-0 text-xs tabular-nums text-mute">{m.unit} {m.rate != null ? money(m.rate) : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CatalogPicker({ catalog, onClose, onAdd }: { catalog: CatalogItem[]; onClose: () => void; onAdd: (rows: CatalogItem[]) => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const rows = catalog.filter((c) => !q || `${c.description} ${c.category || ""}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal
      title="Add saved items"
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!sel.size} onClick={() => onAdd(catalog.filter((c) => sel.has(c.id)))}>Add {sel.size || ""} item{sel.size === 1 ? "" : "s"}</Button>
        </>
      }
    >
      <Input placeholder="Search items" value={q} onChange={(e) => setQ(e.target.value)} className="mb-3" autoFocus aria-label="Search items" />
      <ul className="divide-y divide-line-2">
        {rows.map((c) => (
          <li key={c.id}>
            <label className="flex cursor-pointer items-center gap-3 py-2.5">
              <input type="checkbox" className="h-4 w-4 accent-[#2F6BFF]" checked={sel.has(c.id)} onChange={(e) => { const next = new Set(sel); if (e.target.checked) next.add(c.id); else next.delete(c.id); setSel(next); }} />
              <span className="min-w-0 flex-1 text-sm text-ink">{c.description}</span>
              <span className="shrink-0 text-xs tabular-nums text-mute">{c.unit} {c.rate != null ? money(c.rate) : ""}</span>
            </label>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/* ---------------------------------------------------------------- totals */
function TotalsEditor({ doc, update, totals }: BodyProps) {
  const { settings } = useApp();
  const cur = settings.defaults.currency;
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_240px]">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Discount on the total">
          {(id) => (
            <div className="flex gap-2">
              <NumberInput id={id} value={doc.discount.value || null} onChange={(v) => update((d) => ({ discount: { ...d.discount, value: v || 0 } }))} placeholder="0" className="text-right" />
              <Select value={doc.discount.mode} onChange={(e) => update((d) => ({ discount: { ...d.discount, mode: e.target.value as "amount" | "percent" } }))} className="w-24" aria-label="Discount type">
                <option value="amount">{cur}</option>
                <option value="percent">%</option>
              </Select>
            </div>
          )}
        </Field>
        <Field label="Tax">
          {(id) => (
            <div className="flex gap-2">
              <Input id={id} value={doc.tax.label} onChange={(e) => update((d) => ({ tax: { ...d.tax, label: e.target.value } }))} className="w-24" aria-label="Tax name" />
              <NumberInput value={doc.tax.percent || null} onChange={(v) => update((d) => ({ tax: { ...d.tax, percent: v || 0 } }))} placeholder="0" className="text-right" aria-label="Tax percent" />
              <span className="flex items-center text-sm text-mute">%</span>
            </div>
          )}
        </Field>
        {doc.type === "invoice" ? (
          <Field label="Payments received" hint="Shows a Paid line and the balance due">
            {(id) => <NumberInput id={id} value={doc.paid || null} onChange={(v) => update({ paid: v || 0 })} placeholder="0.00" className="text-right" />}
          </Field>
        ) : null}
        <Field label="Total label">{(id) => <Input id={id} value={doc.grandTotalLabel} onChange={(e) => update({ grandTotalLabel: e.target.value })} />}</Field>
        <Field label="Note beside the totals" optional className="sm:col-span-2">{() => <RichInput value={doc.thankYouNote} onChange={(v) => update({ thankYouNote: v })} ariaLabel="Note beside the totals" />}</Field>
      </div>
      <dl className="space-y-1.5 rounded-2xl bg-ink p-4 text-sm text-white [&_dt]:text-white/60">
        <Row l="Subtotal" v={money(totals.subtotal)} />
        {totals.discount ? <Row l="Discount" v={`- ${money(totals.discount)}`} /> : null}
        {totals.tax ? <Row l={`${doc.tax.label} ${doc.tax.percent}%`} v={money(totals.tax)} /> : null}
        <div className="!mt-2 border-t border-white/15 pt-2"><Row l={doc.grandTotalLabel || "Total"} v={`${cur} ${money(totals.total)}`} strong /></div>
        {totals.paid ? (
          <>
            <Row l="Paid" v={`- ${money(totals.paid)}`} />
            <Row l="Balance due" v={`${cur} ${money(totals.balance)}`} strong />
          </>
        ) : null}
      </dl>
    </div>
  );
}

function Row({ l, v, strong }: { l: string; v: string; strong?: boolean }) {
  return (
    <div className={cx("flex justify-between gap-3", strong && "font-bold")}>
      <dt className={strong ? "" : "text-mute"}>{l}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}

/* ---------------------------------------------------------------- notes */
function NotesEditor({ doc, update }: BodyProps) {
  const { settings } = useApp();
  const setNotes = (fn: (n: string[]) => string[]) => update((d) => ({ notes: fn(d.notes) }));
  const defaults = doc.type === "invoice" ? settings.defaults.invoiceTerms : settings.defaults.quotationTerms;
  return (
    <div className="space-y-3">
      <Field label="Heading">{(id) => <Input id={id} value={doc.notesTitle} onChange={(e) => update({ notesTitle: e.target.value })} placeholder="Terms & conditions" />}</Field>
      <ol className="space-y-2">
        {doc.notes.map((note, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-2.5 w-5 shrink-0 text-right text-xs text-mute">{i + 1}.</span>
            <RichInput multiline value={note} onChange={(v) => setNotes((n) => n.map((x, j) => (j === i ? v : x)))} className="min-w-0 flex-1" textClassName="min-h-9 py-1.5" ariaLabel={`Note ${i + 1}`} />
            <div className="flex shrink-0">
              <IconButton label="Move up" disabled={i === 0} onClick={() => setNotes((n) => { const x = [...n]; [x[i - 1], x[i]] = [x[i], x[i - 1]]; return x; })}><ArrowUp className="h-3.5 w-3.5" /></IconButton>
              <IconButton label="Delete line" onClick={() => setNotes((n) => n.filter((_, j) => j !== i))} className="hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></IconButton>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setNotes((n) => [...n, ""])}>Add line</Button>
        <Button size="sm" variant="ghost" icon={<PenLine className="h-4 w-4" />} onClick={() => setNotes(() => [...defaults])}>Use default terms</Button>
      </div>
    </div>
  );
}

