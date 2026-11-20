/* Draws a PDF blob as page images with pdf.js. Works on phones and tablets,
   where embedded PDF viewers are often missing. */
import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export function PdfPages({ blob, onError }: { blob: Blob | null; onError?: (m: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<string[]>([]);

  useEffect(() => {
    if (!blob) return;
    let cancelled = false;
    (async () => {
      try {
        const data = new Uint8Array(await blob.arrayBuffer());
        const doc = await pdfjs.getDocument({ data }).promise;
        const width = Math.min(host.current?.clientWidth || 800, 1100) - 32;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const out: string[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: (width / base.width) * ratio });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(vp.width);
          canvas.height = Math.floor(vp.height);
          await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
          out.push(canvas.toDataURL("image/png"));
          if (cancelled) return;
        }
        doc.destroy();
        if (!cancelled) setPages(out);
      } catch (e) {
        if (!cancelled) onError?.((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blob, onError]);

  return (
    <div ref={host} className="h-full overflow-y-auto px-4 py-4">
      <div className="mx-auto flex max-w-[1100px] flex-col items-center gap-4">
        {pages.map((src, i) => (
          <img key={i} src={src} alt={`Page ${i + 1}`} className="w-full rounded-sm bg-white shadow-[0_2px_12px_rgba(19,35,63,0.18)]" />
        ))}
      </div>
    </div>
  );
}
