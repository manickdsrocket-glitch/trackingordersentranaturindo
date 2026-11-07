import {
  MarketplaceType,
  NATURINDO_CATALOG,
  GSHEET_DEFAULT_STORES,
} from '../types';

export interface ScannedResiResult {
  noPemesanan: string; // Primary Order ID (or Resi if Order ID is absent)
  noPesanan: string;   // Extracted Order ID / No. Pesanan / Invoice
  noResi: string;      // Extracted AWB / Tracking Number / No. Resi
  kurir: string;
  marketplace: MarketplaceType | '';
  storeName: string;
  produkList: { name: string; qty: number }[];
  rawText: string;
  source: 'barcode' | 'ai+ocr' | 'ocr' | 'ai' | 'pdf' | 'server-ocr' | 'gemini';
}

const KNOWN_FILENAME_PREFIXES =
  /^(IMG|DSC|PXL|Screenshot|Screen_Shot|WhatsApp|Photo|Image|CamScanner|image|scan|resi|label|sample)/i;

export function cleanCodeCandidate(raw: string): string {
  return raw
    .trim()
    .replace(/^[:#\uFF1A\-.\s(]+/, '')
    .replace(/[:.\s)]+$/, '')
    .toUpperCase();
}

export interface StoreMatcher {
  canonicalStore: string;
  owner: string;
  patterns: RegExp[];
}

export const STORE_MATCHERS: StoreMatcher[] = [
  {
    canonicalStore: 'Bumi Sehat Mandiri',
    owner: 'Yuli',
    patterns: [
      /\bbumi\s*sehat(?:\s*mandiri)?\b/i,
      /\bbumisehat\b/i,
      /\b(?:yuli|yu[li1]|yul1)\b/i,
      /\bbsm\b/i,
    ],
  },
  {
    canonicalStore: 'Jamu Herbal LangitBumi',
    owner: 'Arum',
    patterns: [
      /\b(?:jamu\s*herbal\s*)?langit\s*bumi\b/i,
      /\blangitbumi\b/i,
      /\b(?:arum|arun|arnm)\b/i,
    ],
  },
  {
    canonicalStore: 'Jamu Racikan Eyang',
    owner: 'Oky',
    patterns: [
      /\b(?:jamu\s*)?racikan\s*eyang\b/i,
      /\bracikaneyang\b/i,
      /\b(?:oky|oki|0ky|0ki)\b/i,
    ],
  },
  {
    canonicalStore: 'Alami.in',
    owner: 'Rafi',
    patterns: [
      /\balami[\s.]*in\b/i,
      /\b(?:rafi|raf1|raphi)\b/i,
      /\balami\b/i,
    ],
  },
  {
    canonicalStore: 'Akar Sehat Naturindo',
    owner: 'Manik',
    patterns: [
      /\bakar\s*sehat(?:\s*naturindo)?\b/i,
      /\bagar\s*sehat\b/i,
      /\bagarsehat\b/i,
      /\b(?:manik|man1k|namik)\b/i,
    ],
  },
  {
    canonicalStore: 'Kedai Jamu Keluarga',
    owner: 'Agnes',
    patterns: [
      /\bkedai\s*jamu(?:\s*keluarga)?\b/i,
      /\bkedaijamu\b/i,
      /\b(?:agnes|agne5|a9nes)\b/i,
    ],
  },
  {
    canonicalStore: 'Alamaya Shop',
    owner: 'Alin',
    patterns: [
      /\balamaya(?:\s*shop)?\b/i,
      /\b(?:alin|al1n|allin)\b/i,
    ],
  },
  {
    canonicalStore: 'Sentra Naturindo Tangerang',
    owner: 'Agung',
    patterns: [
      /\bsentra\s*naturindo\s*tangerang\b/i,
      /\bjamu\s*herbal\s*tangerang\b/i,
      /\bnaturindo\s*tangerang\b/i,
    ],
  },
  {
    canonicalStore: 'Sentra Naturindo Official',
    owner: 'Agung',
    patterns: [
      /\bsentra\s*naturindo(?:\s*official)?\b/i,
      /\bsentranaturindo\b/i,
      /\b(?:agung|a9ung|agvng)\b/i,
    ],
  },
];

/**
 * Find Shopee 14-character Order ID (YYMMDD + 8 alphanumeric chars, e.g. 251010P1QW3N4G or 2510251FA3MDT3)
 * Supports spaces, dashes, parentheses, colons, and OCR character errors
 */
export function findShopeeOrderId(text: string): string {
  // 1. Explicit inside parentheses: (251010P1QW3N4G) or (2510251FA3MDT3) or (251025-72U9G0B7)
  const parenMatch = text.match(/\(\s*([0-9A-Z]{6}[\s\-]?[0-9A-Z]{7,10})\s*\)/i);
  if (parenMatch && parenMatch[1]) {
    const cleaned = parenMatch[1].replace(/[\s\-]/g, '').toUpperCase();
    if (/^2[3-9]/.test(cleaned) && cleaned.length >= 13 && cleaned.length <= 16) {
      return cleaned;
    }
  }

  // 2. Explicit after "No. Pesanan" or "Order SN" or "Pesan:" or "Pesanan:" or "Order ID"
  const pesanMatch = text.match(
    /(?:no\.?\s*(?:pesanan|pemesanan|order)|order\s*(?:sn|id|no\.?)|nomor\s*pesanan|pesan)\s*[:#\uFF1A\-|=.]*\s*\(?\s*([0-9A-Z]{6}[\s\-]?[0-9A-Z]{7,10})\s*\)?/i
  );
  if (pesanMatch && pesanMatch[1]) {
    const cleaned = pesanMatch[1].replace(/[\s\-]/g, '').toUpperCase();
    if (/^2[3-9]/.test(cleaned) && cleaned.length >= 13 && cleaned.length <= 16) {
      return cleaned;
    }
  }

  // 3. Regex boundary match: 2[3-9] followed by month 01-12, day 01-31, optional separator, 8-10 alphanumeric
  const explicitMatch = text.match(/\b(2[3-9](?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[\s\-]?[A-Z0-9]{8,10})\b/i);
  if (explicitMatch && explicitMatch[1]) {
    const cleaned = explicitMatch[1].replace(/[\s\-]/g, '').toUpperCase();
    if (cleaned.length >= 14 && cleaned.length <= 16) {
      return cleaned;
    }
  }

  // 4. Token scan with OCR character error correction (O->0, I/L->1, S->5, B->8 in date prefix)
  const tokens = text.split(/[\s,;()[\]"'|:]+/);
  for (const rawToken of tokens) {
    const token = rawToken.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (token.length >= 14 && token.length <= 16) {
      const prefix = token
        .slice(0, 6)
        .replace(/O/g, '0')
        .replace(/[IL]/g, '1')
        .replace(/Z/g, '2')
        .replace(/S/g, '5')
        .replace(/B/g, '8');
      const suffix = token.slice(6);
      if (/^2[3-9](?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])$/.test(prefix)) {
        if (/^[A-Z0-9]{8,10}$/.test(suffix)) {
          return prefix + suffix;
        }
      }
    }
  }
  return '';
}

/**
 * Parse raw OCR / PDF / Barcode text to extract Indonesian marketplace Order ID, Resi, Courier, Store, and Products
 */
export function parseResiText(
  rawText: string,
  barcodes: string[] = [],
  fileName = ''
): Omit<ScannedResiResult, 'source'> {
  // Normalize spaced-out PDF kerning anomalies such as "TS A-80184730404" -> "TSA-80184730404"
  const normalizedRaw = rawText
    .replace(/\bTS\s+A\s*-\s*(\d{9,14})\b/gi, 'TSA-$1')
    .replace(/\bLX\s*AD\s*-\s*(\d{8,14})\b/gi, 'LXAD-$1')
    .replace(/\bSPX\s*ID\s*([0-9A-Z]{9,16})\b/gi, 'SPXID$1');

  const combinedText = [barcodes.join('\n'), normalizedRaw].filter(Boolean).join('\n');
  const despacedText = combinedText.replace(/\s+/g, '');
  const lines = combinedText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let noPesanan = '';
  let noResi = '';
  let kurir = '';
  let marketplace: MarketplaceType | '' = '';
  let storeName = '';

  // 1. Check barcodes first — Barcodes on labels are 100% exact!
  for (const bc of barcodes) {
    const code = cleanCodeCandidate(bc);
    if (!code || code.length < 7) continue;

    const shopeeOrd = findShopeeOrderId(code);
    if (shopeeOrd && !noPesanan) {
      noPesanan = shopeeOrd;
      if (!marketplace) marketplace = 'Shopee';
      continue;
    }

    if (/^5[78]\d{15,19}$/.test(code) && !noPesanan) {
      noPesanan = code;
      if (!marketplace) marketplace = 'TikTok Shop';
      continue;
    }

    if (/^INV\//i.test(code) && !noPesanan) {
      noPesanan = code;
      if (!marketplace) marketplace = 'Tokopedia/Tokped';
      continue;
    }

    if (/^(SPXID[0-9A-Z]{8,16}|ID[0-9]{12,15}[A-Z0-9]*)$/.test(code)) {
      noResi = code;
      if (!kurir) kurir = 'Shopee Xpress (SPX)';
      if (!marketplace) marketplace = 'Shopee';
    } else if (/^(JX|JP|JT|JB|JO|JD)[0-9]{9,13}$/.test(code)) {
      noResi = code;
      if (!kurir) kurir = 'J&T Express';
    } else if (/^(00[0-9]{10,12}|TKSC[0-9A-Z]{8,14})$/.test(code)) {
      noResi = code;
      if (!kurir) kurir = 'SiCepat';
    } else if (/^(1000[0-9]{10,12}|T[SA]\-?[0-9]{9,14})$/.test(code)) {
      noResi = code;
      if (!kurir) kurir = 'Anteraja';
    } else if (/^(NLIDAP|NVID|SHP|TOK|NJA)[0-9A-Z]{8,16}$/.test(code)) {
      noResi = code;
      if (!kurir) kurir = 'Ninja Xpress';
    } else if (/^(LXAD|LEX|JNAP)\-?[0-9A-Z]{8,16}$/.test(code)) {
      noResi = code;
      if (!marketplace && code.startsWith('LX')) marketplace = 'Lazada';
      if (!kurir && code.startsWith('LX')) kurir = 'Lazada Express (LEX)';
    } else if (/^(IDE|IDM)[0-9]{10,15}$/.test(code)) {
      noResi = code;
      if (!kurir) kurir = 'ID Express';
    } else if (/^LP[0-9]{10,15}$/.test(code)) {
      noResi = code;
      if (!kurir) kurir = 'Lion Parcel';
    } else if (/^[234]\d{14,15}$/.test(code) && !noPesanan) {
      noPesanan = code;
    } else if (!noResi && /^[A-Z0-9\-]{9,24}$/.test(code) && /\d{4,}/.test(code)) {
      noResi = code;
    }
  }

  // 2. Explicit Label Matching for No. Pesanan / Order ID / Invoice across lines
  const orderLabelRegex =
    /(?:no\.?\s*(?:pesanan|pemesanan|order|invoice|transaksi)|nomor\s*(?:pesanan|pemesanan|order)|order\s*(?:id|no|number|#)|id\s*pesanan|kode\s*(?:pesanan|booking|order)|pesan)\s*[:#\uFF1A\-=|.]*\s*([A-Z0-9\/\-]{8,30})/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(orderLabelRegex);
    if (match && match[1]) {
      const candidate = cleanCodeCandidate(match[1]);
      if (
        candidate.length >= 8 &&
        /\d{2,}/.test(candidate) &&
        !/^(PENGIRIM|PENERIMA|ALAMAT|PRODUK|KURIR|BERAT|COD|NON|TUNAI|SHOPEE|TIKTOK|LAZADA|TOKOPEDIA|ESTIMATED|SELLER|BUYER)$/i.test(
          candidate
        )
      ) {
        if (!noPesanan) noPesanan = candidate;
      }
    } else if (
      /(?:no\.?\s*(?:pesanan|pemesanan|order|invoice|transaksi)|nomor\s*(?:pesanan|pemesanan|order)|order\s*(?:id|no|number|#)|id\s*pesanan|kode\s*(?:pesanan|order)|pesan)\s*[:#\uFF1A\-|=]?\s*$/i.test(
        line
      )
    ) {
      for (let offset = 1; offset <= 3 && i + offset < lines.length; offset++) {
        const candidateLine = lines[i + offset];
        const tokens = candidateLine.split(/[\s|:()\[\]#]+/).filter(Boolean);
        for (const t of tokens) {
          const cand = cleanCodeCandidate(t);
          if (
            cand.length >= 8 &&
            /\d{2,}/.test(cand) &&
            !/^(PENGIRIM|PENERIMA|ALAMAT|PRODUK|KURIR|BERAT|COD|NON|TUNAI|SHOPEE|TIKTOK|LAZADA|TOKOPEDIA|SELLER|BUYER)$/i.test(
              cand
            )
          ) {
            if (!noPesanan) {
              noPesanan = cand;
              break;
            }
          }
        }
        if (noPesanan) break;
      }
    }
  }

  // 3. Explicit Label Matching for No. Resi / Tracking Number / AWB
  const resiLabelRegex =
    /(?:no\.?\s*resi|nomor\s*resi|n[o0]\.?\s*resi|resi|tracking\s*(?:no|number|id|#)?|awb|airway\s*bill|kode\s*booking)\s*[:#\uFF1A\-=;.]*\s*([A-Z0-9\-]{8,28})/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(resiLabelRegex);
    if (match && match[1]) {
      const candidate = cleanCodeCandidate(match[1]);
      if (
        candidate.length >= 8 &&
        /\d{3,}/.test(candidate) &&
        !/^(PENGIRIM|PENERIMA|OTOMATIS|EKSPEDISI|KURIR|PESANAN)$/i.test(candidate)
      ) {
        if (!noResi) noResi = candidate;
      }
    } else if (
      /(?:no\.?\s*resi|nomor\s*resi|no\s*tracking|awb)\s*[:#\uFF1A\-]?\s*$/i.test(line) &&
      i + 1 < lines.length
    ) {
      const nextToken = cleanCodeCandidate(lines[i + 1].split(/\s+/)[0] || '');
      if (nextToken.length >= 8 && /\d{3,}/.test(nextToken)) {
        if (!noResi) noResi = nextToken;
      }
    }
  }

  // 4. Structural Pattern Matching across full text for Order IDs
  if (!noPesanan) {
    const shopeeId = findShopeeOrderId(combinedText);
    if (shopeeId) {
      noPesanan = shopeeId;
      if (!marketplace) marketplace = 'Shopee';
    }
  }

  if (!noPesanan) {
    const tiktokMatch = combinedText.match(/\b(5[78]\d{15,18})\b/);
    if (tiktokMatch) {
      noPesanan = tiktokMatch[1];
      if (!marketplace) marketplace = 'TikTok Shop';
    }
  }

  if (!noPesanan) {
    const tokpedMatch = combinedText.match(/\b(INV\/\d{8,14}\/[A-Z0-9\/]+)\b/i);
    if (tokpedMatch) {
      noPesanan = tokpedMatch[1].toUpperCase();
      if (!marketplace) marketplace = 'Tokopedia/Tokped';
    }
  }

  if (!noPesanan) {
    const lazadaMatch = combinedText.match(/\b(4\d{13,16})\b/);
    if (lazadaMatch) {
      noPesanan = lazadaMatch[1];
      if (!marketplace) marketplace = 'Lazada';
    }
  }

  // 5. Structural Resi Number Matching (Prefix-based)
  const resiPatterns: { regex: RegExp; courier?: string; mp?: MarketplaceType }[] = [
    { regex: /\b(SPXID[0-9A-Z]{9,16})\b/i, courier: 'Shopee Xpress (SPX)', mp: 'Shopee' },
    { regex: /\b(JX[0-9]{9,12})\b/i, courier: 'J&T Express' },
    { regex: /\b(JP[0-9]{9,12})\b/i, courier: 'J&T Express' },
    { regex: /\b(JT[0-9]{9,12})\b/i, courier: 'J&T Express' },
    { regex: /\b(JB[0-9]{9,12})\b/i, courier: 'J&T Express' },
    { regex: /\b(JO[0-9]{9,12})\b/i, courier: 'J&T Express' },
    { regex: /\b(JD[0-9]{9,12})\b/i, courier: 'J&T Express' },
    { regex: /\b(00[0-9]{10,12})\b/, courier: 'SiCepat' },
    { regex: /\b(TKSC[0-9A-Z]{8,14})\b/i, courier: 'SiCepat' },
    { regex: /\b(1000[0-9]{10,12})\b/, courier: 'Anteraja' },
    { regex: /\b(TSA\-[0-9]{9,14})\b/i, courier: 'Anteraja' },
    { regex: /\b(NLIDAP[0-9A-Z]{8,14})\b/i, courier: 'Ninja Xpress' },
    { regex: /\b(NVID[0-9A-Z]{8,14})\b/i, courier: 'Ninja Xpress' },
    { regex: /\b(SHP[0-9A-Z]{8,14})\b/i, courier: 'Ninja Xpress' },
    { regex: /\b(LXAD\-[0-9A-Z]{8,14})\b/i, courier: 'Lazada Express (LEX)', mp: 'Lazada' },
    { regex: /\b(IDE[0-9]{10,14})\b/i, courier: 'ID Express' },
    { regex: /\b(LP[0-9]{10,14})\b/i, courier: 'Lion Parcel' },
  ];

  for (const pat of resiPatterns) {
    const m = combinedText.match(pat.regex);
    if (m && m[1]) {
      const candidate = m[1].toUpperCase();
      if (candidate !== noPesanan) {
        if (!noResi) noResi = candidate;
        if (pat.courier && !kurir) kurir = pat.courier;
        if (pat.mp && !marketplace) marketplace = pat.mp;
        break;
      }
    }
  }

  // 6. Check Filename if still missing Order ID / Resi
  if (!noPesanan && !noResi && fileName) {
    const baseName = fileName.replace(/\.[a-z0-9]+$/i, '').trim();
    if (!KNOWN_FILENAME_PREFIXES.test(baseName)) {
      const shopeeFromFile = findShopeeOrderId(baseName);
      if (shopeeFromFile) {
        noPesanan = shopeeFromFile;
      } else {
        const codeMatch = baseName.match(/\b([A-Z0-9\-]{9,24})\b/i);
        if (codeMatch && /\d{4,}/.test(codeMatch[1])) {
          noPesanan = codeMatch[1].toUpperCase();
        }
      }
    }
  }

  // 7. Detect Courier Name from Text & Resi Prefix
  if (!kurir) {
    if (
      /\b(?:spx|shopee\s*xpress|shopee\s*express|spx\s*express|spx\s*id|standar\s*express|standard\s*express)\b/i.test(combinedText) ||
      /\bspxid/i.test(combinedText) ||
      (/^SPXID/i.test(noResi))
    ) {
      kurir = 'Shopee Xpress (SPX)';
      if (!marketplace) marketplace = 'Shopee';
    } else if (
      /\bj\s*&\s*t\s*cargo|jnt\s*cargo\b/i.test(combinedText)
    ) {
      kurir = 'J&T Cargo';
    } else if (
      /\b(?:j\s*&\s*t|jnt|jet\s*express|j&t\s*express|jet\.co\.id)\b/i.test(combinedText) ||
      (/^(JX|JP|JT|JB|JO|JD)[0-9]{8,14}$/i.test(noResi)) ||
      (/\b(?:EZ|ECO|SUPER|DFOD)\b/i.test(combinedText) && /\b(?:j\s*&\s*t|jnt|drop\s*off)\b/i.test(combinedText))
    ) {
      kurir = 'J&T Express';
    } else if (
      /\b(?:sicepat|si\s*cepat|halu|gokil|siuntung|sicepat\s*ekspres)\b/i.test(combinedText) ||
      (/^00[0-9]{10,12}$/.test(noResi)) ||
      (/^TKSC/i.test(noResi))
    ) {
      kurir = 'SiCepat';
    } else if (
      /\b(?:jne|jne\s*express|jalur\s*nugraha|jtr|reguler\s*jne)\b/i.test(combinedText)
    ) {
      kurir = 'JNE Express';
    } else if (
      /\b(?:anter\s*aja|anteraja)\b/i.test(combinedText) ||
      /\btsa\-/i.test(combinedText) ||
      (/^1000[0-9]{10,12}$/.test(noResi))
    ) {
      kurir = 'Anteraja';
    } else if (
      /\b(?:ninja\s*xpress|ninja\s*van|ninja)\b/i.test(combinedText) ||
      (/^(NLIDAP|NVID|SHP|TOK|NJA)/i.test(noResi))
    ) {
      kurir = 'Ninja Xpress';
    } else if (
      /\b(?:id\s*express|idexpress|\bide\b)\b/i.test(combinedText) ||
      (/^(IDE|IDM)/i.test(noResi))
    ) {
      kurir = 'ID Express';
    } else if (
      /\blion\s*parcel\b/i.test(combinedText) ||
      (/^LP/i.test(noResi))
    ) {
      kurir = 'Lion Parcel';
    } else if (
      /\b(?:pos\s*indonesia|pos\s*aja)\b/i.test(combinedText)
    ) {
      kurir = 'Pos Indonesia';
    } else if (
      /\bwahana\b/i.test(combinedText)
    ) {
      kurir = 'Wahana';
    } else if (
      /\b(?:gosend|go-send|gojek)\b/i.test(combinedText)
    ) {
      kurir = 'GoSend';
    } else if (
      /\b(?:grab\s*express|grab)\b/i.test(combinedText)
    ) {
      kurir = 'GrabExpress';
    } else if (
      /\b(?:lex\s*id|lazada\s*express|lex)\b/i.test(combinedText) ||
      (/^(LXAD|LEX)/i.test(noResi))
    ) {
      kurir = 'Lazada Express (LEX)';
      if (!marketplace) marketplace = 'Lazada';
    }
  }

  // 8. Detect Marketplace from Text & Order ID format
  if (!marketplace) {
    if (/shopee|spx|\bshp\d{9,}|\b2[4-9][01]\d[0-3]\d[A-Z0-9]{8}\b/i.test(combinedText)) {
      marketplace = 'Shopee';
    } else if (/lazada|lex\s*id|lxad\-/i.test(combinedText)) {
      marketplace = 'Lazada';
    } else if (/tokopedia|tokped|gotoko/i.test(combinedText)) {
      marketplace = 'Tokopedia/Tokped';
    } else if (/tiktok\s*shop|tiktok|\b5[78]\d{15,18}\b/i.test(combinedText)) {
      marketplace = 'TikTok Shop';
    }
  }

  // 9. Detect Store Name from STORE_MATCHERS (supports store aliases and real owner names like Yuli, Arum, Oky, etc.)
  const lowerDespaced = despacedText.toLowerCase();

  for (const matcher of STORE_MATCHERS) {
    for (const pat of matcher.patterns) {
      if (pat.test(combinedText)) {
        storeName = matcher.canonicalStore;
        break;
      }
    }
    if (storeName) break;
  }

  // Fallback to despaced matching on GSheet stores
  if (!storeName) {
    for (const st of GSHEET_DEFAULT_STORES) {
      const stDespaced = st.replace(/\s+/g, '').toLowerCase();
      if (
        combinedText.toLowerCase().includes(st.toLowerCase()) ||
        lowerDespaced.includes(stDespaced)
      ) {
        storeName = st;
        break;
      }
    }
  }

  // 10. Detect any of the 48 Naturindo Products mentioned on the label (longest names first so Premium/GO variants match before base names)
  const produkList: { name: string; qty: number }[] = [];
  const sortedCatalogByLength = [...NATURINDO_CATALOG].sort(
    (a, b) => b.name.length - a.name.length
  );

  for (const cat of sortedCatalogByLength) {
    const shortName = cat.name.split(' (')[0].trim();
    // Skip base name if a Premium or GO variant of the same base name already matched
    const alreadyMatchedVariant = produkList.some((p) =>
      p.name.toLowerCase().startsWith(shortName.toLowerCase() + ' ')
    );
    if (alreadyMatchedVariant) continue;

    const patternStr = shortName
      .replace(/\./g, '\\.?')
      .replace(/[-_]/g, '[\\s\\-_]*')
      .replace(/\s+/g, '[\\s\\-_]*');
    const prodRegex = new RegExp(`\\b${patternStr}\\b`, 'i');
    const despacedProd = shortName.replace(/[\s\-_.]/g, '').toLowerCase();

    if (prodRegex.test(combinedText) || lowerDespaced.includes(despacedProd)) {
      const explicitQtyRegex = new RegExp(
        `${patternStr}[\\s\\S]{0,100}?\\b([1-9][0-9]?)\\s*(?:pcs|botol|box|bh|unit)\\b`,
        'i'
      );
      const totalQtyMatch = combinedText.match(/Total\s*Qty\s*[:=-]?\s*([1-9][0-9]?)\b/i);
      const qtyMatch = combinedText.match(explicitQtyRegex);
      const parsedQty = qtyMatch?.[1]
        ? parseInt(qtyMatch[1], 10)
        : totalQtyMatch?.[1]
        ? parseInt(totalQtyMatch[1], 10)
        : 1;
      produkList.push({
        name: cat.name,
        qty: parsedQty > 0 && parsedQty <= 20 ? parsedQty : 1,
      });
    }
  }
  produkList.sort((a, b) => a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }));

  const noPemesanan = noPesanan || noResi || '';

  return {
    noPemesanan,
    noPesanan,
    noResi,
    kurir,
    marketplace,
    storeName,
    produkList,
    rawText: combinedText,
  };
}
