import { createWorker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import { MarketplaceType } from '../types';

// Set worker PDF.js secara dinamis / fallback
if (typeof window !== 'undefined' && 'Worker' in window) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  } catch {
    // fallback jika bundler menggunakan cdn
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  }
}

export interface ParsedResiData {
  noPesanan: string;
  noResi: string;
  kurir: string;
  marketplace: MarketplaceType | '';
  storeName: string;
  produkList: { name: string; qty: number }[];
}

/**
 * Logika Regex Pintar: Memisahkan No. Pesanan / Order ID dan No. Resi Kurir
 */
export function parseResiText(
  rawText: string,
  barcodes: string[] = [],
  fileName = ''
): ParsedResiData {
  const text = (rawText || '').replace(/\r/g, ' ');
  let detectedOrder = '';
  let detectedResi = '';
  let detectedKurir = '';
  let detectedMp: MarketplaceType | '' = '';
  let detectedStore = '';

  // 1. ORDER ID / NO. PESANAN
  // Pola Label: "Order Id: 587040711674595323"
  const orderIdMatch = text.match(/(?:Order\s*Id|Order\s*ID|Order-Id)\s*[:=\-]?\s*([0-9A-Za-z]{10,25})/i);
  if (orderIdMatch) {
    detectedOrder = orderIdMatch[1].trim();
  }

  // Pola Label: "No. Pesanan: 24090404FEAUFW2"
  if (!detectedOrder) {
    const noPesananMatch = text.match(/(?:No\.?\s*Pesanan|No\.?\s*Pemesanan|Nomor\s*Pesanan)\s*[:=\-]?\s*([0-9A-Za-z]{10,25})/i);
    if (noPesananMatch) {
      detectedOrder = noPesananMatch[1].trim();
    }
  }

  // Pola Mandiri TikTok Shop Order ID (16-19 digit diawali 57 / 58)
  if (!detectedOrder) {
    const tiktokOrderMatch = text.match(/\b(5[78][0-9]{15,18})\b/);
    if (tiktokOrderMatch) {
      detectedOrder = tiktokOrderMatch[1].trim();
      detectedMp = 'TikTok Shop';
    }
  }

  // Pola Mandiri Shopee Order ID (kombinasi tanggal + huruf kapital)
  if (!detectedOrder) {
    const shopeeOrderMatch = text.match(/\b(2[3-9][0-1][0-9][0-3][0-9][A-Za-z0-9]{6,12})\b/);
    if (shopeeOrderMatch) {
      detectedOrder = shopeeOrderMatch[1].trim();
      detectedMp = 'Shopee';
    }
  }

  // 2. NOMOR RESI (AWB / TRACKING NO)
  const resiMatch = text.match(/(?:No\.?\s*Resi|Nomor\s*Resi|AWB|Tracking\s*No|Waybill)\s*[:=\-]?\s*([0-9A-Za-z]{8,25})/i);
  if (resiMatch) {
    detectedResi = resiMatch[1].trim();
  }

  // Format J&T (JY / JX / JP)
  const jntMatch = text.match(/\b(J[YXPT][0-9]{9,12})\b/i);
  if (jntMatch) {
    detectedResi = jntMatch[1].toUpperCase();
    if (!detectedKurir) detectedKurir = 'J&T Express';
  }

  // Format Shopee Xpress (SPXID...)
  const spxMatch = text.match(/\b(SPXID[0-9]{10,14})\b/i);
  if (spxMatch) {
    detectedResi = spxMatch[1].toUpperCase();
    if (!detectedKurir) detectedKurir = 'Shopee Xpress (SPX)';
    if (!detectedMp) detectedMp = 'Shopee';
  }

  // 3. EVALUASI BARCODE
  if (barcodes && barcodes.length > 0) {
    for (const code of barcodes) {
      const clean = code.trim();
      if (!clean) continue;

      if (/^SPXID[0-9]+/i.test(clean) || /^J[YXPT][0-9]+/i.test(clean)) {
        if (!detectedResi) detectedResi = clean;
      } else if (/^2[3-9][0-1][0-9][0-3][0-9][A-Za-z0-9]{6,12}$/.test(clean) || /^5[78][0-9]{15,18}$/.test(clean)) {
        if (!detectedOrder) detectedOrder = clean;
      } else if (!detectedResi && clean.length >= 8) {
        detectedResi = clean;
      }
    }
  }

  // 4. DETEKSI KURIR & MARKETPLACE
  const lowerText = text.toLowerCase();
  if (/spx|shopee\s*xpress/i.test(text) || detectedResi.startsWith('SPX')) {
    detectedKurir = 'Shopee Xpress (SPX)';
    detectedMp = 'Shopee';
  } else if (/j&t|jet\s*express/i.test(text) || detectedResi.startsWith('JY') || detectedResi.startsWith('JX')) {
    detectedKurir = 'J&T Express';
  } else if (/sicepat/i.test(text)) {
    detectedKurir = 'SiCepat';
  } else if (/jne/i.test(text)) {
    detectedKurir = 'JNE Express';
  }

  if (lowerText.includes('shopee') && !detectedMp) detectedMp = 'Shopee';
  if ((lowerText.includes('tiktok') || /5[78][0-9]{15,18}/.test(detectedOrder)) && !detectedMp) {
    detectedMp = 'TikTok Shop';
  }

  // 5. PENGIRIM / NAMA TOKO
  const pengirimMatch = text.match(/Pengirim\s*[:=\-]?\s*([^\n\r,]+)/i);
  if (pengirimMatch) {
    detectedStore = pengirimMatch[1].trim();
  }

  return {
    noPesanan: detectedOrder,
    noResi: detectedResi,
    kurir: detectedKurir,
    marketplace: detectedMp,
    storeName: detectedStore,
    produkList: [],
  };
}

/**
 * Pemindai Barcode / QR Code dari Image Element
 */
export async function scanBarcodesFromImage(imageEl: HTMLImageElement): Promise<string[]> {
  const detected: string[] = [];
  try {
    if ('BarcodeDetector' in window) {
      // @ts-ignore
      const barcodeDetector = new window.BarcodeDetector({
        formats: ['code_128', 'code_39', 'qr_code', 'ean_13', 'itf', 'data_matrix'],
      });
      const results = await barcodeDetector.detect(imageEl);
      for (const res of results) {
        if (res.rawValue) detected.push(res.rawValue);
      }
    }
  } catch (e) {
    console.warn('Native BarcodeDetector unsupported or error:', e);
  }
  return detected;
}

/**
 * Optimasi Gambar untuk OCR & Canvas Preview
 */
export function createOcrOptimizedImage(
  img: HTMLImageElement,
  maxDimension = 1600
): { ocrDataUrl: string; previewDataUrl: string } {
  const canvas = document.createElement('canvas');
  let { width, height } = img;

  if (width > maxDimension || height > maxDimension) {
    if (width > height) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    } else {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }
  }

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(img, 0, 0, width, height);
  }

  const previewDataUrl = canvas.toDataURL('image/jpeg', 0.85);
  const ocrDataUrl = canvas.toDataURL('image/png');
  return { ocrDataUrl, previewDataUrl };
}

/**
 * Render dan ekstrak teks + barcode dari File PDF Resi
 */
export async function extractAndRenderPdfFile(file: File): Promise<{
  text: string;
  previewDataUrl: string;
  barcodes: string[];
}> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);

  // 1. Ekstrak teks langsung dari PDF stream
  const textContent = await page.getTextContent();
  const text = textContent.items
    .map((item: any) => ('str' in item ? item.str : ''))
    .join(' ');

  // 2. Render halaman pertama ke canvas untuk preview dan barcode scan
  const viewport = page.getViewport({ scale: 2.0 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // @ts-ignore
    await page.render({ canvasContext: ctx, viewport }).promise;
  }

  const previewDataUrl = canvas.toDataURL('image/jpeg', 0.9);

  // Scan barcode dari canvas yang dirender
  const barcodes: string[] = [];
  try {
    if ('BarcodeDetector' in window) {
      // @ts-ignore
      const detector = new window.BarcodeDetector({
        formats: ['code_128', 'code_39', 'qr_code', 'ean_13'],
      });
      const results = await detector.detect(canvas);
      for (const res of results) {
        if (res.rawValue) barcodes.push(res.rawValue);
      }
    }
  } catch (err) {
    console.warn('Barcode scan on PDF canvas failed:', err);
  }

  return { text, previewDataUrl, barcodes };
}

/**
 * Jalankan Browser OCR menggunakan Tesseract.js
 */
export async function runBrowserOcr(
  imageDataUrl: string,
  onProgress?: (progressPct: number) => void,
  timeoutMs = 12000
): Promise<string> {
  const worker = await createWorker('ind+eng');
  try {
    const timer = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('OCR Timeout')), timeoutMs)
    );

    const ocrPromise = (async () => {
      const ret = await worker.recognize(imageDataUrl);
      if (onProgress) onProgress(100);
      return ret.data.text || '';
    })();

    const result = await Promise.race([ocrPromise, timer]);
    return result as string;
  } finally {
    await worker.terminate();
  }
}