import { createCanvas } from "@napi-rs/canvas";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

export interface RenderedPdfPage {
  png: Buffer;
  width: number;
  height: number;
}

/**
 * Renders a PDF's first page to a PNG (CLAUDE.md: "PDFs are rendered
 * first-page → PNG for the canvas background"), used by both the seed
 * script and the Phase 4 admin upload flow. No `import "server-only"` here —
 * prisma/seed.ts imports this directly under tsx, outside Next's module graph.
 */
export async function renderPdfFirstPageToPng(pdfBytes: Uint8Array, scale = 2): Promise<RenderedPdfPage> {
  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
  const doc = await loadingTask.promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale });
  const width = Math.ceil(viewport.width);
  const height = Math.ceil(viewport.height);

  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  await page.render({
    canvas: canvas as unknown as HTMLCanvasElement,
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;
  await loadingTask.destroy();

  return { png: canvas.toBuffer("image/png"), width, height };
}
