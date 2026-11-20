/* Size and weight for each part of the printed document. */
import { Minus, Plus, RotateCcw } from "lucide-react";
import { CASES, SIZE_MAX, SIZE_MIN, TEXT_ROLES, WEIGHTS, applyOverrides, clampSize, type TextCase, type TextOverrides, type TextRole, type TextStyle } from "../lib/typography";
import { cx } from "./ui";

/* base: the sizes this document starts from. value: its own changes. */
/* Keep a colour only when it differs from the default, so default colours
   still follow the brand colour if that changes later. */
const slim = (st: TextStyle, b: TextStyle): TextStyle => {
  const { color, case: c, ...rest } = st;
  return {
    ...rest,
    ...(color && color.toLowerCase() !== (b.color || "").toLowerCase() ? { color } : {}),
    ...(c ? { case: c } : {}),
  };
};

export function TextControls({ base, font, value, onChange }: { base: Record<TextRole, TextStyle>; font: string; value: TextOverrides | undefined; onChange: (v: TextOverrides) => void }) {
  const cur = applyOverrides(base, value);
  const sameStyle = (a: TextStyle, b: TextStyle) => a.size === b.size && a.weight === b.weight && (a.color || "").toLowerCase() === (b.color || "").toLowerCase() && (a.case || "") === (b.case || "");
  const changed = (r: TextRole) => !sameStyle(cur[r], base[r]);
  const anyChanged = TEXT_ROLES.some(({ role }) => changed(role));

  const put = (r: TextRole, patch: Partial<TextStyle>) => {
    const next: TextStyle = { ...cur[r], ...patch, size: clampSize(patch.size ?? cur[r].size) };
    const same = sameStyle(next, base[r]);
    // null (not a missing key) so a saved change is cleared on the server too.
    onChange({ ...(value || {}), [r]: same ? null : slim(next, base[r]) });
  };
  const scaleAll = (f: number) => {
    const next: TextOverrides = { ...(value || {}) };
    for (const { role } of TEXT_ROLES) {
      const size = clampSize(cur[role].size * f);
      const st = { ...cur[role], size };
      next[role] = sameStyle(st, base[role]) ? null : slim(st, base[role]);
    }
    onChange(next);
  };
  const resetAll = () => onChange(Object.fromEntries(TEXT_ROLES.map(({ role }) => [role, null])) as TextOverrides);
  const family = font === "Helvetica" ? "Helvetica, Arial, sans-serif" : `"${font}", sans-serif`;
  const cssWeight = { light: 300, regular: 400, semibold: font === "IBM Plex Sans" ? 500 : 600, bold: 700 } as const;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => scaleAll(1 / 1.08)} className="h-8 rounded-full border border-line px-3 text-[12px] font-semibold text-ink hover:border-ink/30">All smaller</button>
          <button type="button" onClick={() => scaleAll(1.08)} className="h-8 rounded-full border border-line px-3 text-[12px] font-semibold text-ink hover:border-ink/30">All larger</button>
          <button type="button" onClick={resetAll} disabled={!anyChanged} className="inline-flex h-8 items-center gap-1 rounded-full border border-line px-3 text-[12px] font-semibold text-ink hover:border-ink/30 disabled:opacity-40">
            <RotateCcw className="h-3.5 w-3.5" /> Reset all
          </button>
        </div>
      </div>
      <p className="mb-3 text-xs text-mute">Sizes are in points (pt). Aa sets the letters (ABC all caps, abc all small, Abc mixed). Click a colour circle to change that part's colour. Body text size and colour also apply to the small print that has no setting of its own.{font === "Helvetica" ? " Helvetica has no light or semi-bold, so those print as regular and bold." : ""}</p>
      <div className="divide-y divide-line rounded-2xl border border-line">
        {TEXT_ROLES.map(({ role, label, hint }) => {
          const st = cur[role];
          return (
            <div key={role} className="flex flex-col gap-2 px-3 py-2.5 md:flex-row md:items-center md:gap-4">
              <div className="min-w-0 md:w-[24%]">
                <p className="truncate text-[13px] text-ink" style={{ fontFamily: family, fontWeight: cssWeight[st.weight] }}>
                  {label}
                  {changed(role) ? <span className="ml-2 align-middle text-[11px] font-semibold text-signal" style={{ fontFamily: "inherit" }}>Changed</span> : null}
                </p>
                <p className="truncate text-[11px] text-mute">{hint}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 md:flex-1 md:flex-nowrap md:justify-end">
                <div className="inline-flex items-center rounded-full border border-line bg-white" role="group" aria-label={`${label} size`}>
                  <button type="button" onClick={() => put(role, { size: st.size - 0.5 })} disabled={st.size <= SIZE_MIN} className="flex h-8 w-7 items-center justify-center rounded-l-full text-ink hover:bg-panel disabled:opacity-30" aria-label={`Smaller ${label.toLowerCase()}`}>
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <SizeBox value={st.size} label={label} onChange={(n) => put(role, { size: n })} />
                  <button type="button" onClick={() => put(role, { size: st.size + 0.5 })} disabled={st.size >= SIZE_MAX} className="flex h-8 w-7 items-center justify-center rounded-r-full text-ink hover:bg-panel disabled:opacity-30" aria-label={`Larger ${label.toLowerCase()}`}>
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="inline-flex rounded-full border border-line bg-white p-0.5" role="radiogroup" aria-label={`${label} weight`}>
                  {WEIGHTS.map(([w, wl]) => (
                    <button key={w} type="button" role="radio" aria-checked={st.weight === w} onClick={() => put(role, { weight: w })} className={cx("h-7 whitespace-nowrap rounded-full px-1.5 text-[12px]", st.weight === w ? "bg-ink text-white" : "text-ink hover:bg-panel")} style={{ fontWeight: cssWeight[w] }}>
                      {wl}
                    </button>
                  ))}
                </div>
                {role !== "title" ? (
                  <select
                    value={st.case || ""}
                    onChange={(e) => put(role, { case: (e.target.value || undefined) as TextCase | undefined })}
                    aria-label={`${label} letter case`}
                    title="Letter case"
                    className="h-8 w-[58px] shrink-0 cursor-pointer rounded-full border border-line bg-white px-2 text-[12px] text-ink hover:border-ink/30"
                  >
                    {CASES.map(([v, short, long]) => <option key={v} value={v} title={long}>{short}</option>)}
                  </select>
                ) : (
                  <span className="w-[58px] shrink-0 text-center text-[10px] leading-tight text-mute" title="Set the title's letters next to the title">case: by title</span>
                )}
                <label className="relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line bg-white hover:border-ink/30 focus-within:ring-4 focus-within:ring-signal/20" title={`${label} colour — click to change`}>
                  <span className="h-6 w-6 rounded-full border border-black/10" style={{ background: st.color || "#262626" }} />
                  <input
                    type="color"
                    value={(st.color || "#262626").toLowerCase()}
                    onChange={(e) => put(role, { color: e.target.value.toUpperCase() })}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    aria-label={`${label} colour`}
                  />
                </label>
                <button type="button" onClick={() => put(role, { ...base[role] })} disabled={!changed(role)} className="flex h-8 w-8 items-center justify-center rounded-full text-mute hover:bg-panel hover:text-ink disabled:invisible max-md:disabled:hidden" aria-label={`Reset ${label.toLowerCase()}`} title="Back to default">
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Typed size: commits on blur or Enter so half-typed numbers don't jump. */
function SizeBox({ value, label, onChange }: { value: number; label: string; onChange: (n: number) => void }) {
  return (
    <input
      key={value}
      defaultValue={value}
      inputMode="decimal"
      aria-label={`${label} size in points`}
      className="h-8 w-10 border-x border-line bg-transparent text-center text-[13px] tabular-nums text-ink outline-none focus:bg-panel"
      onBlur={(e) => {
        const n = parseFloat(e.target.value);
        if (Number.isFinite(n) && n !== value) onChange(n);
        else e.target.value = String(value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
