import Tesseract from 'tesseract.js';

export interface OcrResult {
  text: string;
  confidence: number;
  lines: { text: string; confidence: number }[];
  elapsed: number;
}

export type OcrLanguage = 'eng' | 'chi_sim' | 'chi_tra' | 'eng+chi_sim';

export async function runOcr(
  imageSource: File | Blob | string,
  language: OcrLanguage = 'eng+chi_sim',
  onProgress?: (progress: number) => void,
): Promise<OcrResult> {
  const start = performance.now();

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
    for (const block of data.blocks ?? []) {
      for (const para of block.paragraphs) {
        for (const line of para.lines) {
          lines.push({ text: line.text.trim(), confidence: line.confidence });
        }
      }
    }

    return {
      text: data.text.trim(),
      confidence: data.confidence,
      lines,
      elapsed: performance.now() - start,
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
