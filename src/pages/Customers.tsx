import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Pencil, Search, Users } from "lucide-react";
import { PageHeader } from "../components/AppShell";
import { Button, ConfirmDelete, Empty, Field, IconButton, Input, Modal, Spinner, Textarea } from "../components/ui";
import { backend, ApiError } from "../lib/api";
import { useApp } from "../lib/app";
import { emptyCustomer } from "../lib/document";
import type { Customer } from "../types";

type Row = Customer & { id: string };

export default function Customers() {
  const { toast } = useApp();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Partial<Row> | null>(null);

  const load = () => backend().customers().then(setRows).catch((e) => toast(e.message, "error"));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = (rows || []).filter((r) => !q || `${r.name} ${r.line1} ${r.line2} ${r.phone} ${r.email}`.toLowerCase().includes(q.toLowerCase()));

  const quoteFor = async (r: Row) => {
    const doc = await backend().createDoc("quotation", { customer: { ...emptyCustomer(), ...r } });
    navigate(`/doc/${doc.id}`);
  };

  return (
    <div>
      <PageHeader title="Customers" description="Saved customers fill in the address on new documents in one click." actions={<Button variant="primary" onClick={() => setEdit({})}>Add customer</Button>} />
      <div className="space-y-4 px-4 sm:px-8">
        <div className="relative sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
          <Input className="pl-9" placeholder="Search customers" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" />
        </div>
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          {!rows ? (
            <div className="p-8"><Spinner /></div>
          ) : shown.length === 0 ? (
            <Empty icon={<Users className="h-5 w-5" />} title={q ? "No customers match" : "No customers yet"} action={!q ? <Button onClick={() => setEdit({})}>Add your first customer</Button> : undefined}>
              {q ? "Try another search." : "You can also save a customer straight from a quotation."}
            </Empty>
          ) : (
            <ul className="divide-y divide-line-2">
              {shown.map((r) => (
                <li key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{r.name}</p>
                    <p className="truncate text-xs text-mute">{[r.attention, r.line1, r.line2, r.line3, r.phone, r.email].filter(Boolean).join(" · ") || "No details"}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" icon={<FileText className="h-4 w-4" />} onClick={() => quoteFor(r)}>New quotation</Button>
                    <IconButton label="Edit" onClick={() => setEdit(r)}><Pencil className="h-4 w-4" /></IconButton>
                    <ConfirmDelete iconOnly onConfirm={async () => { await backend().deleteCustomer(r.id); toast("Customer removed."); load(); }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {edit ? <CustomerForm initial={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} /> : null}
    </div>
  );
}

function CustomerForm({ initial, onClose, onSaved }: { initial: Partial<Row>; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const [f, setF] = useState<Partial<Row>>({ ...emptyCustomer(), notes: "", ...initial });
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Row) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    setBusy(true);
    try {
      await backend().saveCustomer(f);
      toast(initial.id ? "Customer updated." : "Customer added.");
      onSaved();
    } catch (e) {
      setErr((e as ApiError).details || {});
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={initial.id ? "Edit customer" : "Add customer"} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Save customer</Button></>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name or business" error={err.name} className="sm:col-span-2">{(id) => <Input id={id} autoFocus value={f.name || ""} onChange={set("name")} />}</Field>
        <Field label="Attention" optional>{(id) => <Input id={id} value={f.attention || ""} onChange={set("attention")} />}</Field>
        <Field label="Phone" optional>{(id) => <Input id={id} type="tel" value={f.phone || ""} onChange={set("phone")} />}</Field>
        <Field label="Address line 1" optional>{(id) => <Input id={id} value={f.line1 || ""} onChange={set("line1")} />}</Field>
        <Field label="Address line 2" optional>{(id) => <Input id={id} value={f.line2 || ""} onChange={set("line2")} />}</Field>
        <Field label="Address line 3" optional>{(id) => <Input id={id} value={f.line3 || ""} onChange={set("line3")} />}</Field>
        <Field label="Email" optional>{(id) => <Input id={id} type="email" value={f.email || ""} onChange={set("email")} />}</Field>
        <Field label="Private notes" optional className="sm:col-span-2">{(id) => <Textarea id={id} value={f.notes || ""} onChange={set("notes")} />}</Field>
      </div>
    </Modal>
  );
}
