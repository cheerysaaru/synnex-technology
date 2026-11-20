import { Suspense, lazy, useState } from "react";
import { HashRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { Lock } from "lucide-react";
import ErrorBoundary from "./components/ErrorBoundary";
import { AppShell } from "./components/AppShell";
import { Wordmark } from "./components/Brand";
import { Button, Input, Spinner } from "./components/ui";
import { AppProvider, useApp } from "./lib/app";
import { login } from "./lib/api";
import type { DocType } from "./types";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const DocumentsList = lazy(() => import("./pages/DocumentsList"));
const Editor = lazy(() => import("./pages/Editor"));
const Customers = lazy(() => import("./pages/Customers"));
const Catalog = lazy(() => import("./pages/Catalog"));
const SettingsPage = lazy(() => import("./pages/Settings"));

function Loading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner />
    </div>
  );
}

function PinGate() {
  const { reconnect, settings } = useApp();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex min-h-screen items-center justify-center bg-frame px-4">
      <form
        className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-2xl"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await login(pin);
            await reconnect();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Wordmark name={settings.company.name} light={false} small="Quotations & invoices" />
        <h1 className="mt-6 flex items-center gap-2 text-lg font-semibold">
          <Lock className="h-4 w-4" /> Enter your PIN
        </h1>
        <Input className="mt-4 text-center text-lg tracking-[0.5em]" type="password" inputMode="numeric" autoFocus value={pin} onChange={(e) => setPin(e.target.value)} aria-label="PIN" />
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        <Button type="submit" variant="primary" className="mt-4 w-full" loading={busy}>
          Unlock
        </Button>
      </form>
    </div>
  );
}

function NewDoc() {
  const { type } = useParams();
  if (!["quotation", "invoice", "letter"].includes(type || "")) return <Navigate to="/" replace />;
  return <Editor key={`new-${type}`} newType={type as DocType} />;
}

function EditDoc() {
  const { id } = useParams();
  return <Editor key={id} id={id} />;
}

function Routed() {
  const { ready, needsPin } = useApp();
  if (!ready) return <Loading />;
  if (needsPin) return <PinGate />;
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/new/:type" element={<NewDoc />} />
        <Route path="/doc/:id" element={<EditDoc />} />
        <Route
          path="*"
          element={
            <AppShell>
              <Suspense fallback={<Loading />}>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/quotations" element={<DocumentsList type="quotation" />} />
                  <Route path="/invoices" element={<DocumentsList type="invoice" />} />
                  <Route path="/letters" element={<DocumentsList type="letter" />} />
                  <Route path="/customers" element={<Customers />} />
                  <Route path="/items" element={<Catalog />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  {/* links from the previous version */}
                  <Route path="/quotation/new" element={<Navigate to="/new/quotation" replace />} />
                  <Route path="/invoice/new" element={<Navigate to="/new/invoice" replace />} />
                  <Route path="/document/new" element={<Navigate to="/new/letter" replace />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </AppShell>
          }
        />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <HashRouter>
          <Routed />
        </HashRouter>
      </AppProvider>
    </ErrorBoundary>
  );
}
