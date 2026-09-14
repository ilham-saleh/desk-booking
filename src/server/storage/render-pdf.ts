import { createCanvas } from "@napi-rs/canvas";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import path from "path";

export interface RenderedPdfPage {
  png: Buffer;
  width: number;
  height: number;
}

// Configure pdfjs worker source for server-side rendering
const initializePdfjsWorker = () => {
  if (typeof globalThis !== "undefined" && "require" in globalThis) {
    try {
      const workerPath = path.join(
        path.dirname(require.resolve("pdfjs-dist/legacy/build/pdf.mjs")),
        "pdf.worker.mjs"
      );
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;
    } catch {
      // Fallback: worker will be loaded inline if available
      const workerBlob = new Blob(["importScripts('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js')"], { type: "application/javascript" });
      pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);
    }
  }
};

initializePdfjsWorker();

/**
 * Renders a PDF's first page to a PNG (CLAUDE.md: "PDFs are rendered
 * first-page → PNG for the canvas background"), used by both the seed
 * script and the Phase 4 admin upload flow. No `import "server-only"` here —
 * prisma/seed.ts imports this directly under tsx, outside Next's module graph.
 */
export async function renderPdfFirstPageToPng(pdfBytes: Uint8Array, scale = 2): Promise<RenderedPdfPage> {
  try {
    const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
    const doc = await loadingTask.promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale });
    const width = Math.ceil(viewport.width);
    const height = Math.ceil(viewport.height);

    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Failed to get canvas 2D context");
    }

    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;

    await loadingTask.destroy();

    return { png: canvas.toBuffer("image/png"), width, height };
  } catch (err) {
    throw new Error(
      `PDF rendering failed: ${err instanceof Error ? err.message : "Unknown error"}. ` +
      `Ensure @napi-rs/canvas native bindings are properly installed. ` +
      `Try: npm install --force`
    );
  }
}
