import Tesseract from 'tesseract.js';
import type { PDFPageProxy } from 'pdfjs-dist';

export interface OcrResult {
  text: string;
  confidence: number;
  lines: { text: string; confidence: number }[];
  elapsed: number;
  pageCount: number;
  processedPages: number;
  truncated: boolean;
  sourceType: 'image-ocr' | 'pdf-text' | 'pdf-mixed-ocr';
}

export type OcrLanguage = 'eng' | 'chi_sim' | 'chi_tra' | 'eng+chi_sim';

const MAX_PDF_PAGES = 12;
const PDF_RENDER_MAX_DIMENSION = 3200;

function isPdfSource(source: File | Blob | string): source is File {
  return typeof File !== 'undefined'
    && source instanceof File
    && (source.type === 'application/pdf' || source.name.toLowerCase().endsWith('.pdf'));
}

function appendOcrLines(
  blocks: Awaited<ReturnType<Tesseract.Worker['recognize']>>['data']['blocks'],
  lines: { text: string; confidence: number }[],
) {
  for (const block of blocks ?? []) {
    for (const para of block.paragraphs) {
      for (const line of para.lines) {
        const text = line.text.trim();
        if (text) lines.push({ text, confidence: line.confidence });
      }
    }
  }
}

function textLinesFromPdfPage(items: unknown[]): string[] {
  const rows = new Map<number, string[]>();
  for (const item of items) {
    if (!item || typeof item !== 'object' || !('str' in item) || !('transform' in item)) continue;
    const text = String(item.str).trim();
    const transform = item.transform;
    if (!text || !Array.isArray(transform) || typeof transform[5] !== 'number') continue;
    const y = Math.round(transform[5]);
    rows.set(y, [...(rows.get(y) ?? []), text]);
  }
  return [...rows.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, segments]) => segments.join(' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

async function renderPdfPage(page: PDFPageProxy): Promise<Blob> {
  const nativeViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(2, PDF_RENDER_MAX_DIMENSION / Math.max(nativeViewport.width, nativeViewport.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to render PDF page for text recognition.');
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Unable to convert PDF page into an OCR image.'));
    }, 'image/png');
  });
}

async function runPdfDocument(
  file: File,
  language: OcrLanguage,
  onProgress: ((progress: number) => void) | undefined,
  start: number,
): Promise<OcrResult> {
  const [{ getDocument, GlobalWorkerOptions }, { default: workerUrl }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  GlobalWorkerOptions.workerSrc = workerUrl;

  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await loadingTask.promise;
  const processedPages = Math.min(pdf.numPages, MAX_PDF_PAGES);
  let worker: Tesseract.Worker | null = null;
  let ocrPages = 0;
  const textParts: string[] = [];
  const lines: { text: string; confidence: number }[] = [];
  const confidenceScores: number[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= processedPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const nativeLines = textLinesFromPdfPage(content.items);
      const nativeText = nativeLines.join('\n').trim();

      if (nativeText.length >= 30) {
        textParts.push(`[Page ${pageNumber}]\n${nativeText}`);
        nativeLines.forEach((text) => lines.push({ text, confidence: 100 }));
        confidenceScores.push(100);
      } else {
        worker ??= await Tesseract.createWorker(language, Tesseract.OEM.LSTM_ONLY, {
          logger: (message) => {
            if (message.status === 'recognizing text' && typeof message.progress === 'number') {
              onProgress?.(((pageNumber - 1) + message.progress) / processedPages);
            }
          },
        });
        const image = await renderPdfPage(page);
        const { data } = await worker.recognize(image);
        const recognizedText = data.text.trim();
        textParts.push(`[Page ${pageNumber}]\n${recognizedText}`);
        appendOcrLines(data.blocks, lines);
        confidenceScores.push(data.confidence);
        ocrPages += 1;
      }

      page.cleanup();
      onProgress?.(pageNumber / processedPages);
    }
  } finally {
    if (worker) await worker.terminate();
    await pdf.destroy();
  }

  return {
    text: textParts.join('\n\n').trim(),
    confidence: confidenceScores.length
      ? confidenceScores.reduce((sum, score) => sum + score, 0) / confidenceScores.length
      : 0,
    lines,
    elapsed: performance.now() - start,
    pageCount: pdf.numPages,
    processedPages,
    truncated: pdf.numPages > processedPages,
    sourceType: ocrPages > 0 ? 'pdf-mixed-ocr' : 'pdf-text',
  };
}

export async function runOcr(
  imageSource: File | Blob | string,
  language: OcrLanguage = 'eng+chi_sim',
  onProgress?: (progress: number) => void,
): Promise<OcrResult> {
  const start = performance.now();
  if (isPdfSource(imageSource)) {
    return runPdfDocument(imageSource, language, onProgress, start);
  }

  const worker = await Tesseract.createWorker(language, Tesseract.OEM.LSTM_ONLY, {
    logger: (m) => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number') {
        onProgress?.(m.progress);
      }
    },
  });

  try {
    const { data } = await worker.recognize(imageSource);

    const lines: { text: string; confidence: number }[] = [];
    appendOcrLines(data.blocks, lines);

    return {
      text: data.text.trim(),
      confidence: data.confidence,
      lines,
      elapsed: performance.now() - start,
      pageCount: 1,
      processedPages: 1,
      truncated: false,
      sourceType: 'image-ocr',
    };
  } finally {
    await worker.terminate();
  }
}

export function extractBqFromOcrText(text: string): { itemReference: string; description: string; unit: string; rate: string }[] {
  const lines = text.split('\n').filter((l) => l.trim());
  const results: { itemReference: string; description: string; unit: string; rate: string }[] = [];

  const bqLinePattern = /^(BQ[\\/][A-Z][\\/]\d+|[A-Z]\.\d+(?:\.\d+)*|\d+\.\d+)\s+(.+?)\s+(m[23]?|nr|kg|lm|set|lot)\s+([\d,]+\.?\d*)\s*$/i;

  for (const line of lines) {
    const match = line.match(bqLinePattern);
    if (match) {
      results.push({
        itemReference: match[1].trim(),
        description: match[2].trim(),
        unit: match[3].trim().toLowerCase(),
        rate: match[4].replace(/,/g, ''),
      });
    }
  }

  return results;
}
