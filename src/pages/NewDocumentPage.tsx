import { useState } from "react";
import { ArrowLeft, Eye, FileDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PDFDownloadLink, PDFViewer, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const companySettings = {
  name: "SYNNEX TECHNOLOGY",
  tagline: "Lightning & Surge Protection Professionals",
  address: "M.P.C.S Lane, Kopay North, Kopay",
  phone: "Tel: 0777588128",
  email: "Email: vkarull@gmail.com",
};

const pdfStyles = StyleSheet.create({
  page: { padding: "40 40 50", fontSize: 10, color: "#000", fontFamily: "Helvetica" },
  headerBlock: { marginBottom: 12, alignItems: "center" as const },
  tagline: { fontSize: 9, marginBottom: 2 },
  companyName: { fontSize: 16, fontWeight: 700, letterSpacing: 2 },
  contactRow: { fontSize: 9, marginTop: 1 },
  footer: { position: "absolute" as const, bottom: 30, left: 50, right: 50, textAlign: "center" as const, fontSize: 8 },
});

function DocumentPDF() {
  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <View style={pdfStyles.headerBlock}>
          <Text style={pdfStyles.tagline}>{companySettings.tagline}</Text>
          <Text style={pdfStyles.companyName}>{companySettings.name}</Text>
          <Text style={pdfStyles.contactRow}>{companySettings.address}</Text>
          <Text style={pdfStyles.contactRow}>{companySettings.phone}</Text>
          <Text style={pdfStyles.contactRow}>{companySettings.email}</Text>
        </View>
        <Text style={pdfStyles.footer}>
          M.P.C.S LANE, KOPAY NORTH, KOPAY. TELEPHONE 0212231455, MOBILE. 0777588128
        </Text>
      </Page>
    </Document>
  );
}

export default function NewDocumentPage() {
  const navigate = useNavigate();
  const [showPreview, setShowPreview] = useState(false);

  return (
    <>
      <div className="flex min-h-screen flex-col bg-white text-black font-sans">
        <header className="relative flex flex-col items-center gap-2 px-6 pt-14 pb-10 sm:pt-20">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="absolute left-6 top-14 inline-flex items-center gap-1 text-sm text-black transition-colors hover:text-gray-500"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-black shadow-[0_0_8px_2px_rgba(0,0,0,0.15)]" />
            <span className="text-xs uppercase tracking-[0.2em] text-gray-500">
              Electrical &amp; network
            </span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">
            Synnex Technology
          </h1>
        </header>

        <main className="flex-1 px-6">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-center gap-4 pt-4">
              <button
                type="button"
                onClick={() => setShowPreview(true)}
                className="inline-flex items-center gap-2 bg-black px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800"
              >
                <Eye className="h-4 w-4" />
                View PDF
              </button>
              <button
                type="button"
                onClick={() => {}}
                className="border border-black px-6 py-3 text-sm font-medium text-black transition-colors hover:bg-gray-100"
              >
                New Document
              </button>
            </div>
          </div>
        </main>

        <footer className="border-t border-gray-200 px-6 py-5 text-center text-xs text-gray-400">
          M.P.C.S Lane, Kopay North, Kopay &nbsp;•&nbsp; 021 223 1455 &nbsp;•&nbsp; 077 758 8128
        </footer>
      </div>

      {showPreview && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <button
              type="button"
              onClick={() => setShowPreview(false)}
              className="inline-flex items-center gap-1 text-sm text-black transition-colors hover:text-gray-500"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to form
            </button>
            <PDFDownloadLink document={<DocumentPDF />} fileName="letterhead.pdf">
              {({ loading }) => (
                <button
                  type="button"
                  disabled={loading}
                  className="inline-flex items-center gap-2 bg-black px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
                >
                  <FileDown className="h-4 w-4" />
                  {loading ? "Generating..." : "Download PDF"}
                </button>
              )}
            </PDFDownloadLink>
          </div>
          <PDFViewer className="flex-1 w-full" showToolbar={false}>
            <DocumentPDF />
          </PDFViewer>
        </div>
      )}
    </>
  );
}
