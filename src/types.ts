export type UserRole = 'admin' | 'staff' | 'viewer';

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  createdAt: any;
  updatedAt: any;
}

export interface WorkspaceMember {
  uid: string;
  displayName: string;
  role: UserRole;
  workspaceId: string;
  addedByUid: string;
  createdAt: any;
  updatedAt: any;
}

export type MarketplaceType = 'Shopee' | 'Lazada' | 'Tokopedia/Tokped' | 'TikTok Shop' | 'Offline/Lainnya';

export type ShippingStatus = 'Package Sent' | 'Diproses' | 'Siap Kirim' | 'Retur' | 'Dibatalkan';

export type DisbursementStatus = 'Sudah cair' | 'Belum cair' | 'Retur';

export interface OrderRecord {
  id: string;
  workspaceId: string;
  orderDate: string; // YYYY-MM-DD
  storeName: string;
  marketplace: MarketplaceType;
  courier?: string; // Kurir Ekspedisi (J&T, Shopee Xpress, SiCepat, dll)
  ownerName?: string; // Pemilik Toko (otomatis dari nama toko, dapat diedit manual)
  drivePrintUrl: string; // Link Drive Cetak Label / Resi
  resiFileData?: string; // DataURL gambar/file resi yang diunggah untuk dicetak langsung
  resiFileName?: string; // Nama file resi yang diunggah
  productsSold: string; // Nama Produk Herbal
  quantity: number;
  checklistComplete: boolean; // Checklist packing
  shippingStatus: ShippingStatus;
  noPemesanan: string; // No Pesanan / Order ID
  noResi?: string; // No Resi Ekspedisi
  keterangan?: string; // Keterangan tambahan
  dropoffDate: string; // Tanggal Dropoff / Kirim
  notes: string;
  disbursementDate: string; // Tanggal pencairan dana marketplace
  disbursedToBri: boolean; // Masuk ke rekening BRI
  disbursementStatus: DisbursementStatus;
  disbursementProof: string; // Link Google Drive / No ref bukti pencairan BRI
  disbursementProofData?: string; // Preview file bukti pencairan BRI
  disbursementProofFileName?: string; // Nama file bukti pencairan BRI
  verifiedCheck: boolean; // Verifikasi final admin
  authorId: string;
  updatedByName: string;
  createdAt: any;
  updatedAt: any;
}

export interface StockItem {
  id: string;
  workspaceId: string;
  sku: string;
  productName: string;
  category: string;
  stockIn: number; // Stok Masuk Kumulatif
  stockOut: number; // Stok Keluar Kumulatif
  stockReady: number; // Stok Siap = stockIn - stockOut
  minThreshold: number; // Batas Minimum Otomatis
  expTercepat?: string; // Exp Tercepat (YYYY-MM)
  expTerlama?: string; // Exp Terlama (YYYY-MM)
  unit: string; // Botol / Box / Pcs
  lastRestockDate: string;
  authorId: string;
  updatedByName: string;
  createdAt: any;
  updatedAt: any;
}

export interface ActivityLog {
  id: string;
  workspaceId: string;
  category: 'order' | 'stock' | 'access';
  actionTitle: string;
  detail: string;
  actorUid: string;
  actorName: string;
  actorRole: UserRole;
  createdAt: any;
}

export interface NaturindoProductPreset {
  sku: string;
  name: string;
  category: string;
  defaultStock: number;
  defaultMinThreshold: number;
  description: string;
}

// Daftar resmi 48 produk herbal Sentra Naturindo (Reguler, Premium, GO) terurut A-Z beserta Stok Real
const RAW_NATURINDO_CATALOG: NaturindoProductPreset[] = [
  { sku: 'NAT-AZZ-01', name: 'Azzahra', category: 'Kewanitaan & Rahim', defaultStock: 0, defaultMinThreshold: 3, description: 'Perawatan organ kewanitaan, haid tidak teratur & keputihan' },
  { sku: 'NAT-AZZ-PRM', name: 'Azzahra Premium', category: 'Kewanitaan & Rahim (Premium)', defaultStock: 10, defaultMinThreshold: 3, description: 'Formula ekstrak premium perawatan kewanitaan & kesuburan' },
  { sku: 'NAT-BLP-01', name: 'Biolipid', category: 'Kolesterol & Trigliserida', defaultStock: 0, defaultMinThreshold: 3, description: 'Menormalkan kadar kolesterol jahat dan lemak darah' },
  { sku: 'NAT-BLP-PRM', name: 'Biolipid Premium', category: 'Kolesterol & Trigliserida (Premium)', defaultStock: 5, defaultMinThreshold: 3, description: 'Formula premium penurun kolesterol & plak pembuluh darah' },
  { sku: 'NAT-BRN-01', name: 'Brainovit', category: 'Nutrisi Otak & Daya Ingat', defaultStock: 0, defaultMinThreshold: 3, description: 'Meningkatkan konsentrasi, daya ingat & sirkulasi otak' },
  { sku: 'NAT-BRN-PRM', name: 'Brainovit Premium', category: 'Nutrisi Otak & Daya Ingat (Premium)', defaultStock: 12, defaultMinThreshold: 3, description: 'Formula premium nutrisi saraf otak, fokus & daya ingat' },
  { sku: 'NAT-BCF-01', name: 'Bronc Fit', category: 'Pernafasan & Paru-Paru', defaultStock: 0, defaultMinThreshold: 3, description: 'Meredakan batuk, asma, bronkitis & membersihkan paru-paru' },
  { sku: 'NAT-BCF-PRM', name: 'Bronc Fit Premium', category: 'Pernafasan & Paru-Paru (Premium)', defaultStock: 9, defaultMinThreshold: 3, description: 'Formula premium pelega pernafasan, paru-paru & batuk menahun' },
  { sku: 'NAT-BVF-01', name: 'BV. Flow', category: 'Sirkulasi & Pembuluh Darah', defaultStock: 0, defaultMinThreshold: 3, description: 'Melancarkan peredaran darah dan mengatasi penyumbatan pembuluh' },
  { sku: 'NAT-BVF-PRM', name: 'BV. Flow Premium', category: 'Sirkulasi & Pembuluh Darah (Premium)', defaultStock: 10, defaultMinThreshold: 3, description: 'Formula premium pelancar sirkulasi darah & penyumbatan' },
  { sku: 'NAT-CBN-01', name: 'Cabone', category: 'Tulang & Kalsium Alami', defaultStock: 0, defaultMinThreshold: 3, description: 'Mencegah osteoporosis, patah tulang & pengapuran sendi' },
  { sku: 'NAT-CBN-PRM', name: 'Cabone Premium', category: 'Tulang & Kalsium Alami (Premium)', defaultStock: 5, defaultMinThreshold: 3, description: 'Formula premium penguat kepadatan tulang & pemulihan patah tulang' },
  { sku: 'NAT-CRF-01', name: 'Carcinofit', category: 'Antioksidan, Kanker & Tumor', defaultStock: 0, defaultMinThreshold: 3, description: 'Pendamping terapi kanker, kista, miom & benjolan tumor' },
  { sku: 'NAT-CRF-PRM', name: 'Carcinofit Premium', category: 'Antioksidan, Kanker & Tumor (Premium)', defaultStock: 8, defaultMinThreshold: 3, description: 'Formula premium penghambat sel tumor, kista & benjolan' },
  { sku: 'NAT-CDF-01', name: 'Cardlafit', category: 'Jantung & Sirkulasi Koroner', defaultStock: 6, defaultMinThreshold: 3, description: 'Merawat kesehatan jantung koroner dan ritme detak jantung' },
  { sku: 'NAT-CSF-01', name: 'Carsifit', category: 'Stroke & Kelumpuhan Otot', defaultStock: 0, defaultMinThreshold: 3, description: 'Pemulihan pasca stroke, kelumpuhan otot & penyumbatan saraf' },
  { sku: 'NAT-CSF-PRM', name: 'Carsifit Premium', category: 'Stroke & Kelumpuhan Otot (Premium)', defaultStock: 8, defaultMinThreshold: 3, description: 'Formula premium rehabilitasi pasca stroke & penguat saraf motorik' },
  { sku: 'NAT-CYU-01', name: 'Cysto Up', category: 'Kista, Miom & Rahim', defaultStock: 0, defaultMinThreshold: 3, description: 'Terapi peluruh kista ovarium, miom rahim & benjolan' },
  { sku: 'NAT-CYU-PRM', name: 'Cysto Up Premium', category: 'Kista, Miom & Rahim (Premium)', defaultStock: 6, defaultMinThreshold: 3, description: 'Formula premium peluruh kista, miom & penyeimbang hormon' },
  { sku: 'NAT-FRH-01', name: 'Forheuma', category: 'Rematik & Nyeri Persendian', defaultStock: 3, defaultMinThreshold: 3, description: 'Mengatasi rematik, kram otot, linu & radang sendi' },
  { sku: 'NAT-FRH-GO', name: 'Forheuma GO', category: 'Rematik & Nyeri Persendian (GO)', defaultStock: 0, defaultMinThreshold: 3, description: 'Varian GO praktis pereda nyeri rematik, pegal linu & radang sendi' },
  { sku: 'NAT-GLU-01', name: 'Glucofit', category: 'Gula Darah & Diabetes', defaultStock: 3, defaultMinThreshold: 3, description: 'Menstabilkan kadar gula darah dan memperbaiki fungsi pankreas' },
  { sku: 'NAT-HMC-01', name: 'Hemo Care', category: 'Wasir & Ambeien', defaultStock: 0, defaultMinThreshold: 3, description: 'Mengecilkan benjolan ambeien/wasir dan melancarkan BAB' },
  { sku: 'NAT-HMC-PRM', name: 'Hemo Care Premium', category: 'Wasir & Ambeien (Premium)', defaultStock: 2, defaultMinThreshold: 3, description: 'Formula premium pereda benjolan wasir/ambeien & pendarahan' },
  { sku: 'NAT-HPF-01', name: 'Hepatifit', category: 'Hati, Liver & Hepatitis', defaultStock: 0, defaultMinThreshold: 3, description: 'Merawat fungsi organ hati, hepatitis & perlemakan liver' },
  { sku: 'NAT-HPF-PRM', name: 'Hepatifit Premium', category: 'Hati, Liver & Hepatitis (Premium)', defaultStock: 14, defaultMinThreshold: 3, description: 'Formula premium detoksifikasi liver, kuning & bengkak hati' },
  { sku: 'NAT-HBS-01', name: 'Herbaslim', category: 'Pelangsing & Lemak Perut', defaultStock: 5, defaultMinThreshold: 3, description: 'Membakar lemak tubuh berlebih dan melangsingkan perut alami' },
  { sku: 'NAT-HBS-GO', name: 'Herbaslim GO', category: 'Pelangsing & Lemak Perut (GO)', defaultStock: 20, defaultMinThreshold: 3, description: 'Varian GO praktis pembakar lemak & pengontrol berat badan' },
  { sku: 'NAT-HTF-01', name: 'Hitenfit', category: 'Hipertensi & Tekanan Darah', defaultStock: 0, defaultMinThreshold: 3, description: 'Menurunkan tensi tinggi dan merawat elastisitas dinding arteri' },
  { sku: 'NAT-HTF-GO', name: 'Hitenfit GO', category: 'Hipertensi & Tekanan Darah (GO)', defaultStock: 9, defaultMinThreshold: 3, description: 'Varian GO praktis penurun tekanan darah tinggi & kaku tengkuk' },
  { sku: 'NAT-JNT-01', name: 'Join Nature', category: 'Sendi, Lutut & Pengapuran', defaultStock: 4, defaultMinThreshold: 3, description: 'Membantu pelumas sendi lutut, osteoartritis & pengapuran tulang' },
  { sku: 'NAT-MTF-01', name: 'Met Fit', category: 'Metabolisme & Daya Tahan Tubuh', defaultStock: 1, defaultMinThreshold: 3, description: 'Mempercepat pemulihan tubuh dan memperkuat imunitas metabolisme' },
  { sku: 'NAT-MTF-GO', name: 'Met Fit GO', category: 'Metabolisme & Daya Tahan Tubuh (GO)', defaultStock: 4, defaultMinThreshold: 3, description: 'Varian GO praktis penjaga imunitas & pemulihan stamina harian' },
  { sku: 'NAT-MCF-01', name: 'Mucosafit', category: 'Lambung, Maag & GERD', defaultStock: 7, defaultMinThreshold: 3, description: 'Mengatasi asam lambung kronis, radang maag & luka tukak lambung' },
  { sku: 'NAT-MCF-PRM', name: 'Mucosafit Premium', category: 'Lambung, Maag & GERD (Premium)', defaultStock: 7, defaultMinThreshold: 3, description: 'Formula premium pelapis mukosa lambung, GERD & maag kronis' },
  { sku: 'NAT-OMG-01', name: 'Omega Capsul', category: 'Nutrisi Seluler & Omega', defaultStock: 6, defaultMinThreshold: 3, description: 'Kapsul nutrisi asam lemak esensial untuk otak, jantung & regenerasi sel' },
  { sku: 'NAT-POS-01', name: 'Pos-K', category: 'Kelenjar, Amandel & Bengkak', defaultStock: 0, defaultMinThreshold: 3, description: 'Meredakan radang amandel, kelenjar getah bening & radang otot' },
  { sku: 'NAT-POS-PRM', name: 'Pos-K Premium', category: 'Kelenjar, Amandel & Bengkak (Premium)', defaultStock: 8, defaultMinThreshold: 3, description: 'Formula premium kempes bengkak kelenjar, tiroid & radang amandel' },
  { sku: 'NAT-PRC-01', name: 'Pro Cela', category: 'Kulit, Alergi & Regenerasi Sel', defaultStock: 4, defaultMinThreshold: 3, description: 'Meremajakan sel kulit, mengatasi gatal alergi & eksim' },
  { sku: 'NAT-SYC-01', name: 'Soya Cair', category: 'Nutrisi Seluler & Fosfolipid Cair', defaultStock: 4, defaultMinThreshold: 3, description: 'Nutrisi lesitin kedelai cair untuk pemulihan sel, lambung & imunitas' },
  { sku: 'NAT-SMF-01', name: 'Staminofit', category: 'Stamina Pria & Vitalitas', defaultStock: 0, defaultMinThreshold: 3, description: 'Meningkatkan vitalitas pria dewasa dan kebugaran stamina' },
  { sku: 'NAT-SMF-GO', name: 'Staminofit GO', category: 'Stamina Pria & Vitalitas (GO)', defaultStock: 7, defaultMinThreshold: 3, description: 'Varian GO praktis pendongkrak energi, vitalitas & stamina pria' },
  { sku: 'NAT-STF-01', name: 'Stenosifit', category: 'Saraf Terjepit & Pinggang', defaultStock: 0, defaultMinThreshold: 3, description: 'Meredakan sakit pinggang, encok & cedera saraf tulang belakang' },
  { sku: 'NAT-STF-PRM', name: 'Stenosifit Premium', category: 'Saraf Terjepit & Pinggang (Premium)', defaultStock: 3, defaultMinThreshold: 3, description: 'Formula premium terapi saraf kejepit (HNP), boyok & tulang belakang' },
  { sku: 'NAT-UCF-01', name: 'Uricofit', category: 'Asam Urat & Nyeri Kaki', defaultStock: 6, defaultMinThreshold: 3, description: 'Meluruhkan kristal purin asam urat dan meredakan nyeri jempol' },
  { sku: 'NAT-URF-01', name: 'Urinofit', category: 'Batu Ginjal & Saluran Kemih', defaultStock: 6, defaultMinThreshold: 3, description: 'Meluruhkan batu ginjal dan mengatasi kencing keruh/batu' },
  { sku: 'NAT-URF-PRM', name: 'Urinofit Premium', category: 'Batu Ginjal & Saluran Kemih (Premium)', defaultStock: 6, defaultMinThreshold: 3, description: 'Formula premium peluruh batu ginjal, infeksi kemih & fungsi ginjal' },
  { sku: 'NAT-VRF-01', name: 'Vermifit', category: 'Migrain, Vertigo & Kepala', defaultStock: 8, defaultMinThreshold: 3, description: 'Meredakan vertigo berputar, migrain berdenyut & pusing tegang' },
];

export const NATURINDO_CATALOG: NaturindoProductPreset[] = [...RAW_NATURINDO_CATALOG].sort((a, b) =>
  a.name.localeCompare(b.name, 'id', { sensitivity: 'base' })
);

// Helper untuk membuat kode SKU otomatis dari nama produk
export function generateAutoSkuFromName(name: string): string {
  if (!name.trim()) return 'NAT-AUTO-01';
  const matching = NATURINDO_CATALOG.find(
    (c) => c.name.toLowerCase() === name.trim().toLowerCase()
  );
  if (matching) return matching.sku;

  const clean = name.trim().replace(/[^a-zA-Z0-9\s]/g, '');
  const words = clean.split(/\s+/).filter(Boolean);
  const lastWord = words[words.length - 1]?.toUpperCase() || '';
  const suffix =
    lastWord === 'PREMIUM' ? 'PRM' : lastWord === 'GO' ? 'GO' : '01';

  let code = '';
  if (words.length >= 2 && (lastWord === 'PREMIUM' || lastWord === 'GO')) {
    code = words[0].substring(0, 3).toUpperCase();
  } else if (words.length >= 3) {
    code = (words[0][0] + words[1][0] + words[2][0]).toUpperCase();
  } else if (words.length === 2) {
    code = (words[0].substring(0, 2) + words[1][0]).toUpperCase();
  } else if (words.length === 1) {
    code = words[0].substring(0, 3).toUpperCase();
  } else {
    code = 'PRD';
  }
  return `NAT-${code.padEnd(3, 'X')}-${suffix}`;
}

// Helper untuk mengurai string "Produk A (2x), Produk B" menjadi array [{ name, qty }]
export function parseProductsSoldString(
  productsSold: string,
  fallbackTotalQty = 1
): { name: string; qty: number }[] {
  if (!productsSold || !productsSold.trim()) return [];

  const parts = productsSold
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  const parsed: { name: string; qty: number }[] = [];

  for (const part of parts) {
    // Match pattern like "Mucosafit Premium (2x)" or "Mucosafit (3)" or "Mucosafit 2x"
    const matchParen = part.match(/^(.*?)\s*\(\s*(\d+)\s*[xX]?\s*\)\s*$/);
    const matchTrailing = !matchParen ? part.match(/^(.*?)\s+(\d+)\s*[xX]\s*$/) : null;

    if (matchParen && matchParen[1]) {
      parsed.push({
        name: matchParen[1].trim(),
        qty: Math.max(1, parseInt(matchParen[2], 10) || 1),
      });
    } else if (matchTrailing && matchTrailing[1]) {
      parsed.push({
        name: matchTrailing[1].trim(),
        qty: Math.max(1, parseInt(matchTrailing[2], 10) || 1),
      });
    } else {
      parsed.push({
        name: part.trim(),
        qty: 1,
      });
    }
  }

  // If there is only 1 product in the order and no explicit (Nx) was written, use fallbackTotalQty
  if (parsed.length === 1 && !/\(\s*\d+\s*[xX]?\s*\)/.test(parts[0]) && fallbackTotalQty > 1) {
    parsed[0].qty = Math.max(1, Number(fallbackTotalQty) || 1);
  }

  return parsed;
}

// Daftar toko bawaan dari Google Sheet operasional Sentra Naturindo (terurut A-Z)
export const GSHEET_DEFAULT_STORES: string[] = [
  'Akar Sehat Naturindo',
  'Alamaya Shop',
  'Alami.in',
  'Bumi Sehat Mandiri',
  'Jamu Herbal LangitBumi',
  'Jamu Racikan Eyang',
  'Kedai Jamu Keluarga',
  'Sentra Naturindo Official',
  'Sentra Naturindo Tangerang',
];

// Pemilik toko resmi dari GSheet operasional Sentra Naturindo (terurut A-Z)
export const GSHEET_DEFAULT_OWNERS: string[] = [
  'Agnes',
  'Agung',
  'Alin',
  'Arum',
  'Manik',
  'Oky',
  'Rafi',
  'Yuli',
];

// Pemilik toko bawaan sesuai nama toko dari GSheet operasional (dapat diedit manual jika ada perbedaan)
export const DEFAULT_STORE_OWNER_MAP: Record<string, string> = {
  'Sentra Naturindo Official': 'Agung',
  'Sentra Naturindo Tangerang': 'Agung',
  'Sentra Naturindo': 'Agung',
  'Bumi Sehat Mandiri': 'Yuli',
  'Bumi Sehat': 'Yuli',
  'Jamu Herbal LangitBumi': 'Arum',
  'LangitBumi': 'Arum',
  'Langit Bumi': 'Arum',
  'Jamu Racikan Eyang': 'Oky',
  'Racikan Eyang': 'Oky',
  'Alami.in': 'Rafi',
  'Alami In': 'Rafi',
  'Alami': 'Rafi',
  'Akar Sehat Naturindo': 'Manik',
  'Akar Sehat': 'Manik',
  'Kedai Jamu Keluarga': 'Agnes',
  'Kedai Jamu': 'Agnes',
  'Alamaya Shop': 'Alin',
  'Alamaya': 'Alin',
};

/**
 * Mencari nama pemilik toko otomatis berdasarkan nama toko yang ada di GSheet:
 * 1. Cek kamus pemilik toko bawaan dari GSheet (cocok persis & variasi)
 * 2. Cek riwayat order sebelumnya untuk nama toko yang sama
 * 3. Fallback jika tidak ditemukan
 */
export function getDefaultOwnerForStore(
  storeName: string,
  existingOrders: { storeName: string; ownerName?: string }[] = []
): string {
  if (!storeName || !storeName.trim()) return '';

  const cleanStore = storeName.trim();
  const lowerStore = cleanStore.toLowerCase();

  // 1. Cek kamus pemilik toko bawaan GSheet (prioritas utama agar tepat seperti di spreadsheet)
  for (const [key, owner] of Object.entries(DEFAULT_STORE_OWNER_MAP)) {
    if (key.toLowerCase() === lowerStore) {
      return owner;
    }
  }

  // 2. Cek apakah ada toko bawaan GSheet yang cocok sebagian (contoh: "Akar Sehat" cocok dengan "Akar Sehat Naturindo")
  for (const [key, owner] of Object.entries(DEFAULT_STORE_OWNER_MAP)) {
    const kLow = key.toLowerCase();
    if (kLow.includes(lowerStore) || lowerStore.includes(kLow)) {
      return owner;
    }
  }

  // 3. Cek riwayat order sebelumnya yang memiliki pemilik toko
  for (const ord of existingOrders) {
    if (
      ord.storeName &&
      ord.storeName.trim().toLowerCase() === lowerStore &&
      ord.ownerName &&
      ord.ownerName.trim()
    ) {
      return ord.ownerName.trim();
    }
  }

  // 4. Default fallback jika toko baru belum terpetakan
  return 'Agung';
}

export interface DisbursementAgingInfo {
  days: number;
  isCair: boolean;
  hasDropoff: boolean;
  startDate: string;
  endDate: string;
  label: string;
}

/**
 * Menghitung lama proses pencairan dalam satuan HARI (bukan jam):
 * - Mulai dihitung sejak tanggal Drop Off (atau tanggal order jika belum drop off)
 * - Berhenti otomatis ketika status sudah cair atau bukti pencairan BRI sudah diunggah
 */
export function calculateDisbursementProcessDays(
  order: OrderRecord,
  todayString: string
): DisbursementAgingInfo {
  const isCair = Boolean(
    order.disbursedToBri ||
    order.disbursementStatus === 'Sudah cair' ||
    (order.disbursementProof && order.disbursementProof.trim().length > 0)
  );

  const startDate = order.dropoffDate || order.orderDate || todayString;
  const endDate = isCair ? (order.disbursementDate || todayString) : todayString;

  const sParts = startDate.split('-').map(Number);
  const eParts = endDate.split('-').map(Number);

  const startUtc = Date.UTC(sParts[0] || 2026, (sParts[1] || 1) - 1, sParts[2] || 1);
  const endUtc = Date.UTC(eParts[0] || 2026, (eParts[1] || 1) - 1, eParts[2] || 1);

  const diffMs = endUtc - startUtc;
  const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  let label = `${days} hari (Proses)`;
  if (isCair) {
    label = `${days} hari (Cair)`;
  } else if (!order.dropoffDate && order.shippingStatus !== 'Package Sent') {
    label = `${days} hari (Belum Dropoff)`;
  } else if (days === 0) {
    label = 'Hari ini (Proses)';
  }

  return {
    days,
    isCair,
    hasDropoff: Boolean(order.dropoffDate),
    startDate,
    endDate,
    label,
  };
}
