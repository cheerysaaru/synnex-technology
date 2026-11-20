import { useEffect, useState } from "react";
import { Package, Pencil, Search } from "lucide-react";
import { PageHeader } from "../components/AppShell";
import { Button, ConfirmDelete, Empty, Field, IconButton, Input, Modal, NumberInput, Spinner } from "../components/ui";
import { backend, ApiError } from "../lib/api";
import { useApp } from "../lib/app";
import { money } from "../lib/calc";
import type { CatalogItem } from "../types";

export default function Catalog() {
  const { toast, settings } = useApp();
  const [rows, setRows] = useState<CatalogItem[] | null>(null);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Partial<CatalogItem> | null>(null);
  const load = () => backend().catalog().then(setRows).catch((e) => toast(e.message, "error"));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const shown = (rows || []).filter((r) => !q || `${r.description} ${r.category || ""}`.toLowerCase().includes(q.toLowerCase()));
  const groups = shown.reduce<Record<string, CatalogItem[]>>((acc, r) => {
    (acc[r.category || "Uncategorised"] ||= []).push(r);
    return acc;
  }, {});

  return (
    <div>
      <PageHeader title="Items & rates" description="Your standard items and prices. Type a few letters in a quotation row to pick one." actions={<Button variant="primary" onClick={() => setEdit({ unit: settings.defaults.units[0] })}>Add item</Button>} />
      <div className="space-y-4 px-4 sm:px-8">
        <div className="relative sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
          <Input className="pl-9" placeholder="Search items" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search items" />
        </div>
        {!rows ? (
          <Spinner />
        ) : shown.length === 0 ? (
          <div className="rounded-2xl border border-line bg-white">
            <Empty icon={<Package className="h-5 w-5" />} title={q ? "No items match" : "No saved items yet"} action={!q ? <Button onClick={() => setEdit({ unit: settings.defaults.units[0] })}>Add your first item</Button> : undefined}>
              {q ? "Try another search." : "Add the things you quote often — power points, network points, cable per metre — with their usual rate."}
            </Empty>
          </div>
        ) : (
          Object.entries(groups).map(([cat, items]) => (
            <section key={cat} className="overflow-hidden rounded-2xl border border-line bg-white">
              <h2 className="border-b border-line-2 bg-panel/60 px-4 py-2 text-xs font-semibold text-mute">{cat}</h2>
              <ul className="divide-y divide-line-2">
                {items.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1 text-sm text-ink">{r.description}</span>
                    <span className="w-16 text-right text-xs text-mute">{r.unit}</span>
                    <span className="w-28 text-right text-sm tabular-nums text-ink">{r.rate != null ? `${settings.defaults.currency} ${money(r.rate)}` : "—"}</span>
                    <IconButton label="Edit" onClick={() => setEdit(r)}><Pencil className="h-4 w-4" /></IconButton>
                    <ConfirmDelete iconOnly onConfirm={async () => { await backend().deleteCatalog(r.id); toast("Item removed."); load(); }} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
      {edit ? <ItemForm initial={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} /> : null}
    </div>
  );
}

function ItemForm({ initial, onClose, onSaved }: { initial: Partial<CatalogItem>; onClose: () => void; onSaved: () => void }) {
  const { toast, settings } = useApp();
  const [f, setF] = useState<Partial<CatalogItem>>({ description: "", category: "", rate: null, ...initial });
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await backend().saveCatalog(f);
      toast(initial.id ? "Item updated." : "Item added.");
      onSaved();
    } catch (e) {
      setErr((e as ApiError).details || {});
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={initial.id ? "Edit item" : "Add item"} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Save item</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Description" error={err.description} className="col-span-2">{(id) => <Input id={id} autoFocus value={f.description || ""} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field>
        <Field label="Unit">{(id) => <><Input id={id} list="units-c" value={f.unit || ""} onChange={(e) => setF({ ...f, unit: e.target.value })} /><datalist id="units-c">{settings.defaults.units.map((u) => <option key={u} value={u} />)}</datalist></>}</Field>
        <Field label={`Rate (${settings.defaults.currency})`}>{(id) => <NumberInput id={id} value={f.rate ?? null} onChange={(v) => setF({ ...f, rate: v })} className="text-right" />}</Field>
        <Field label="Category" optional hint="e.g. Electrical, Network, CCTV" className="col-span-2">{(id) => <Input id={id} value={f.category || ""} onChange={(e) => setF({ ...f, category: e.target.value })} />}</Field>
      </div>
    </Modal>
  );
}
