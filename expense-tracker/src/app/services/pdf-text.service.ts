import { Injectable } from '@angular/core';

/**
 * Client-side PDF text extraction using pdfjs-dist.
 *
 * The library is loaded lazily (dynamic import) so it doesn't bloat the
 * initial bundle. The worker is also loaded as a URL via Vite/Angular's
 * asset handling so it stays out of the main thread.
 */
@Injectable({ providedIn: 'root' })
export class PdfTextService {
  private loaderPromise: Promise<typeof import('pdfjs-dist')> | null = null;

  /** Returns one text string per page in document order. */
  async extractTextByPage(bytes: Uint8Array): Promise<string[]> {
    const pdfjs = await this.loadPdfJs();
    const loadingTask = pdfjs.getDocument({ data: bytes });
    const doc = await loadingTask.promise;
    const pages: string[] = [];
    try {
      for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
        const page = await doc.getPage(pageNum);
        const textContent = await page.getTextContent();
        // pdfjs returns items in approximate visual order. Join them with
        // newlines when there's a vertical jump so row boundaries survive.
        const lines: string[] = [];
        let currentLine: string[] = [];
        let lastY: number | null = null;
        for (const item of textContent.items as Array<{ str: string; transform?: number[] }>) {
          const y = item.transform?.[5] ?? null;
          if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
            // new line
            if (currentLine.length) lines.push(currentLine.join(' '));
            currentLine = [];
          }
          if (item.str.trim()) currentLine.push(item.str);
          lastY = y;
        }
        if (currentLine.length) lines.push(currentLine.join(' '));
        pages.push(lines.join('\n'));
        page.cleanup();
      }
    } finally {
      await doc.destroy();
    }
    return pages;
  }

  /** Returns the full document text (all pages joined). */
  async extractAllText(bytes: Uint8Array): Promise<string> {
    const pages = await this.extractTextByPage(bytes);
    return pages.join('\n\n--- PAGE ---\n\n');
  }

  private async loadPdfJs(): Promise<typeof import('pdfjs-dist')> {
    if (!this.loaderPromise) {
      this.loaderPromise = (async () => {
        const pdfjs = await import('pdfjs-dist');
        // angular.json copies the worker to the dist root at build time, so
        // it's served from `/pdf.worker.min.mjs` alongside index.html.
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        return pdfjs;
      })();
    }
    return this.loaderPromise;
  }
}
