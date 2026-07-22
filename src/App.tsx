import { HashRouter, Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import NewQuotationPage from "./pages/NewQuotationPage";
import NewInvoicePage from "./pages/NewInvoicePage";
import NewDocumentPage from "./pages/NewDocumentPage";

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/quotation/new" element={<NewQuotationPage />} />
        <Route path="/invoice/new" element={<NewInvoicePage />} />
        <Route path="/document/new" element={<NewDocumentPage />} />
      </Routes>
    </HashRouter>
  );
}
