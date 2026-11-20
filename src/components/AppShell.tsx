import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { ArrowUpRight, Download, FileText, HardDrive, LayoutDashboard, Mail, Package, Plus, Receipt, Search, Server, Settings, Users, X } from "lucide-react";
import { useApp } from "../lib/app";
import { backend } from "../lib/api";
import { formatDate, money, todayIso } from "../lib/calc";
import { TYPE_LABEL } from "../lib/document";
import type { DocSummary } from "../types";
import { Wordmark } from "./Brand";
import { StatusBadge, cx } from "./ui";

/* Pages set the title shown in the top bar. */
const TitleCtx = createContext<(t: string) => void>(() => {});

const MENU = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/quotations", label: "Quotations", icon: FileText },
  { to: "/invoices", label: "Invoices", icon: Receipt },
  { to: "/letters", label: "Letters", icon: Mail },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/items", label: "Items & rates", icon: Package },
];

function NavItem({ to, label, icon: Icon, end }: (typeof MENU)[number]) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cx(
          "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-colors",
          isActive ? "text-white" : "text-white/50 hover:text-white/85",
        )
      }
    >
      {({ isActive }) => (
        <>
          <span className={cx("absolute -left-4 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-signal transition-opacity", isActive ? "opacity-100" : "opacity-0")} />
          <Icon className={cx("h-[18px] w-[18px]", isActive && "text-signal")} />
          {label}
        </>
      )}
    </NavLink>
  );
}

export function NewMenu({ dark }: { dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cx(
          "inline-flex h-10 items-center gap-2.5 rounded-full border pl-4 pr-1.5 text-[13.5px] font-semibold",
          dark ? "border-white/15 text-white" : "border-line bg-white text-ink hover:border-ink/30",
        )}
      >
        New document
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-white">
          <Plus className="h-4 w-4" />
        </span>
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-60 rounded-2xl border border-line bg-white p-1.5 shadow-xl">
            {[
              ["/new/quotation", "Quotation", FileText, "Price a job for a customer"],
              ["/new/invoice", "Invoice", Receipt, "Bill completed work"],
              ["/new/letter", "Letter", Mail, "Your letterhead with free text"],
            ].map(([to, label, Icon, hint]) => {
              const I = Icon as typeof FileText;
              return (
                <button key={to as string} type="button" onClick={() => go(to as string)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-panel">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-soft text-signal">
                    <I className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-ink">{label as string}</span>
                    <span className="block text-xs text-mute">{hint as string}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<DocSummary[]>([]);
  const [open, setOpen] = useState(false);
  const { settings } = useApp();
  const navigate = useNavigate();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) return setRows([]);
    const t = setTimeout(() => backend().listDocs({ q: q.trim() }).then((r) => setRows(r.slice(0, 7))).catch(() => {}), 180);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        box.current?.querySelector("input")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div ref={box} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search customers, numbers, subjects"
        aria-label="Search documents"
        className="h-10 w-full rounded-full border border-line bg-panel pl-10 pr-9 text-[13.5px] outline-none placeholder:text-mute focus:border-signal focus:bg-white"
      />
      {q ? (
        <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-mute hover:text-ink">
          <X className="h-4 w-4" />
        </button>
      ) : null}
      {open && q.trim().length >= 2 ? (
        <div className="absolute left-0 right-0 z-40 mt-2 overflow-hidden rounded-2xl border border-line bg-white shadow-xl">
          {rows.length === 0 ? (
            <p className="px-4 py-3 text-sm text-mute">No documents match “{q}”.</p>
          ) : (
            rows.map((d) => (
              <button key={d.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setOpen(false); setQ(""); navigate(`/doc/${d.id}`); }} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-panel">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{d.customer || "No customer"}</span>
                  <span className="block truncate text-xs text-mute">{TYPE_LABEL[d.type]} {d.number} · {formatDate(d.issue_date, settings.defaults.dateFormat)}</span>
                </span>
                {d.type !== "letter" ? <span className="text-xs font-semibold tabular-nums text-ink">{money(d.total)}</span> : null}
                <StatusBadge status={d.type === "invoice" && ["sent", "partial"].includes(d.status) && d.dueDate && d.dueDate < todayIso() ? "overdue" : d.status} />
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function BackupCard() {
  const { toast } = useApp();
  const download = async () => {
    try {
      const data = await backend().backup();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `synnex-backup-${todayIso()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast("Backup downloaded.");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  return (
    <div className="rounded-2xl bg-white p-4">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-white">
        <Download className="h-4 w-4" />
      </span>
      <p className="mt-3 text-sm font-bold text-ink">Keep a backup</p>
      <p className="mt-1 text-xs leading-relaxed text-mute">Download every quotation, invoice and customer as one file.</p>
      <button type="button" onClick={download} className="mt-3 h-9 w-full rounded-full bg-ink text-[13px] font-semibold text-white hover:bg-navy-2">
        Download backup
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { settings, mode } = useApp();
  const [title, setTitle] = useState("");
  const location = useLocation();
  const initials = settings.signatory.name.split(/\s+/).map((w) => w.replace(/\W/g, "")[0]).filter(Boolean).slice(-2).join("").toUpperCase();

  return (
    <TitleCtx.Provider value={setTitle}>
      <div className="min-h-screen bg-frame lg:p-3 lg:pl-0">
        {/* sidebar */}
        <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col px-4 pb-4 pt-6 lg:flex">
          <Link to="/" className="px-3 pb-8"><Wordmark name={settings.company.name} logo={settings.company.logo} small="Quotes & invoices" /></Link>
          <p className="px-3 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/30">Menu</p>
          <nav className="flex flex-col gap-0.5" aria-label="Main">{MENU.map((m) => <NavItem key={m.to} {...m} />)}</nav>
          <div className="mx-3 my-5 border-t border-white/10" />
          <p className="px-3 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/30">General</p>
          <nav className="flex flex-col gap-0.5" aria-label="General">
            <NavItem to="/settings" label="Settings" icon={Settings} />
          </nav>
          <div className="mt-auto space-y-4">
            <BackupCard />
            <div className="flex items-center gap-3 px-1">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-signal text-xs font-bold text-white">{initials || "S"}</span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[13px] font-semibold text-white">{settings.signatory.name}</span>
                <span className="mt-0.5 flex items-center gap-1 text-[11px] text-white/45">
                  {mode === "server" ? <Server className="h-3 w-3" /> : <HardDrive className="h-3 w-3 text-amber-300" />}
                  {mode === "server" ? "Saved on server" : "This browser only"}
                </span>
              </span>
            </div>
          </div>
        </aside>

        {/* main panel */}
        <div className="min-h-screen bg-white lg:ml-60 lg:min-h-[calc(100vh-24px)] lg:rounded-[26px]">
          <header className="sticky top-0 z-20 flex items-center gap-3 bg-white/95 px-4 py-3 backdrop-blur sm:px-7 lg:top-3 lg:rounded-t-[26px] lg:py-5">
            <Link to="/" className="lg:hidden"><Wordmark name={settings.company.name} logo={settings.company.logo} light={false} /></Link>
            <h1 className="hidden min-w-[180px] text-[22px] font-bold tracking-tight text-ink lg:block">{title}</h1>
            <div className="hidden flex-1 justify-center md:flex"><GlobalSearch /></div>
            <div className="ml-auto flex items-center gap-2">
              <Link to="/settings" aria-label="Settings" className="hidden h-10 w-10 items-center justify-center rounded-full border border-line text-ink hover:border-ink/30 sm:flex"><Settings className="h-4 w-4" /></Link>
              <NewMenu />
            </div>
          </header>
          <main key={location.pathname} className="px-4 pb-28 sm:px-7 lg:pb-8">
            <h1 className="pb-3 pt-1 text-xl font-bold tracking-tight text-ink lg:hidden">{title}</h1>
            {children}
          </main>
        </div>

        {/* mobile tab bar */}
        <nav className="fixed inset-x-3 bottom-3 z-20 grid grid-cols-5 rounded-2xl bg-frame p-1.5 shadow-2xl lg:hidden" aria-label="Main">
          {[MENU[0], MENU[1], MENU[2], MENU[4], { to: "/settings", label: "Settings", icon: Settings, end: false }].map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => cx("flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10.5px] font-medium", isActive ? "bg-white/10 text-white" : "text-white/50")}>
              <Icon className="h-[18px] w-[18px]" />
              {label.split(" ")[0]}
            </NavLink>
          ))}
        </nav>
      </div>
    </TitleCtx.Provider>
  );
}

/* Sets the top-bar title, and shows the description and actions under it. */
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  const setTitle = useContext(TitleCtx);
  useEffect(() => {
    setTitle(title);
    document.title = `${title} · Synnex Technology`;
  }, [title, setTitle]);
  if (!description && !actions) return null;
  return (
    <div className="flex flex-col gap-3 pb-5 sm:flex-row sm:items-center sm:justify-between">
      {description ? <p className="text-[13.5px] text-mute">{description}</p> : <span />}
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({ label, value, note, icon, to, dark, tone }: { label: string; value: string; note?: ReactNode; icon: ReactNode; to: string; dark?: boolean; tone?: "up" | "down" | "warn" }) {
  return (
    <Link to={to} className={cx("group flex flex-col justify-between rounded-2xl p-4 transition", dark ? "bg-ink text-white" : "border border-line bg-white hover:border-ink/25")}>
      <div className="flex items-start justify-between">
        <span className={cx("flex h-9 w-9 items-center justify-center rounded-full", dark ? "bg-signal text-white" : "bg-soft text-signal")}>{icon}</span>
        <span className={cx("flex h-8 w-8 items-center justify-center rounded-full border transition", dark ? "border-white/20 text-white/80 group-hover:bg-white group-hover:text-ink" : "border-line text-ink group-hover:bg-ink group-hover:text-white")}>
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-5">
        <p className={cx("text-[13px] font-medium", dark ? "text-white/70" : "text-mute")}>{label}</p>
        <p className="mt-1 text-[22px] font-bold tracking-tight tabular-nums sm:text-2xl">{value}</p>
        {note ? (
          <p className="mt-2 flex items-center gap-2 text-[11.5px]">
            <span className={cx("rounded-full px-2 py-0.5 font-semibold", tone === "warn" ? "bg-red-50 text-red-600" : tone === "down" ? (dark ? "bg-white/10 text-white" : "bg-panel text-mute") : dark ? "bg-signal/25 text-white" : "bg-soft text-signal-2")}>{note}</span>
          </p>
        ) : null}
      </div>
    </Link>
  );
}
