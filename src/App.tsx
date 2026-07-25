import { Suspense, lazy } from "react";
import { HashRouter, Routes, Route, Link } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";

const HomePage = lazy(() => import("./pages/HomePage"));
const NewQuotationPage = lazy(() => import("./pages/NewQuotationPage"));
const NewInvoicePage = lazy(() => import("./pages/NewInvoicePage"));
const NewDocumentPage = lazy(() => import("./pages/NewDocumentPage"));

function LoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <p className="text-sm text-gray-400">Loading...</p>
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-6 text-center">
      <h1 className="font-display text-4xl font-semibold">404</h1>
      <p className="text-sm text-gray-500">Page not found.</p>
      <Link
        to="/"
        className="border border-black px-6 py-2 text-sm text-black transition-colors hover:bg-gray-100"
      >
        Go home
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/quotation/new" element={<NewQuotationPage />} />
            <Route path="/invoice/new" element={<NewInvoicePage />} />
            <Route path="/document/new" element={<NewDocumentPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </HashRouter>
    </ErrorBoundary>
  );
}
