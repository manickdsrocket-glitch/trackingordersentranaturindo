import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import Tesseract from 'tesseract.js';
import { parseResiText } from './src/utils/resiParser';
import {
  GSHEET_DEFAULT_STORES,
  GSHEET_DEFAULT_OWNERS,
  DEFAULT_STORE_OWNER_MAP,
} from './src/types';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const normKey = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Cocokkan teks hasil scan ke nama toko resmi di GSheet (toleran huruf besar/kecil & variasi)
function matchStore(name: string): string {
  const n = normKey(name);
  if (n.length < 3) return '';
  for (const s of GSHEET_DEFAULT_STORES) {
    if (normKey(s) === n) return s;
  }
  for (const s of GSHEET_DEFAULT_STORES) {
    const ns = normKey(s);
    if (n.length >= 4 && (ns.includes(n) || n.includes(ns))) return s;
  }
  for (const key of Object.keys(DEFAULT_STORE_OWNER_MAP)) {
    const nk = normKey(key);
    if (nk.length >= 4 && n.includes(nk)) {
      return GSHEET_DEFAULT_STORES.find((s) => normKey(s).includes(nk)) || key;
    }
  }
  return '';
}

// Cocokkan teks hasil scan ke nama pemilik/pengirim resmi (Yuli, Arum, Oky, ...)
function matchOwner(name: string): string {
  const n = normKey(name);
  if (n.length < 3) return '';
  for (const o of GSHEET_DEFAULT_OWNERS) {
    const no = normKey(o);
    if (no === n || n.includes(no)) return o;
  }
  return '';
}

// Tentukan nilai akhir kolom "Toko" dan "Pengirim/Pemilik"
function resolveStoreAndOwner(parserStore: string, aiToko: string, aiPengirim: string) {
  const store =
    matchStore(parserStore) ||
    matchStore(aiToko) ||
    matchStore(aiPengirim) ||
    parserStore ||
    aiToko ||
    '';
  let owner = matchOwner(aiPengirim) || matchOwner(aiToko) || '';
  if (!owner && store) owner = DEFAULT_STORE_OWNER_MAP[store] || '';
  if (!owner) owner = aiPengirim || '';
  return { store, owner };
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  // Enable CORS so Firebase Hosting (ordertracking-223b6.web.app) can also call this endpoint
  app.use(cors());

  // Body parser with support for base64 shipping label images
  app.use(express.json({ limit: '25mb' }));

  // API: Scan shipping label / resi image (Gemini AI -> Node Tesseract OCR fallback)
  app.post('/api/scan-resi', async (req, res) => {
    try {
      const { imageBase64, mimeType = 'image/jpeg', fileName = '' } = req.body;
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        return res.status(400).json({ error: 'Data gambar resi tidak ditemukan.' });
      }

      // Robustly extract MIME type and clean base64 data
      let detectedMime = (mimeType || 'image/jpeg').toLowerCase();
      let cleanBase64 = imageBase64.trim();

      if (cleanBase64.includes(';base64,')) {
        const [meta, rawBase64] = cleanBase64.split(';base64,');
        cleanBase64 = rawBase64 || '';
        const match = meta.match(/data:([^;]+)/i);
        if (match && match[1]) {
          detectedMime = match[1].trim().toLowerCase();
        }
      } else if (cleanBase64.startsWith('data:')) {
        const commaIdx = cleanBase64.indexOf(',');
        if (commaIdx !== -1) {
          const meta = cleanBase64.slice(0, commaIdx);
          cleanBase64 = cleanBase64.slice(commaIdx + 1);
          const match = meta.match(/data:([^;]+)/i);
          if (match && match[1]) {
            detectedMime = match[1].trim().toLowerCase();
          }
        }
      }

      // Strip whitespace and newlines from base64
      cleanBase64 = cleanBase64.replace(/[\r\n\s"']/g, '').trim();

      // Normalize MIME type supported by Gemini multimodal
      if (detectedMime.includes('pdf')) {
        detectedMime = 'application/pdf';
      } else if (detectedMime.includes('png')) {
        detectedMime = 'image/png';
      } else if (detectedMime.includes('webp')) {
        detectedMime = 'image/webp';
      } else if (detectedMime.includes('heic') || detectedMime.includes('heif')) {
        detectedMime = 'image/heic';
      } else {
        detectedMime = 'image/jpeg';
      }

      if (cleanBase64.length < 50) {
        return res.json({
          noPesanan: '',
          noResi: '',
          kurir: '',
          marketplace: '',
          namaToko: '',
        });
      }

      const apiKey = process.env.GEMINI_API_KEY;

      // 1. If Gemini API Key is available, try Gemini Multimodal AI
      if (apiKey) {
        try {
          const ai = new GoogleGenAI({
            apiKey,
            httpOptions: {
              headers: {
                'User-Agent': 'aistudio-build',
              },
            },
          });

          const prompt = `Baca gambar resi / label pengiriman / detail pesanan marketplace ini dengan teliti.
Ekstrak informasi berikut:
1. "noPesanan": Nomor Pesanan / Order ID / Nomor Invoice (contoh Shopee: 251024ABCDEFGH, TikTok: 579182736451827364, Tokopedia: INV/2025..., Lazada: 41234567890).
2. "noResi": Nomor Resi Ekspedisi / Tracking Number / AWB (contoh: SPXID05..., JX1234567890, JP..., 004..., 1000..., NLIDAP..., LXAD-...).
3. "kurir": Nama kurir ekspedisi (contoh: Shopee Xpress (SPX), J&T Express, SiCepat, JNE Express, Anteraja, Ninja Xpress, GoSend, Lazada Express (LEX)).
4. "marketplace": Shopee / TikTok Shop / Tokopedia/Tokped / Lazada.
5. "namaToko": Nama TOKO / nama akun penjual (store name) yang tertulis di resi atau detail pesanan (contoh: "Naturindo Official Store"). Jangan isi dengan nama orang.
6. "pengirim": Nama PENGIRIM (nama orang / pemilik pengirim di bagian "Pengirim" / "From" / "Dari", contoh: Yuli, Arum, Oky, Agung, Rafi, Manik, Agnes, Alin). Ini field TERPISAH dari "namaToko". Jika hanya ada satu nama, isi "pengirim" dan biarkan "namaToko" kosong jika memang tidak ada nama toko.
7. "produk": Nama produk herbal Naturindo yang dibeli jika tertulis di resi.

Daftar toko resmi: ${GSHEET_DEFAULT_STORES.join(', ')}.
Daftar pengirim/pemilik resmi: ${GSHEET_DEFAULT_OWNERS.join(', ')}.
Jika nama di resi mirip salah satu daftar di atas, tulis persis sesuai daftar tersebut.

Aturan: jangan menebak. Jika sebuah field tidak terlihat di gambar, isi dengan "" (string kosong). Salin nomor persis seperti tertulis tanpa spasi.

Kembalikan JSON murni:
{"noPesanan": "string", "noResi": "string", "kurir": "string", "marketplace": "string", "namaToko": "string", "pengirim": "string", "produk": "string"}`;

          // Give Gemini enough time (8s was too short for photos/PDF and silently pushed
          // every slow scan to the much weaker Tesseract fallback).
          let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
          const timeoutPromise = new Promise((_, reject) => {
            timeoutHandle = setTimeout(() => reject(new Error('AI scan timeout')), 30000);
          });

          const callModel = async () => {
            try {
              return await ai.models.generateContent({
                model: 'gemini-3.8-flash',
                contents: [
                  {
                    role: 'user',
                    parts: [
                      {
                        inlineData: {
                          mimeType: detectedMime,
                          data: cleanBase64,
                        },
                      },
                      { text: prompt },
                    ],
                  },
                ],
                config: {
                  responseMimeType: 'application/json',
                  thinkingConfig: {
                    thinkingLevel: ThinkingLevel.LOW,
                  },
                },
              });
            } catch {
              return await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [
                  {
                    role: 'user',
                    parts: [
                      {
                        inlineData: {
                          mimeType: detectedMime,
                          data: cleanBase64,
                        },
                      },
                      { text: prompt },
                    ],
                  },
                ],
                config: {
                  responseMimeType: 'application/json',
                },
              });
            }
          };

          let response: any;
          try {
            response = await Promise.race([callModel(), timeoutPromise]);
          } finally {
            if (timeoutHandle) clearTimeout(timeoutHandle);
          }
          const responseText = response.text || '';
          const cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();

          let result: any = {};
          try {
            result = JSON.parse(cleanJson);
            // Gemini occasionally wraps the object in an array
            if (Array.isArray(result)) result = result[0] || {};
          } catch {
            const pick = (re: RegExp) => {
              const m = responseText.match(re);
              return m ? m[1].trim() : '';
            };
            result = {
              noPesanan:
                pick(/"?noPesanan"?\s*[:=]\s*"([^"]+)"/i) ||
                pick(/(?:pesanan|order|invoice)[:\s"]*([A-Z0-9\/\-]{8,30})/i),
              noResi:
                pick(/"?noResi"?\s*[:=]\s*"([^"]+)"/i) ||
                pick(/(?:resi|tracking|awb)[:\s"]*([A-Z0-9\-]{8,28})/i),
              kurir: pick(/"?kurir"?\s*[:=]\s*"([^"]+)"/i),
              marketplace: pick(/"?marketplace"?\s*[:=]\s*"([^"]+)"/i),
              namaToko: pick(/"?namaToko"?\s*[:=]\s*"([^"]+)"/i),
              pengirim: pick(/"?pengirim"?\s*[:=]\s*"([^"]+)"/i),
              produk: pick(/"?produk"?\s*[:=]\s*"([^"]+)"/i),
            };
          }

          const aiNoPesanan = String(result.noPesanan ?? '').trim();
          const aiNoResi = String(result.noResi ?? '').trim();
          const aiToko = String(result.namaToko ?? '').trim();
          const aiPengirim = String(result.pengirim ?? '').trim();

          // Pass combined AI response through parser to ensure store name is mapped to canonical GSheet store
          const aiCombined = [
            aiNoPesanan ? `No. Pesanan: ${aiNoPesanan}` : '',
            aiNoResi ? `No. Resi: ${aiNoResi}` : '',
            result.kurir || '',
            result.marketplace || '',
            aiPengirim || aiToko ? `Pengirim: ${aiPengirim || aiToko}` : '',
            result.produk || '',
          ].join('\n');
          const normalized = parseResiText(aiCombined, [], fileName);

          if (aiNoPesanan || aiNoResi || aiToko || aiPengirim || normalized.noPesanan || normalized.storeName) {
            const noPesanan = aiNoPesanan || normalized.noPesanan || '';
            const { store: namaToko, owner: pengirim } = resolveStoreAndOwner(
              normalized.storeName || '',
              aiToko,
              aiPengirim
            );
            const kurir = normalized.kurir || result.kurir || '';
            return res.json({
              noPesanan,
              noPemesanan: noPesanan, // alias: field name used in Firestore OrderRecord
              noResi: aiNoResi || normalized.noResi || '',
              kurir,
              courier: kurir, // alias: OrderRecord.courier
              marketplace: normalized.marketplace || result.marketplace || '',
              namaToko,
              storeName: namaToko, // alias: Firestore OrderRecord.storeName
              pengirim,
              ownerName: pengirim, // alias: Firestore OrderRecord.ownerName
              produk: (result.produk || '').trim(),
              produkItems: normalized.produkList,
              source: 'gemini',
            });
          }
        } catch (aiErr) {
          console.warn('Gemini AI scan failed, falling back to Node OCR:', aiErr);
        }
      }

      // 2. Fallback to local Node.js Tesseract OCR + Structural Regex Parser
      const imgBuffer = Buffer.from(cleanBase64, 'base64');
      const ocrResult = await Tesseract.recognize(imgBuffer, 'eng');
      const ocrText = ocrResult?.data?.text || '';

      const parsed = parseResiText(ocrText, [], fileName);

      const ocrResolved = resolveStoreAndOwner(parsed.storeName || '', '', '');
      return res.json({
        noPesanan: parsed.noPesanan,
        noPemesanan: parsed.noPesanan,
        noResi: parsed.noResi,
        kurir: parsed.kurir,
        courier: parsed.kurir,
        marketplace: parsed.marketplace,
        namaToko: ocrResolved.store,
        storeName: ocrResolved.store,
        pengirim: ocrResolved.owner,
        ownerName: ocrResolved.owner,
        produk: parsed.produkList
          .map((p) => (p.qty > 1 ? `${p.name} (${p.qty}x)` : p.name))
          .join(', '),
        produkItems: parsed.produkList,
        rawText: ocrText,
        source: 'node-ocr',
      });
    } catch (err: any) {
      console.warn('Server OCR error:', err);
      return res.json({
        noPesanan: '',
        noPemesanan: '',
        noResi: '',
        kurir: '',
        marketplace: '',
        namaToko: '',
        storeName: '',
        pengirim: '',
        ownerName: '',
        produk: '',
        error: err.message || 'Gagal memindai gambar',
      });
    }
  });

  // Vite development middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
