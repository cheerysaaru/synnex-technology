import { useState, useEffect } from "react";
import { FileText, Receipt, FilePlus, Trash2, FileEdit } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getSavedQuotations, deleteQuotation, type SavedQuotation, getSavedInvoices, deleteInvoice, type SavedInvoice } from "../utils/storage";

export default function HomePage() {
  const navigate = useNavigate();
  const [savedQ, setSavedQ] = useState<SavedQuotation[]>([]);
  const [savedI, setSavedI] = useState<SavedInvoice[]>([]);

  function refresh() {
    setSavedQ(getSavedQuotations());
    setSavedI(getSavedInvoices());
  }

  useEffect(() => { refresh(); }, []);

  function handleLoadQuotation(q: SavedQuotation) {
    navigate("/quotation/new", { state: { loadQuotation: { ...q.data, savedId: q.id } } });
  }

  function handleDeleteQuotation(id: string) {
    deleteQuotation(id);
    refresh();
  }

  function handleLoadInvoice(inv: SavedInvoice) {
    navigate("/invoice/new", { state: { loadInvoice: { ...inv.data, savedId: inv.id } } });
  }

  function handleDeleteInvoice(id: string) {
    deleteInvoice(id);
    refresh();
  }

  return (
    <div className="flex min-h-screen flex-col bg-white text-black font-sans">
      <header className="flex flex-col items-center gap-2 px-6 pt-14 pb-10 sm:pt-20">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-black shadow-[0_0_8px_2px_rgba(0,0,0,0.15)]" />
          <span className="text-xs uppercase tracking-[0.2em] text-gray-500">
            Electrical &amp; network
          </span>
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">
          Synnex Technology
        </h1>
        <p className="text-sm text-gray-500">Quotations &amp; invoices, done on site.</p>
      </header>

      <main className="flex flex-1 flex-col items-center px-6 pb-16">
        <div className="grid w-full max-w-3xl grid-cols-1 gap-5">
          <MenuCard
            href="/quotation/new"
            icon={<FileText className="h-6 w-6" strokeWidth={1.75} />}
            title="New Quotation"
            description="Draft pricing for a customer, item by item."
          />
          <MenuCard
            href="/invoice/new"
            icon={<Receipt className="h-6 w-6" strokeWidth={1.75} />}
            title="New Invoice"
            description="Bill a completed job and record the total."
          />
          <MenuCard
            href="/document/new"
            icon={<FilePlus className="h-6 w-6" strokeWidth={1.75} />}
            title="New Document"
            description="Blank page with header and footer — fill in the rest."
          />
        </div>

        {savedQ.length > 0 && (
          <section className="mt-10 w-full max-w-3xl">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-500">
              Saved Quotations
            </h2>
            <div className="space-y-2">
              {savedQ.map((q) => (
                <div
                  key={q.id}
                  className="flex items-center justify-between border border-gray-200 px-4 py-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-black">{q.name}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(q.savedAt).toLocaleDateString("en-GB", {
                        day: "2-digit", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleLoadQuotation(q)}
                      className="inline-flex items-center gap-1 border border-black px-3 py-1.5 text-xs text-black transition-colors hover:bg-gray-100"
                    >
                      <FileEdit className="h-3 w-3" />
                      Load
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteQuotation(q.id)}
                      className="inline-flex items-center gap-1 border border-red-300 px-3 py-1.5 text-xs text-red-600 transition-colors hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {savedI.length > 0 && (
          <section className="mt-6 w-full max-w-3xl">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-500">
              Saved Invoices
            </h2>
            <div className="space-y-2">
              {savedI.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between border border-gray-200 px-4 py-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-black">{inv.name}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(inv.savedAt).toLocaleDateString("en-GB", {
                        day: "2-digit", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleLoadInvoice(inv)}
                      className="inline-flex items-center gap-1 border border-black px-3 py-1.5 text-xs text-black transition-colors hover:bg-gray-100"
                    >
                      <FileEdit className="h-3 w-3" />
                      Load
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteInvoice(inv.id)}
                      className="inline-flex items-center gap-1 border border-red-300 px-3 py-1.5 text-xs text-red-600 transition-colors hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-gray-200 px-6 py-5 text-center text-xs text-gray-400">
        M.P.C.S Lane, Kopay North, Kopay &nbsp;•&nbsp; 021 223 1455 &nbsp;•&nbsp; +94 777 588 128
      </footer>
    </div>
  );
}

function MenuCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <a
      href={href}
      className="group relative flex flex-col gap-4 rounded-xl border border-gray-200 bg-[#f5f5f5] p-6
                 transition-all duration-200 ease-out
                 hover:border-black hover:shadow-[0_0_0_1px_black,0_0_24px_rgba(0,0,0,0.08)]
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:ring-offset-white"
    >
      <span
        className="absolute left-0 top-0 h-full w-1 rounded-l-xl bg-gray-200 transition-colors duration-200 group-hover:bg-black"
        aria-hidden
      />
      <div
        className="flex h-11 w-11 items-center justify-center rounded-lg bg-gray-100 text-gray-500
                   transition-colors duration-200 group-hover:text-black"
      >
        {icon}
      </div>
      <div>
        <h2 className="font-display text-lg font-medium">{title}</h2>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>
    </a>
  );
}
