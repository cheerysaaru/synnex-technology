/* PDF generation, loaded on demand so the app starts fast. */
import { createElement } from "react";
import type { DocData, Settings } from "../types";
import { fileNameFor } from "./document";

export async function renderPdf(data: DocData, settings: Settings): Promise<Blob> {
  const [{ pdf }, { DocumentPDF }] = await Promise.all([import("@react-pdf/renderer"), import("../pdf/DocumentPDF")]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return pdf(createElement(DocumentPDF, { data, settings }) as any).toBlob();
}

export async function downloadPdf(data: DocData, settings: Settings) {
  const blob = await renderPdf(data, settings);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileNameFor(data);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function printPdf(data: DocData, settings: Settings) {
  const blob = await renderPdf(data, settings);
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) {
    // Pop-up blocked: fall back to a download.
    await downloadPdf(data, settings);
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
