import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  BrowserMultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
} from '@zxing/library';

// Re-export all pure parsing logic, types, regexes, and matchers from resiParser
export * from './resiParser';

if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;
}

/**
 * Scan 1D & 2D Barcodes (Code 128, Code 39, QR Code, DataMatrix) from an Image element
 */
export async function scanBarcodesFromImage(img: HTMLImageElement): Promise<string[]> {
  const found = new Set<string>();

  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      const DetectorClass = (window as any).BarcodeDetector;
      const detector = new DetectorClass({
        formats: ['code_128', 'code_39', 'qr_code', 'ean_13', 'itf', 'data_matrix', 'codabar'],
      });
      const results = await detector.detect(img);
      if (Array.isArray(results)) {
        for (const r of results) {
          if (r.rawValue && r.rawValue.trim().length >= 6) {
            found.add(r.rawValue.trim());
          }
        }
      }
    } catch {
      // Ignore if native BarcodeDetector fails on this platform
    }
  }

  try {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.QR_CODE,
      BarcodeFormat.ITF,
      BarcodeFormat.DATA_MATRIX,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);

    const reader = new BrowserMultiFormatReader(hints);

    // 1. First try full image decode (fastest & high accuracy for full label barcodes)
    try {
      const fullRes = await reader.decodeFromImageElement(img);
      if (fullRes && fullRes.getText()) {
        const txt = fullRes.getText().trim();
        if (txt.length >= 6) found.add(txt);
      }
    } catch {
      // Continue to region scanning
    }

    // 2. If barcode not yet found, scan targeted vertical slices
    if (found.size === 0) {
      const regions = [
        { yStart: 0, yEnd: 0.45 },
        { yStart: 0.25, yEnd: 0.75 },
        { yStart: 0.5, yEnd: 1.0 },
      ];

      for (const reg of regions) {
        const canvas = document.createElement('canvas');
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) continue;

        const sy = Math.floor(h * reg.yStart);
        const sh = Math.floor(h * (reg.yEnd - reg.yStart));
        canvas.width = w;
        canvas.height = sh;

        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        ctx.drawImage(img, 0, sy, w, sh, 0, 0, w, sh);

        try {
          const dataUrl = canvas.toDataURL('image/png');
          const result = await reader.decodeFromImageUrl(dataUrl);
          if (result && result.getText()) {
            const txt = result.getText().trim();
            if (txt.length >= 6) found.add(txt);
          }
        } catch {
          // Continue to next region
        }
      }
    }
  } catch {
    // Ignore ZXing initialization issues
  }

  return Array.from(found);
}

/**
 * Create a high-contrast preprocessed image DataURL for OCR and a crisp print-ready preview DataURL
 */
export function createOcrOptimizedImage(
  img: HTMLImageElement,
  maxDim = 1350
): { ocrDataUrl: string; previewDataUrl: string } {
  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;

  if (width > maxDim || height > maxDim) {
    if (width > height) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    } else {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }
  } else if (width < 900 && height < 900 && width > 0 && height > 0) {
    width = Math.round(width * 1.5);
    height = Math.round(height * 1.5);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return { ocrDataUrl: img.src, previewDataUrl: img.src };
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  // Crisp print-ready image (~140-200KB, safe for Firestore document storage & thermal printing)
  const previewDataUrl = canvas.toDataURL('image/jpeg', 0.85);

  // High-clarity full quality image for OCR (preserves thin strokes and antialiasing)
  const ocrDataUrl = canvas.toDataURL('image/jpeg', 0.95);
  return { ocrDataUrl, previewDataUrl };
}

/**
 * Extract digital text AND render high-res printable image from a PDF Resi file using Mozilla pdfjs-dist
 */
export async function extractAndRenderPdfFile(file: File): Promise<{
  text: string;
  previewDataUrl: string;
  barcodes: string[];
}> {
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);

  try {
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdfDoc = await loadingTask.promise;

    let allText = '';
    let previewDataUrl = '';
    let barcodes: string[] = [];

    const numPages = Math.min(pdfDoc.numPages, 2);
    for (let p = 1; p <= numPages; p++) {
      const page = await pdfDoc.getPage(p);
      const textContent = await page.getTextContent();
      const pageLines: string[] = [];
      for (const item of textContent.items as any[]) {
        if (item && typeof item.str === 'string') {
          pageLines.push(item.str);
        }
      }
      allText += pageLines.join('\n') + '\n';

      // Render Page 1 to high-resolution Canvas for preview, printing, and barcode scanning
      if (p === 1 && typeof document !== 'undefined') {
        const baseViewport = page.getViewport({ scale: 1.0 });
        const targetScale = Math.min(2.4, Math.max(1.5, 1250 / Math.max(baseViewport.width, baseViewport.height, 1)));
        const viewport = page.getViewport({ scale: targetScale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
          previewDataUrl = canvas.toDataURL('image/jpeg', 0.85);

          // Scan barcodes from the rendered PDF page image
          const renderedImg = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = previewDataUrl;
          });
          barcodes = await scanBarcodesFromImage(renderedImg);

          // If the PDF was a scanned image without embedded text, run OCR on the rendered canvas
          if (allText.trim().length < 15) {
            const ocrText = await runBrowserOcr(previewDataUrl, undefined, 15000);
            allText += '\n' + ocrText;
          }
        }
      }
    }

    return { text: allText, previewDataUrl, barcodes };
  } catch (err) {
    console.warn('PDF.js extraction fallback:', err);
    return { text: '', previewDataUrl: '', barcodes: [] };
  }
}

/**
 * Run Tesseract.js OCR in the browser
 */
export async function runBrowserOcr(
  imageSource: string,
  onProgress?: (pct: number) => void,
  timeoutMs = 15000
): Promise<string> {
  try {
    let timer: any = null;
    const timeoutPromise = new Promise<string>((resolve) => {
      timer = setTimeout(() => {
        resolve('');
      }, timeoutMs);
    });

    const ocrPromise = Tesseract.recognize(imageSource, 'eng', {
      logger: (m) => {
        if (m.status === 'recognizing text' && typeof m.progress === 'number' && onProgress) {
          onProgress(Math.round(m.progress * 100));
        }
      },
    })
      .then((res) => {
        if (timer) clearTimeout(timer);
        return res?.data?.text || '';
      })
      .catch((err) => {
        if (timer) clearTimeout(timer);
        console.warn('Browser OCR error:', err);
        return '';
      });

    return await Promise.race([ocrPromise, timeoutPromise]);
  } catch (err) {
    console.warn('Browser OCR error:', err);
    return '';
  }
}
