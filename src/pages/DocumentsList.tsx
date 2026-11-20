import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRightLeft, Copy, FileDown, FileText, Search } from "lucide-react";
import { PageHeader } from "../components/AppShell";
import { Button, ConfirmDelete, Empty, IconButton, Input, Spinner, StatusBadge, cx } from "../components/ui";
import { backend } from "../lib/api";
import { useApp } from "../lib/app";
import { formatDate, money, todayIso } from "../lib/calc";
import { STATUSES, TYPE_LABEL, TYPE_PLURAL, normalizeDoc } from "../lib/document";
import { downloadPdf } from "../lib/pdf";
import type { DocSummary, DocType } from "../types";

export default function DocumentsList({ type }: { type: DocType }) {
  const { settings, toast } = useApp();
  const navigate = useNavigate();
  const [rows, setRows] = useState<DocSummary[] | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const cur = settings.defaults.currency;

  const load = useCallback(() => {
    backend()
      .listDocs({ type, status: status || undefined, q: q.trim() || undefined })
      .then(setRows)
      .catch((e) => toast(e.message, "error"));
  }, [type, status, q, toast]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const pdf = (d: DocSummary) =>
    act(d.id, async () => {
      const rec = await backend().getDoc(d.id);
      await downloadPdf({ ...normalizeDoc(rec.type, rec.data, settings) }, settings);
    });

  return (
    <div>
      <PageHeader
        title={TYPE_PLURAL[type]}
        description={type === "quotation" ? "Price jobs, send them, and turn accepted ones into invoices." : type === "invoice" ? "Bill completed work and track what is still owed." : "Letters on your letterhead."}
        actions={<Button variant="primary" onClick={() => navigate(`/new/${type}`)}>New {TYPE_LABEL[type].toLowerCase()}</Button>}
      />
      <div className="space-y-4 px-4 sm:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
            <Input className="rounded-full! pl-9" placeholder="Search customer, number or subject" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
            {["", ...STATUSES[type]].map((s) => (
              <button key={s || "all"} type="button" onClick={() => setStatus(s)} aria-pressed={status === s} className={cx("h-8 rounded-full border px-3.5 text-[13px] font-semibold capitalize", status === s ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink/30")}>
                {s || "All"}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          {!rows ? (
            <div className="p-8"><Spinner /></div>
          ) : rows.length === 0 ? (
            <Empty icon={<FileText className="h-5 w-5" />} title={q || status ? "Nothing matches" : `No ${TYPE_PLURAL[type].toLowerCase()} yet`} action={!q && !status ? <Button variant="primary" onClick={() => navigate(`/new/${type}`)}>Create one</Button> : undefined}>
              {q || status ? "Try another search or clear the filter." : "Everything you create is saved here automatically."}
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b border-line-2 text-left text-xs text-mute">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Number</th>
                    <th className="px-4 py-2.5 font-medium">Customer</th>
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    {type !== "letter" ? <th className="px-4 py-2.5 text-right font-medium">{type === "invoice" ? "Total / due" : "Total"}</th> : null}
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-2 py-2.5" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-2">
                  {rows.map((d) => {
                    const overdue = type === "invoice" && ["sent", "partial"].includes(d.status) && d.dueDate && d.dueDate < todayIso();
                    return (
                      <tr key={d.id} className="cursor-pointer hover:bg-panel/50" onClick={() => navigate(`/doc/${d.id}`)}>
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">
                          <Link to={`/doc/${d.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">{d.number || "—"}</Link>
                        </td>
                        <td className="max-w-[280px] px-4 py-3">
                          <span className="block truncate text-ink">{d.customer || <span className="text-mute">No customer yet</span>}</span>
                          {d.subject ? <span className="block truncate text-xs text-mute">{d.subject}</span> : null}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-mute">{formatDate(d.issue_date, settings.defaults.dateFormat)}</td>
                        {type !== "letter" ? (
                          <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                            {cur} {money(d.total)}
                            {type === "invoice" && d.balance > 0 && d.balance !== d.total ? <span className="block text-xs text-mute">{money(d.balance)} due</span> : null}
                          </td>
                        ) : null}
                        <td className="px-4 py-3"><StatusBadge status={overdue ? "overdue" : d.status} /></td>
                        <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-0.5">
                            {busy === d.id ? <Spinner className="mx-2 h-4 w-4" /> : null}
                            <IconButton label="Download PDF" onClick={() => pdf(d)}><FileDown className="h-4 w-4" /></IconButton>
                            <IconButton label="Duplicate" onClick={() => act(d.id, async () => { const n = await backend().duplicateDoc(d.id); toast(`Copied as ${n.number}.`); navigate(`/doc/${n.id}`); })}>
                              <Copy className="h-4 w-4" />
                            </IconButton>
                            {type === "quotation" ? (
                              <IconButton label="Convert to invoice" onClick={() => act(d.id, async () => { const n = await backend().convertDoc(d.id); toast(`Invoice ${n.number} created.`); navigate(`/doc/${n.id}`); })}>
                                <ArrowRightLeft className="h-4 w-4" />
                              </IconButton>
                            ) : null}
                            <ConfirmDelete iconOnly label="Delete" onConfirm={async () => { await backend().deleteDoc(d.id); toast("Deleted."); load(); }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
