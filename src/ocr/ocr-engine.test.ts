import { afterEach, describe, expect, it, vi } from 'vitest';
import { runOcr } from './ocr-engine';

const pdfMocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  workerOptions: { workerSrc: '' },
}));

vi.mock('pdfjs-dist', () => ({
  getDocument: pdfMocks.getDocument,
  GlobalWorkerOptions: pdfMocks.workerOptions,
}));

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: '/assets/pdf.worker.min.mjs',
}));

vi.mock('tesseract.js', () => ({
  default: {
    OEM: { LSTM_ONLY: 1 },
    createWorker: vi.fn(),
  },
}));

class UploadedFile extends Blob {
  readonly name = 'valuation-backup.pdf';
}

describe('PDF document reading', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    pdfMocks.getDocument.mockReset();
    pdfMocks.workerOptions.workerSrc = '';
  });

  it('extracts searchable PDF page text without invoking image OCR', async () => {
    vi.stubGlobal('File', UploadedFile);
    const cleanup = vi.fn();
    const destroy = vi.fn();
    pdfMocks.getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: vi.fn().mockResolvedValue({
          getTextContent: vi.fn().mockResolvedValue({
            items: [
              { str: 'Variation Item 001', transform: [1, 0, 0, 1, 0, 30] },
              { str: 'Concrete wall MYR 1,250.00', transform: [1, 0, 0, 1, 0, 20] },
            ],
          }),
          cleanup,
        }),
        destroy,
      }),
    });

    const result = await runOcr(new UploadedFile(['pdf'], { type: 'application/pdf' }) as File);

    expect(result.sourceType).toBe('pdf-text');
    expect(result.text).toContain('[Page 1]');
    expect(result.text).toContain('Concrete wall MYR 1,250.00');
    expect(result.pages).toEqual([
      expect.objectContaining({
        pageNumber: 1,
        sourceType: 'pdf-text',
        text: expect.stringContaining('Concrete wall MYR 1,250.00'),
      }),
    ]);
    expect(result.processedPages).toBe(1);
    expect(result.truncated).toBe(false);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
    expect(pdfMocks.workerOptions.workerSrc).toContain('pdf.worker.min.mjs');
  });
});
