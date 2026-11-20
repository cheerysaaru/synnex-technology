/* A text box with Word-style formatting: select words, then make them bold,
   italic, underlined, coloured or a different size. The toolbar shows while
   the box is in use. Stores formatted text in the same string field. */
import { useEffect, useRef, useState } from "react";
import { Bold, Italic, RemoveFormatting, Underline } from "lucide-react";
import { htmlToRich, richToHtml } from "../lib/rich";
import { cx } from "./ui";

const COLORS = ["#262626", "#595959", "#C00000", "#E36C09", "#2E7D32", "#1F4E9E", "#2563EB", "#7030A0"];
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24];

type Props = {
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  /* Extra classes for the editable text itself, e.g. font-semibold for group headings. */
  textClassName?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  onTyping?: () => void;
  minRows?: number;
};

export function RichInput({ value, onChange, multiline = false, placeholder, ariaLabel, className, textClassName, onFocus, onBlur, onTyping, minRows = 1 }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const last = useRef<string | null>(null);
  const saved = useRef<Range | null>(null);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState({ b: false, i: false, u: false });

  // Show the stored value, unless it is what we just typed (keeps the caret still).
  useEffect(() => {
    if (!box.current || value === last.current) return;
    box.current.innerHTML = richToHtml(value);
    last.current = value;
  }, [value]);

  const emit = () => {
    if (!box.current) return;
    if (!box.current.textContent) box.current.innerHTML = "";
    const v = htmlToRich(box.current);
    last.current = v;
    if (v !== value) onChange(v);
  };

  const remember = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && box.current?.contains(sel.anchorNode)) saved.current = sel.getRangeAt(0).cloneRange();
    try {
      setActive({ b: document.queryCommandState("bold"), i: document.queryCommandState("italic"), u: document.queryCommandState("underline") });
    } catch {
      /* not supported */
    }
  };
  useEffect(() => {
    if (!focused) return;
    document.addEventListener("selectionchange", remember);
    return () => document.removeEventListener("selectionchange", remember);
  });

  const restore = () => {
    box.current?.focus();
    const sel = window.getSelection();
    if (saved.current && sel) {
      sel.removeAllRanges();
      sel.addRange(saved.current);
    }
  };

  const run = (fn: () => void) => {
    restore();
    fn();
    emit();
    remember();
  };
  const cmd = (name: string, arg?: string) => run(() => document.execCommand(name, false, arg));
  const color = (c: string) =>
    run(() => {
      document.execCommand("styleWithCSS", false, "true");
      document.execCommand("foreColor", false, c);
    });
  const size = (pt: number | null) =>
    run(() => {
      document.execCommand("styleWithCSS", false, "false");
      document.execCommand("fontSize", false, "7");
      const made: HTMLElement[] = [];
      box.current?.querySelectorAll('font[size="7"]').forEach((f) => {
        const span = document.createElement("span");
        if (pt) span.style.fontSize = `${pt}pt`;
        span.innerHTML = (f as HTMLElement).innerHTML;
        // Inner sizes would override the new one.
        span.querySelectorAll<HTMLElement>("[style]").forEach((el) => (el.style.fontSize = ""));
        f.replaceWith(span);
        made.push(span);
      });
      // Keep the same words selected so more formatting can follow.
      if (made.length) {
        const r = document.createRange();
        r.setStartBefore(made[0]);
        r.setEndAfter(made[made.length - 1]);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(r);
        saved.current = r.cloneRange();
      }
    });

  const keep = (e: React.MouseEvent) => e.preventDefault(); // keep the text selected while using the toolbar
  const btn = (on: boolean) => cx("flex h-7 w-7 items-center justify-center rounded-md", on ? "bg-ink text-white" : "text-ink hover:bg-panel");

  return (
    <div
      ref={wrap}
      className={cx("relative", className)}
      onFocus={() => {
        if (!focused) {
          setFocused(true);
          onFocus?.();
        }
      }}
      onBlur={(e) => {
        if (wrap.current?.contains(e.relatedTarget as Node)) return;
        setFocused(false);
        onBlur?.();
      }}
    >
      {focused ? (
        <div className="absolute bottom-full left-0 z-30 mb-1 flex w-max max-w-[min(640px,calc(100vw-2rem))] flex-wrap items-center gap-0.5 rounded-xl border border-line bg-white p-1 shadow-[0_4px_14px_rgba(18,18,18,0.08)]" role="toolbar" aria-label="Text formatting">
          <button type="button" onMouseDown={keep} onClick={() => cmd("bold")} className={btn(active.b)} title="Bold (Ctrl+B)" aria-label="Bold" aria-pressed={active.b}><Bold className="h-3.5 w-3.5" /></button>
          <button type="button" onMouseDown={keep} onClick={() => cmd("italic")} className={btn(active.i)} title="Italic (Ctrl+I)" aria-label="Italic" aria-pressed={active.i}><Italic className="h-3.5 w-3.5" /></button>
          <button type="button" onMouseDown={keep} onClick={() => cmd("underline")} className={btn(active.u)} title="Underline (Ctrl+U)" aria-label="Underline" aria-pressed={active.u}><Underline className="h-3.5 w-3.5" /></button>
          <span className="mx-1 h-5 w-px bg-line" />
          <select
            aria-label="Text size"
            title="Text size (pt)"
            defaultValue=""
            onMouseDown={remember}
            onChange={(e) => {
              const v = e.target.value;
              e.target.value = "";
              size(v === "auto" ? null : Number(v));
            }}
            className="h-7 cursor-pointer rounded-md border border-line bg-white px-1 text-[12px] text-ink"
          >
            <option value="" disabled>Size</option>
            <option value="auto">Normal</option>
            {SIZES.map((n) => <option key={n} value={n}>{n} pt</option>)}
          </select>
          <span className="mx-1 h-5 w-px bg-line" />
          {COLORS.map((c) => (
            <button key={c} type="button" onMouseDown={keep} onClick={() => color(c)} className="flex h-7 w-6 items-center justify-center rounded-md hover:bg-panel" title={`Colour ${c}`} aria-label={`Colour ${c}`}>
              <span className="h-4 w-4 rounded-full border border-black/10" style={{ background: c }} />
            </button>
          ))}
          <label className="relative flex h-7 cursor-pointer items-center rounded-md px-1.5 text-[12px] text-ink hover:bg-panel" title="Any colour">
            More
            <input type="color" onMouseDown={remember} onChange={(e) => color(e.target.value.toUpperCase())} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Pick any colour" />
          </label>
          <span className="mx-1 h-5 w-px bg-line" />
          <button type="button" onMouseDown={keep} onClick={() => cmd("removeFormat")} className={btn(false)} title="Clear formatting" aria-label="Clear formatting"><RemoveFormatting className="h-3.5 w-3.5" /></button>
          <span className="ml-auto hidden pr-1 text-[11px] text-mute sm:inline">Select words, then format</span>
        </div>
      ) : null}
      <div
        ref={box}
        role="textbox"
        aria-multiline={multiline}
        aria-label={ariaLabel}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={() => {
          emit();
          onTyping?.();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (multiline) {
              document.execCommand("insertLineBreak");
              emit();
            }
          }
        }}
        onKeyUp={remember}
        onMouseUp={remember}
        onPaste={(e) => {
          // Paste as plain text; format it here afterwards.
          e.preventDefault();
          const t = e.clipboardData.getData("text/plain");
          document.execCommand(multiline ? "insertText" : "insertText", false, multiline ? t : t.replace(/\s*\n\s*/g, " "));
        }}
        style={{ minHeight: multiline ? `${minRows * 1.6 + 1}rem` : undefined }}
        className={cx(
          "w-full whitespace-pre-wrap break-words rounded-2xl border border-line bg-white px-3 py-2 text-sm leading-relaxed text-ink outline-none transition focus:border-signal focus:ring-4 focus:ring-signal/10",
          "empty:before:pointer-events-none empty:before:text-mute/70 empty:before:content-[attr(data-placeholder)]",
          !multiline && "min-h-10",
          textClassName,
        )}
      />
    </div>
  );
}
