import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, Clock, FileText, Receipt, TrendingUp, Wallet } from "lucide-react";
import { PageHeader, StatCard } from "../components/AppShell";
import { TrendChart } from "../components/TrendChart";
import { Empty, Spinner, StatusBadge, cx } from "../components/ui";
import { backend } from "../lib/api";
import { useApp } from "../lib/app";
import { formatDate, money, todayIso } from "../lib/calc";
import { TYPE_LABEL } from "../lib/document";
import type { DocSummary, Stats } from "../types";

const pct = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

export default function Dashboard() {
  const { settings, mode } = useApp();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"all" | "quotation" | "invoice">("all");
  const cur = settings.defaults.currency;

  useEffect(() => {
    backend().stats().then(setStats).catch((e) => setError(e.message));
  }, []);

  if (error) return <><PageHeader title="Dashboard" /><p className="text-sm text-red-600">{error}</p></>;
  if (!stats) return <><PageHeader title="Dashboard" /><Spinner /></>;

  const m = stats.monthly || [];
  const qNow = m.at(-1)?.quoted || 0;
  const qPrev = m.at(-2)?.quoted || 0;
  const iNow = m.at(-1)?.invoiced || 0;
  const iPrev = m.at(-2)?.invoiced || 0;
  const qp = pct(qNow, qPrev);
  const ip = pct(iNow, iPrev);
  const recent = stats.recent.filter((d) => tab === "all" || d.type === tab);

  return (
    <div className="space-y-4">
      <PageHeader title="Dashboard" />
      {mode === "local" ? (
        <div className="flex items-start gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>No server found — documents are saved in this browser only. Run <code className="rounded bg-white px-1">npm start</code> to save them on your computer, or keep a backup.</p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard dark to="/quotations" icon={<FileText className="h-4 w-4" />} label="Quoted this month" value={`${cur} ${money(stats.quotedThisMonth)}`} note={qp == null ? `${stats.quotationsThisMonth} quotations` : `${qp >= 0 ? "+" : ""}${qp}% vs last month`} tone={qp != null && qp < 0 ? "down" : "up"} />
        <StatCard to="/invoices" icon={<Receipt className="h-4 w-4" />} label="Invoiced this month" value={`${cur} ${money(stats.invoicedThisMonth)}`} note={ip == null ? `${cur} ${money(stats.paidThisMonth)} paid` : `${ip >= 0 ? "+" : ""}${ip}% vs last month`} tone={ip != null && ip < 0 ? "down" : "up"} />
        <StatCard to="/invoices" icon={<Wallet className="h-4 w-4" />} label="Outstanding" value={`${cur} ${money(stats.outstanding)}`} note={stats.overdue ? `${stats.overdue} overdue` : "Nothing overdue"} tone={stats.overdue ? "warn" : "up"} />
        <StatCard to="/quotations" icon={<Clock className="h-4 w-4" />} label="Awaiting reply" value={String(stats.openQuotations)} note={`${stats.acceptedQuotations} accepted`} tone="up" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <section className="rounded-2xl border border-line p-5 xl:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-[15px] font-bold"><TrendingUp className="h-4 w-4 text-signal" /> Quoted vs invoiced</h2>
            <span className="rounded-full bg-panel px-3 py-1 text-xs font-medium text-mute">Last 6 months</span>
          </div>
          <TrendChart data={m} currency={cur} />
        </section>

        <section className="rounded-2xl border border-line p-5 xl:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-bold">Recent documents</h2>
            <div className="flex gap-1" role="group" aria-label="Filter recent documents">
              {(["all", "quotation", "invoice"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t} className={cx("h-7 rounded-full px-3 text-xs font-semibold capitalize", tab === t ? "bg-ink text-white" : "border border-line text-ink hover:border-ink/30")}>
                  {t === "all" ? "All" : `${t}s`}
                </button>
              ))}
            </div>
          </div>
          {recent.length === 0 ? (
            <Empty icon={<FileText className="h-5 w-5" />} title="Nothing here yet">Create a quotation — it saves as you type.</Empty>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="text-left text-[11.5px] text-mute">
                <tr><th className="pb-2 font-medium">Customer</th><th className="pb-2 text-right font-medium">Amount</th><th className="pb-2 pl-3 font-medium">Status</th></tr>
              </thead>
              <tbody>
                {recent.slice(0, 5).map((d) => <RecentRow key={d.id} d={d} cur={cur} fmt={settings.defaults.dateFormat} onOpen={() => navigate(`/doc/${d.id}`)} />)}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <FollowList title="Waiting for a reply" empty="No quotations are waiting." rows={stats.awaiting} action="Follow up" cur={cur} />
        <FollowList title="Overdue invoices" empty="No invoices are overdue." rows={stats.overdueList} action="Open" cur={cur} danger />
        <section className="flex flex-col justify-between rounded-2xl bg-ink p-5 text-white">
          <div>
            <h2 className="text-[15px] font-bold">Start a new document</h2>
            <p className="mt-1 text-[13px] text-white/60">Pick a type. It is numbered and saved automatically.</p>
          </div>
          <div className="mt-5 grid gap-2">
            {[["/new/quotation", "New quotation"], ["/new/invoice", "New invoice"], ["/new/letter", "New letter"]].map(([to, l], i) => (
              <Link key={to} to={to} className={cx("flex h-10 items-center justify-center rounded-full text-[13px] font-semibold", i === 0 ? "bg-signal text-white hover:bg-signal-2" : "bg-white/10 text-white hover:bg-white/15")}>{l}</Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function RecentRow({ d, cur, fmt, onOpen }: { d: DocSummary; cur: string; fmt: string; onOpen: () => void }) {
  const overdue = d.type === "invoice" && ["sent", "partial"].includes(d.status) && d.dueDate && d.dueDate < todayIso();
  return (
    <tr onClick={onOpen} className="cursor-pointer border-t border-line-2 hover:bg-panel/60">
      <td className="py-2.5 pr-2">
        <span className="flex items-center gap-2.5">
          <span className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", d.type === "invoice" ? "bg-ink text-white" : "bg-soft text-signal")}>
            {d.type === "invoice" ? <Receipt className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
          </span>
          <span className="min-w-0">
            <span className="block max-w-[150px] truncate font-semibold text-ink">{d.customer || "No customer"}</span>
            <span className="block text-[11px] text-mute">{TYPE_LABEL[d.type]} {d.number} · {formatDate(d.issue_date, fmt)}</span>
          </span>
        </span>
      </td>
      <td className="whitespace-nowrap py-2.5 text-right font-semibold tabular-nums">{d.type !== "letter" ? `${cur} ${money(d.total)}` : "—"}</td>
      <td className="py-2.5 pl-3"><StatusBadge status={overdue ? "overdue" : d.status} /></td>
    </tr>
  );
}

function FollowList({ title, empty, rows, action, cur, danger }: { title: string; empty: string; rows: DocSummary[]; action: string; cur: string; danger?: boolean }) {
  const navigate = useNavigate();
  const { settings } = useApp();
  return (
    <section className="rounded-2xl border border-line p-5">
      <h2 className="mb-3 text-[15px] font-bold">{title}</h2>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-mute">{empty}</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((d) => (
            <li key={d.id} className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-ink">{d.customer || "No customer"}</span>
                <span className={cx("block text-[11.5px]", danger ? "text-red-600" : "text-mute")}>
                  {d.number} · {cur} {money(danger ? d.balance : d.total)}{danger && d.dueDate ? ` · due ${formatDate(d.dueDate, settings.defaults.dateFormat)}` : ""}
                </span>
              </span>
              <button type="button" onClick={() => navigate(`/doc/${d.id}`)} className="h-8 shrink-0 rounded-full border border-line px-3 text-xs font-semibold hover:bg-ink hover:text-white">{action}</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
