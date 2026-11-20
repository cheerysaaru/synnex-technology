import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Building2, Database, Download, Hash, Landmark, Palette, PenLine, SlidersHorizontal, Trash2, Upload } from "lucide-react";
import { PageHeader } from "../components/AppShell";
import { Button, Card, Field, Input, NumberInput, Select, Textarea, Toggle, cx } from "../components/ui";
import { backend, logout } from "../lib/api";
import { useApp } from "../lib/app";
import { todayIso } from "../lib/calc";
import type { Settings } from "../types";

const PRESETS = [
  { name: "Classic grey", primary: "#3F3F3F", accent: "#D9D9D9" },
  { name: "Business blue", primary: "#1F3A68", accent: "#DCE6F5" },
  { name: "Charcoal & sand", primary: "#2B2B2B", accent: "#ECE5D6" },
  { name: "Forest", primary: "#1E4D3A", accent: "#DDEBE2" },
  { name: "Maroon", primary: "#5B1A24", accent: "#F0DEDF" },
];

/* Shrink an uploaded logo so it stays light in every PDF. */
function fileToLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpe?g)$/.test(file.type)) return reject(new Error("Choose a PNG or JPG image."));
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 600 / img.width, 300 / img.height);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL(file.type === "image/png" ? "image/png" : "image/jpeg", 0.9));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error("That image could not be read."));
    img.src = URL.createObjectURL(file);
  });
}

export default function SettingsPage() {
  const { settings, counters, setSettings, toast, mode, reconnect } = useApp();
  const [s, setS] = useState<Settings>(settings);
  const [next, setNext] = useState<Record<string, number | null>>({});
  const [busy, setBusy] = useState(false);
  const year = todayIso().slice(0, 4);

  useEffect(() => setS(settings), [settings]);

  const keys = useMemo(() => (["quotation", "invoice", "letter"] as const).map((t) => (s.numbering.includeYear ? `${t}:${year}` : t)), [s.numbering.includeYear, year]);
  const dirty = JSON.stringify(s) !== JSON.stringify(settings) || Object.keys(next).length > 0;

  const set = <K extends keyof Settings>(group: K, patch: Partial<Settings[K]>) => setS((x) => ({ ...x, [group]: { ...x[group], ...patch } }));

  const save = async () => {
    setBusy(true);
    try {
      const c: Record<string, number> = {};
      for (const [k, v] of Object.entries(next)) if (v != null && v >= 1) c[k] = Math.floor(v) - 1;
      const res = await backend().saveSettings(s, c);
      setSettings(res.settings, res.counters);
      setNext({});
      toast("Settings saved. New documents and PDFs use them straight away.");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const exportBackup = async () => {
    const data = await backend().backup();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `synnex-backup-${todayIso()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const restoreBackup = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      const res = await backend().restore(data);
      await reconnect();
      toast(`Restored ${res.restored} records.`);
    } catch (e) {
      toast((e as Error).message || "That file could not be restored.", "error");
    }
  };

  return (
    <div>
      <PageHeader title="Settings" description="Business details, branding and defaults used on every quotation and invoice." />
      <div className="space-y-5 px-4 pb-24 sm:px-8">
        <Section icon={<Building2 className="h-4 w-4" />} title="Company & letterhead" description="Shown at the top of every document and in the footer.">
          <div className="mb-5 flex flex-col gap-4 rounded-lg bg-panel p-4 sm:flex-row sm:items-center">
            <div className="flex h-16 w-28 items-center justify-center rounded-lg border border-line bg-white">
              {s.company.logo ? <img src={s.company.logo} alt="Logo" className="max-h-14 max-w-24 object-contain" /> : <span className="text-xs text-mute">No logo</span>}
            </div>
            <div className="flex-1 text-sm text-mute">{s.company.logo ? "Your logo prints above the company name, top-left of every document." : "Documents show the company name on its own. Upload a logo to print it above the name."}</div>
            <div className="flex gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-3 text-[13px] font-medium hover:bg-panel">
                <Upload className="h-4 w-4" /> Upload logo
                <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { set("company", { logo: await fileToLogo(f) }); } catch (err) { toast((err as Error).message, "error"); } }} />
              </label>
              {s.company.logo ? <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => set("company", { logo: "" })}>Remove</Button> : null}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Company name" hint="Printed top-left on every document">{(id) => <Input id={id} value={s.company.name} onChange={(e) => set("company", { name: e.target.value })} />}</Field>
            <Field label="Tagline">{(id) => <Input id={id} value={s.company.tagline} onChange={(e) => set("company", { tagline: e.target.value })} />}</Field>
            <Field label="Address line 1">{(id) => <Input id={id} value={s.company.addressLine1} onChange={(e) => set("company", { addressLine1: e.target.value })} />}</Field>
            <Field label="Address line 2">{(id) => <Input id={id} value={s.company.addressLine2} onChange={(e) => set("company", { addressLine2: e.target.value })} />}</Field>
            <Field label="Telephone">{(id) => <Input id={id} value={s.company.phone} onChange={(e) => set("company", { phone: e.target.value })} />}</Field>
            <Field label="Mobile">{(id) => <Input id={id} value={s.company.mobile} onChange={(e) => set("company", { mobile: e.target.value })} />}</Field>
            <Field label="Email">{(id) => <Input id={id} type="email" value={s.company.email} onChange={(e) => set("company", { email: e.target.value })} />}</Field>
            <Field label="Website" optional>{(id) => <Input id={id} value={s.company.website} onChange={(e) => set("company", { website: e.target.value })} />}</Field>
            <Field label="Business registration no." optional>{(id) => <Input id={id} value={s.company.registrationNo} onChange={(e) => set("company", { registrationNo: e.target.value })} />}</Field>
          </div>
        </Section>

        <Section icon={<Palette className="h-4 w-4" />} title="Document style" description="Layout, typeface and colours used on every quotation, invoice and letter.">
          <p className="mb-2 text-[13px] font-semibold text-ink">Layout</p>
          <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Document layout">
            {[
              ["simple", "Simple", "Centred letterhead, customer, date and number line, full-grid table with numbered rows, totals list. Recommended."],
              ["boxed", "Boxed", "Company top-left, boxed number and date grid, grey heading bars and a shaded totals block."],
            ].map(([v, name, note]) => {
              const on = (s.brand.layout || "simple") === v;
              return (
                <button key={v} type="button" role="radio" aria-checked={on} onClick={() => set("brand", { layout: v })} className={cx("flex gap-3 rounded-2xl border p-3 text-left", on ? "border-signal ring-4 ring-signal/10" : "border-line hover:border-ink/30")}>
                  <LayoutThumb kind={v} />
                  <span>
                    <span className="block text-sm font-semibold text-ink">{name}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-mute">{note}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mb-2 text-[13px] font-semibold text-ink">Typeface</p>
          <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Document typeface">
            {[
              ["Source Sans 3", "Clean and modern. Recommended."],
              ["IBM Plex Sans", "Technical, engineered feel."],
              ["Helvetica", "Classic, built into every PDF reader."],
            ].map(([f, note]) => {
              const on = (s.brand.font || "Source Sans 3") === f;
              return (
                <button key={f} type="button" role="radio" aria-checked={on} onClick={() => set("brand", { font: f })} className={cx("rounded-2xl border p-3 text-left", on ? "border-signal ring-4 ring-signal/10" : "border-line hover:border-ink/30")}>
                  <span className="block text-[15px] text-ink" style={{ fontFamily: f === "Helvetica" ? "Helvetica, Arial, sans-serif" : `"${f}", sans-serif` }}>{f}</span>
                  <span className="mt-0.5 block text-xs text-mute">{note}</span>
                </button>
              );
            })}
          </div>
          <p className="mb-2 text-[13px] font-semibold text-ink">Colours</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {PRESETS.map((p) => {
              const on = p.primary.toLowerCase() === s.brand.primary.toLowerCase() && p.accent.toLowerCase() === s.brand.accent.toLowerCase();
              return (
                <button key={p.name} type="button" onClick={() => set("brand", { primary: p.primary, accent: p.accent })} aria-pressed={on} className={cx("flex items-center gap-2 rounded-full border px-3 py-2 text-[13px]", on ? "border-signal ring-4 ring-signal/10" : "border-line hover:border-ink/30")}>
                  <span className="flex"><span className="h-5 w-5 rounded-l" style={{ background: p.primary }} /><span className="h-5 w-5 rounded-r" style={{ background: p.accent }} /></span>
                  {p.name}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <ColorField label="Title & company name" value={s.brand.primary} onChange={(v) => set("brand", { primary: v })} />
            <ColorField label="Heading bars" value={s.brand.accent} onChange={(v) => set("brand", { accent: v })} />
            <div className="flex items-end pb-2"><Toggle checked={s.brand.zebra} onChange={(v) => set("brand", { zebra: v })} label="Striped table rows" /></div>
          </div>
        </Section>


        <Section icon={<PenLine className="h-4 w-4" />} title="Signature" description="Default sign-off on new documents.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Signatory name">{(id) => <Input id={id} value={s.signatory.name} onChange={(e) => set("signatory", { name: e.target.value })} />}</Field>
            <Field label="Title / qualification">{(id) => <Input id={id} value={s.signatory.title} onChange={(e) => set("signatory", { title: e.target.value })} />}</Field>
            <Field label="Closing lines" className="sm:col-span-2">{(id) => <Textarea id={id} value={s.signatory.closing} onChange={(e) => set("signatory", { closing: e.target.value })} />}</Field>
          </div>
        </Section>

        <Section icon={<Landmark className="h-4 w-4" />} title="Bank details" description="Printed on invoices so customers know where to pay.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Account name">{(id) => <Input id={id} value={s.bank.accountName} onChange={(e) => set("bank", { accountName: e.target.value })} />}</Field>
            <Field label="Account number">{(id) => <Input id={id} value={s.bank.accountNo} onChange={(e) => set("bank", { accountNo: e.target.value })} />}</Field>
            <Field label="Bank">{(id) => <Input id={id} value={s.bank.bankName} onChange={(e) => set("bank", { bankName: e.target.value })} />}</Field>
            <Field label="Branch">{(id) => <Input id={id} value={s.bank.branch} onChange={(e) => set("bank", { branch: e.target.value })} />}</Field>
          </div>
        </Section>

        <Section icon={<Hash className="h-4 w-4" />} title="Numbering" description={`Example: ${s.numbering.quotationPrefix}-${s.numbering.includeYear ? `${year}-` : ""}${"1".padStart(Number(s.numbering.padding) || 3, "0")}`}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {(["quotation", "invoice", "letter"] as const).map((t, i) => (
              <div key={t} className="space-y-3">
                <Field label={`${t[0].toUpperCase()}${t.slice(1)} prefix`}>{(id) => <Input id={id} value={(s.numbering as Record<string, unknown>)[`${t}Prefix`] as string} onChange={(e) => set("numbering", { [`${t}Prefix`]: e.target.value } as Partial<Settings["numbering"]>)} />}</Field>
                <Field label={`Next ${t} number${s.numbering.includeYear ? ` (${year})` : ""}`}>
                  {(id) => <NumberInput id={id} value={next[keys[i]] ?? (counters[keys[i]] || 0) + 1} onChange={(v) => setNext({ ...next, [keys[i]]: v })} />}
                </Field>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-6">
            <Toggle checked={s.numbering.includeYear} onChange={(v) => set("numbering", { includeYear: v })} label="Include the year" description="Numbering restarts at 1 each year" />
            <Field label="Digits" className="w-28">{(id) => <Select id={id} value={s.numbering.padding} onChange={(e) => set("numbering", { padding: Number(e.target.value) })}>{[2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</Select>}</Field>
          </div>
        </Section>

        <Section icon={<SlidersHorizontal className="h-4 w-4" />} title="Defaults" description="Starting values for new documents. Each document can still change them.">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Currency">{(id) => <Input id={id} value={s.defaults.currency} onChange={(e) => set("defaults", { currency: e.target.value })} />}</Field>
            <Field label="Tax name">{(id) => <Input id={id} value={s.defaults.taxLabel} onChange={(e) => set("defaults", { taxLabel: e.target.value })} />}</Field>
            <Field label="Tax %">{(id) => <NumberInput id={id} value={s.defaults.taxPercent} onChange={(v) => set("defaults", { taxPercent: v || 0 })} />}</Field>
            <Field label="Page size">{(id) => <Select id={id} value={s.defaults.pageSize} onChange={(e) => set("defaults", { pageSize: e.target.value })}><option value="A4">A4</option><option value="LETTER">Letter</option></Select>}</Field>
            <Field label="Quotation valid (days)">{(id) => <NumberInput id={id} value={s.defaults.quotationValidDays} onChange={(v) => set("defaults", { quotationValidDays: v || 0 })} />}</Field>
            <Field label="Invoice due (days)">{(id) => <NumberInput id={id} value={s.defaults.invoiceDueDays} onChange={(v) => set("defaults", { invoiceDueDays: v || 0 })} />}</Field>
            <Field label="Date format" className="col-span-2">{(id) => <Select id={id} value={s.defaults.dateFormat} onChange={(e) => set("defaults", { dateFormat: e.target.value })}><option value="DD/MM/YYYY">19/11/2026</option><option value="D MMM YYYY">19 Nov 2026</option><option value="YYYY-MM-DD">2026-11-19</option><option value="MM/DD/YYYY">11/19/2026</option></Select>}</Field>
            <Field label="Units" hint="Comma separated" className="col-span-2 sm:col-span-4">{(id) => <Input id={id} value={s.defaults.units.join(", ")} onChange={(e) => set("defaults", { units: e.target.value.split(",").map((u) => u.trim()).filter(Boolean) })} />}</Field>
            <Field label="Default quotation terms" hint="One per line" className="col-span-2">{(id) => <Textarea id={id} rows={5} value={s.defaults.quotationTerms.join("\n")} onChange={(e) => set("defaults", { quotationTerms: e.target.value.split("\n") })} />}</Field>
            <Field label="Default invoice terms" hint="One per line" className="col-span-2">{(id) => <Textarea id={id} rows={5} value={s.defaults.invoiceTerms.join("\n")} onChange={(e) => set("defaults", { invoiceTerms: e.target.value.split("\n") })} />}</Field>
          </div>
        </Section>

        <Section icon={<Database className="h-4 w-4" />} title="Data & backup" description={mode === "server" ? "Documents are stored on your Synnex server (data folder)." : "No server found — documents are stored in this browser only."}>
          <div className="flex flex-wrap gap-2">
            <Button icon={<Download className="h-4 w-4" />} onClick={exportBackup}>Download backup</Button>
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-medium hover:bg-panel">
              <Upload className="h-4 w-4" /> Restore from backup
              <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) restoreBackup(f); e.target.value = ""; }} />
            </label>
            {mode === "server" && localStorage.getItem("synnex_token") ? <Button variant="ghost" onClick={() => { logout(); reconnect(); }}>Lock (sign out)</Button> : null}
          </div>
          <p className="mt-3 text-xs text-mute">Restoring adds records from the file and keeps what you already have.</p>
        </Section>
      </div>

      <div className={cx("fixed inset-x-0 bottom-14 z-30 border-t border-line bg-white/95 px-4 py-3 backdrop-blur transition lg:bottom-0 lg:left-64 sm:px-8", dirty ? "translate-y-0" : "pointer-events-none translate-y-full opacity-0")}>
        <div className="flex items-center justify-end gap-3">
          <span className="text-sm text-mute">You have unsaved changes</span>
          <Button variant="ghost" onClick={() => { setS(settings); setNext({}); }}>Discard</Button>
          <Button variant="primary" loading={busy} onClick={save}>Save settings</Button>
        </div>
      </div>
    </div>
  );
}

function Section({ icon, title, description, children }: { icon: ReactNode; title: string; description?: string; children: ReactNode }) {
  return (
    <Card title={<span className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-signal text-white">{icon}</span>{title}</span>} description={description}>
      {children}
    </Card>
  );
}

/* Tiny sketch of each layout so the choice is easy to see. */
function LayoutThumb({ kind }: { kind: string }) {
  const bar = "rounded-[1px] bg-[#cfd2d8]";
  return (
    <span className="flex h-[74px] w-[56px] shrink-0 flex-col gap-[3px] rounded-md border border-line bg-white p-1.5" aria-hidden="true">
      {kind === "simple" ? (
        <>
          <span className={`mx-auto h-[3px] w-6 ${bar} bg-[#9aa0aa]`} />
          <span className={`mx-auto h-[2px] w-8 ${bar}`} />
          <span className={`mt-1 h-[2px] w-5 ${bar}`} />
          <span className="flex justify-between"><span className={`h-[2px] w-4 ${bar}`} /><span className={`h-[2px] w-4 ${bar}`} /></span>
          <span className={`mx-auto mt-0.5 h-[3px] w-6 ${bar} bg-[#9aa0aa]`} />
          <span className="mt-0.5 grid flex-1 grid-cols-4 border border-[#cfd2d8]">{Array.from({ length: 4 }).map((_, i) => <span key={i} className="border-r border-[#e1e3e7] last:border-0" />)}</span>
          <span className={`ml-auto h-[2px] w-5 ${bar}`} />
        </>
      ) : (
        <>
          <span className="flex justify-between"><span className={`h-[3px] w-5 ${bar} bg-[#9aa0aa]`} /><span className={`h-[4px] w-5 ${bar} bg-[#9aa0aa]`} /></span>
          <span className="ml-auto grid h-3 w-6 grid-cols-2 border border-[#cfd2d8] bg-[#eceef1]" />
          <span className={`mt-0.5 h-[4px] w-6 ${bar}`} />
          <span className={`h-[4px] w-full ${bar}`} />
          <span className="grid flex-1 grid-cols-4 border border-[#cfd2d8]">{Array.from({ length: 4 }).map((_, i) => <span key={i} className="border-r border-[#e1e3e7] last:border-0" />)}</span>
          <span className={`ml-auto h-[4px] w-6 ${bar}`} />
        </>
      )}
    </span>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      {(id) => (
        <div className="flex gap-2">
          <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-10 w-12 cursor-pointer rounded-lg border border-line bg-white p-1" aria-label={`${label} picker`} />
          <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} className="font-mono uppercase" />
        </div>
      )}
    </Field>
  );
}

