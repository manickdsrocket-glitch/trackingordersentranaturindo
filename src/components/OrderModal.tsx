import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  ShoppingBag,
  Check,
  AlertCircle,
  Upload,
  Camera,
  QrCode,
  Loader2,
  RotateCcw,
  Plus,
  Minus,
  Search,
  Printer,
  ExternalLink,
  FolderOpen,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAuth } from '../context/AuthContext';
import {
  OrderRecord,
  MarketplaceType,
  ShippingStatus,
  DisbursementStatus,
  NATURINDO_CATALOG,
  GSHEET_DEFAULT_STORES,
  GSHEET_DEFAULT_OWNERS,
  DEFAULT_STORE_OWNER_MAP,
  generateAutoSkuFromName,
  parseProductsSoldString,
  getDefaultOwnerForStore,
} from '../types';
import {
  parseResiText,
  scanBarcodesFromImage,
  createOcrOptimizedImage,
  extractAndRenderPdfFile,
  runBrowserOcr,
} from '../utils/resiScanner';
import {
  uploadResiToGoogleDrive,
  SENTRA_RESI_DRIVE_FOLDER_URL,
  SENTRA_RESI_DRIVE_FOLDER_ID,
} from '../utils/googleDriveUpload';
import { getGoogleAccessToken } from '../firebase';

interface OrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderToEdit?: OrderRecord;
}

const COMMON_COURIERS = [
  'J&T Express',
  'Shopee Xpress (SPX)',
  'SiCepat',
  'JNE Express',
  'Anteraja',
  'Ninja Xpress',
  'TikTok / J&T',
  'ID Express',
  'Lion Parcel',
  'J&T Cargo',
  'Wahana',
  'Pos Indonesia',
  'Kurir Toko / Ambil Sendiri',
];

export const OrderModal: React.FC<OrderModalProps> = ({
  isOpen,
  onClose,
  orderToEdit,
}) => {
  const { addOrder, updateOrder, orders, stocks, addStockItem } = useWorkspace();
  const { user, driveAccessToken, requestDriveAccessToken, clearDriveAccessToken } = useAuth();

  const safeOrders = Array.isArray(orders) ? orders : [];
  const safeStocks = Array.isArray(stocks) ? stocks : [];

  const safeResolveOwner = (store: string): string => {
    try {
      if (typeof getDefaultOwnerForStore === 'function') {
        const res = getDefaultOwnerForStore(store, safeOrders);
        if (res && typeof res === 'string') return res;
      }
    } catch {
      // ignore fallback error
    }
    if (DEFAULT_STORE_OWNER_MAP && typeof DEFAULT_STORE_OWNER_MAP === 'object') {
      const key = Object.keys(DEFAULT_STORE_OWNER_MAP).find(
        (k) => k.toLowerCase() === String(store || '').trim().toLowerCase()
      );
      if (key) return String((DEFAULT_STORE_OWNER_MAP as any)[key] || 'Agung');
    }
    return 'Agung';
  };

  const availableStores = useMemo(() => {
    const baseStores = Array.isArray(GSHEET_DEFAULT_STORES)
      ? GSHEET_DEFAULT_STORES
      : ['Sentra Naturindo Official'];
    const list = new Set<string>(baseStores);
    safeOrders.forEach((o) => {
      const val = String(o?.storeName ?? '').trim();
      if (val) {
        list.add(val);
      }
    });
    if (list.size === 0) {
      list.add('Sentra Naturindo Official');
    }
    return Array.from(list).sort((a, b) =>
      a.localeCompare(b, 'id', { sensitivity: 'base' })
    );
  }, [safeOrders]);

  const availableOwners = useMemo(() => {
    const baseOwners = Array.isArray(GSHEET_DEFAULT_OWNERS)
      ? GSHEET_DEFAULT_OWNERS
      : ['Agung'];
    const list = new Set<string>(baseOwners);
    if (DEFAULT_STORE_OWNER_MAP && typeof DEFAULT_STORE_OWNER_MAP === 'object') {
      Object.values(DEFAULT_STORE_OWNER_MAP).forEach((o) => {
        const val = String(o ?? '').trim();
        if (val) list.add(val);
      });
    }
    safeOrders.forEach((o) => {
      const val = String(o?.ownerName ?? '').trim();
      if (val) {
        list.add(val);
      }
    });
    if (list.size === 0) {
      list.add('Agung');
    }
    return Array.from(list).sort((a, b) =>
      a.localeCompare(b, 'id', { sensitivity: 'base' })
    );
  }, [safeOrders]);

  const todayStr = new Date().toISOString().split('T')[0];

  const [orderDate, setOrderDate] = useState(todayStr);
  const [storeName, setStoreName] = useState('Sentra Naturindo Official');
  const [ownerName, setOwnerName] = useState('Agung');
  const [isOwnerManuallyEdited, setIsOwnerManuallyEdited] = useState(false);
  const [isAddingNewStore, setIsAddingNewStore] = useState(false);
  const [isAddingNewOwner, setIsAddingNewOwner] = useState(false);
  const [marketplace, setMarketplace] = useState<MarketplaceType>('Shopee');
  const [noPemesanan, setNoPemesanan] = useState('');
  const [courier, setCourier] = useState('J&T Express');
  const [productsSold, setProductsSold] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [checklistComplete, setChecklistComplete] = useState<boolean>(false);
  const [shippingStatus, setShippingStatus] = useState<ShippingStatus>('Diproses');
  const [dropoffDate, setDropoffDate] = useState('');
  const [drivePrintUrl, setDrivePrintUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [disbursedToBri, setDisbursedToBri] = useState<boolean>(false);
  const [disbursementStatus, setDisbursementStatus] = useState<DisbursementStatus>('Belum cair');
  const [disbursementDate, setDisbursementDate] = useState('');
  const [disbursementProof, setDisbursementProof] = useState('');
  const [disbursementProofPreview, setDisbursementProofPreview] = useState<string | null>(null);
  const [disbursementProofFileName, setDisbursementProofFileName] = useState<string>('');
  const [rawBriProofFile, setRawBriProofFile] = useState<File | null>(null);
  const [uploadingBriToDrive, setUploadingBriToDrive] = useState<boolean>(false);
  const [briDriveError, setBriDriveError] = useState<string>('');
  const briFileInputRef = useRef<HTMLInputElement>(null);
  const [verifiedCheck, setVerifiedCheck] = useState<boolean>(false);

  interface SelectedProductItem {
    name: string;
    qty: number;
  }
  const [selectedItems, setSelectedItems] = useState<SelectedProductItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [stockNotice, setStockNotice] = useState('');

  const [isAddingNewProduct, setIsAddingNewProduct] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductStock, setNewProductStock] = useState<number>(10);
  const [addingNewProductSaving, setAddingNewProductSaving] = useState(false);

  const formatProductsSummary = (items: SelectedProductItem[]): string => {
    return items.map((item) => (item.qty > 1 ? `${item.name} (${item.qty}x)` : item.name)).join(', ');
  };

  const [uploadedImagePreview, setUploadedImagePreview] = useState<string | null>(null);
  const [resiFileName, setResiFileName] = useState<string>('');
  const [rawResiFile, setRawResiFile] = useState<File | null>(null);
  const [uploadingToDrive, setUploadingToDrive] = useState<boolean>(false);
  const [driveUploadError, setDriveUploadError] = useState<string>('');
  const [scanningResi, setScanningResi] = useState(false);
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [scanSuccessMessage, setScanSuccessMessage] = useState('');
  const [detectedOrderId, setDetectedOrderId] = useState('');
  const [detectedResiNo, setDetectedResiNo] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const validOrderToEdit = useMemo<OrderRecord | undefined>(() => {
    if (
      orderToEdit &&
      typeof orderToEdit === 'object' &&
      !('nativeEvent' in orderToEdit) &&
      ('id' in orderToEdit || 'storeName' in orderToEdit || 'noPemesanan' in orderToEdit)
    ) {
      return orderToEdit;
    }
    return undefined;
  }, [orderToEdit]);

  useEffect(() => {
    if (!isOpen) return;

    if (validOrderToEdit) {
      const editStore = String(validOrderToEdit.storeName || 'Sentra Naturindo Official');
      setOrderDate(String(validOrderToEdit.orderDate || todayStr));
      setStoreName(editStore);
      setOwnerName(String(validOrderToEdit.ownerName || safeResolveOwner(editStore)));
      setIsOwnerManuallyEdited(Boolean(validOrderToEdit.ownerName));
      setIsAddingNewStore(false);
      setIsAddingNewOwner(false);
      setMarketplace((validOrderToEdit.marketplace || 'Shopee') as MarketplaceType);
      setNoPemesanan(String(validOrderToEdit.noPemesanan || ''));
      setCourier(String(validOrderToEdit.courier || 'J&T Express'));
      const rawProducts = String(validOrderToEdit.productsSold || '').trim();
      const editQty = Number(validOrderToEdit.quantity) || 1;
      setProductsSold(rawProducts);
      setQuantity(editQty);
      setChecklistComplete(!!validOrderToEdit.checklistComplete);
      setShippingStatus((validOrderToEdit.shippingStatus || 'Diproses') as ShippingStatus);
      setDropoffDate(String(validOrderToEdit.dropoffDate || ''));
      setDrivePrintUrl(String(validOrderToEdit.drivePrintUrl || ''));
      setNotes(String(validOrderToEdit.notes || ''));
      setDisbursedToBri(!!validOrderToEdit.disbursedToBri);
      setDisbursementStatus((validOrderToEdit.disbursementStatus || 'Belum cair') as DisbursementStatus);
      setDisbursementDate(String(validOrderToEdit.disbursementDate || ''));
      setDisbursementProof(String(validOrderToEdit.disbursementProof || ''));
      setDisbursementProofPreview(validOrderToEdit.disbursementProofData || null);
      setDisbursementProofFileName(String(validOrderToEdit.disbursementProofFileName || ''));
      setVerifiedCheck(!!validOrderToEdit.verifiedCheck);
      setUploadedImagePreview(validOrderToEdit.resiFileData || null);
      setResiFileName(String(validOrderToEdit.resiFileName || ''));
      setDetectedOrderId(String(validOrderToEdit.noPemesanan || ''));
      setDetectedResiNo(String(validOrderToEdit.noResi || ''));

      try {
        const parsedFromOrder =
          typeof parseProductsSoldString === 'function'
            ? parseProductsSoldString(rawProducts, editQty)
            : [];
        if (Array.isArray(parsedFromOrder) && parsedFromOrder.length > 0) {
          setSelectedItems(parsedFromOrder);
        } else if (rawProducts) {
          setSelectedItems([{ name: rawProducts, qty: editQty }]);
        } else {
          setSelectedItems([]);
        }
      } catch {
        setSelectedItems(rawProducts ? [{ name: rawProducts, qty: editQty }] : []);
      }
    } else {
      const defaultStore = 'Sentra Naturindo Official';
      setOrderDate(todayStr);
      setStoreName(defaultStore);
      setOwnerName(safeResolveOwner(defaultStore));
      setIsOwnerManuallyEdited(false);
      setIsAddingNewStore(false);
      setIsAddingNewOwner(false);
      setMarketplace('Shopee');
      setNoPemesanan('');
      setCourier('J&T Express');
      setProductsSold('');
      setQuantity(1);
      setSelectedItems([]);
      setProductSearch('');
      setChecklistComplete(false);
      setShippingStatus('Diproses');
      setDropoffDate('');
      setDrivePrintUrl('');
      setNotes('');
      setDisbursedToBri(false);
      setDisbursementStatus('Belum cair');
      setDisbursementDate('');
      setDisbursementProof('');
      setDisbursementProofPreview(null);
      setDisbursementProofFileName('');
      setVerifiedCheck(false);
      setUploadedImagePreview(null);
      setResiFileName('');
      setDetectedOrderId('');
      setDetectedResiNo('');
    }
    setIsAddingNewProduct(false);
    setNewProductName('');
    setNewProductStock(10);
    setStockNotice('');
    setRawResiFile(null);
    setRawBriProofFile(null);
    setUploadingToDrive(false);
    setUploadingBriToDrive(false);
    setDriveUploadError('');
    setBriDriveError('');
    setScanSuccessMessage('');
    setScanProgress(0);
    setErrorMsg('');
  }, [validOrderToEdit, isOpen]);

  const unifiedCatalogWithStock = useMemo(() => {
    const map = new Map<
      string,
      {
        sku: string;
        name: string;
        category: string;
        stockReady: number;
        isCustomNew: boolean;
      }
    >();

    const safeCatalog = Array.isArray(NATURINDO_CATALOG) ? NATURINDO_CATALOG : [];
    for (const cat of safeCatalog) {
      const catName = String(cat?.name ?? '').trim();
      if (!catName) continue;
      map.set(catName.toLowerCase(), {
        sku: String(cat?.sku ?? 'NAT-AUTO'),
        name: catName,
        category: String(cat?.category ?? 'Herbal Naturindo'),
        stockReady: 0,
        isCustomNew: false,
      });
    }

    for (const s of safeStocks) {
      const cleanName = String(s?.productName ?? '').trim();
      if (!cleanName) continue;
      const key = cleanName.toLowerCase();
      const existing = map.get(key);
      const fallbackSku =
        typeof generateAutoSkuFromName === 'function'
          ? generateAutoSkuFromName(cleanName)
          : `NAT-${cleanName.slice(0, 3).toUpperCase()}-01`;

      map.set(key, {
        sku: String(s?.sku || existing?.sku || fallbackSku),
        name: existing?.name || cleanName,
        category: String(s?.category || existing?.category || 'Herbal Naturindo'),
        stockReady: Number(s?.stockReady) || 0,
        isCustomNew: !existing,
      });
    }

    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'id', { sensitivity: 'base' })
    );
  }, [safeStocks]);

  const outOfStockOrMinusCount = useMemo(
    () => unifiedCatalogWithStock.filter((p) => p.stockReady <= 0).length,
    [unifiedCatalogWithStock]
  );

  const filteredCatalog = useMemo(() => {
    if (!productSearch.trim()) return unifiedCatalogWithStock;
    const term = productSearch.toLowerCase().trim();
    return unifiedCatalogWithStock.filter(
      (cat) =>
        cat.name.toLowerCase().includes(term) ||
        cat.sku.toLowerCase().includes(term) ||
        cat.category.toLowerCase().includes(term)
    );
  }, [productSearch, unifiedCatalogWithStock]);

  const getAvailableStockForProduct = (productName: string): number => {
    const clean = String(productName ?? '').trim().toLowerCase();
    if (!clean) return 0;
    const cleanAlpha = clean.replace(/[^a-z0-9]/g, '');

    const found =
      unifiedCatalogWithStock.find((p) => p.name.toLowerCase() === clean) ||
      unifiedCatalogWithStock.find(
        (p) => p.name.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanAlpha
      ) ||
      unifiedCatalogWithStock.find(
        (p) =>
          clean.includes(p.name.toLowerCase()) ||
          p.name.toLowerCase().includes(clean)
      );

    return found ? Number(found.stockReady) || 0 : 0;
  };

  const handleToggleProduct = (productName: string) => {
    setStockNotice('');
    const availStock = getAvailableStockForProduct(productName);

    setSelectedItems((prev) => {
      const existsIndex = prev.findIndex(
        (p) => p.name.toLowerCase() === productName.toLowerCase()
      );
      let next: SelectedProductItem[];
      if (existsIndex >= 0) {
        const nextQty = prev[existsIndex].qty + 1;
        if (availStock - nextQty < 0) {
          setStockNotice(
            `Info: Stok ${productName} saat ini ${availStock} botol. Input tetap dilanjutkan (stok akan menjadi ${availStock - nextQty}).`
          );
        }
        next = prev.map((item, idx) =>
          idx === existsIndex ? { ...item, qty: nextQty } : item
        );
      } else {
        if (availStock <= 0) {
          setStockNotice(
            `Info: Stok ${productName} saat ini ${availStock} botol. Input tetap dilanjutkan (stok akan menjadi ${availStock - 1}).`
          );
        }
        next = [...prev, { name: productName, qty: 1 }];
      }

      setProductsSold(formatProductsSummary(next));
      setQuantity(next.reduce((acc, it) => acc + it.qty, 0));
      return next;
    });
  };

  const handleUpdateItemQty = (productName: string, delta: number) => {
    setStockNotice('');
    const availStock = getAvailableStockForProduct(productName);

    setSelectedItems((prev) => {
      const next = prev
        .map((p) => {
          if (p.name.toLowerCase() === productName.toLowerCase()) {
            const newQty = p.qty + delta;
            if (delta > 0 && availStock - newQty < 0) {
              setStockNotice(
                `Info: Stok ${productName} saat ini ${availStock} botol (stok akan menjadi ${availStock - newQty}).`
              );
            }
            return newQty > 0 ? { ...p, qty: newQty } : null;
          }
          return p;
        })
        .filter(Boolean) as SelectedProductItem[];

      if (next.length > 0) {
        setProductsSold(formatProductsSummary(next));
        setQuantity(next.reduce((acc, it) => acc + it.qty, 0));
      } else {
        setProductsSold('');
        setQuantity(1);
      }
      return next;
    });
  };

  const handleRemoveItem = (productName: string) => {
    setStockNotice('');
    setSelectedItems((prev) => {
      const next = prev.filter(
        (p) => p.name.toLowerCase() !== productName.toLowerCase()
      );
      if (next.length > 0) {
        setProductsSold(formatProductsSummary(next));
        setQuantity(next.reduce((acc, it) => acc + it.qty, 0));
      } else {
        setProductsSold('');
        setQuantity(1);
      }
      return next;
    });
  };

  const handleClearAllProducts = () => {
    setStockNotice('');
    setSelectedItems([]);
    setProductsSold('');
    setQuantity(1);
  };

  const handleQuickAddNewProduct = async () => {
    const cleanName = newProductName.trim();
    if (!cleanName) return;
    if (!user) {
      setErrorMsg('Silakan login dengan Google terlebih dahulu untuk menambah produk baru.');
      return;
    }

    const readyQty = Math.max(0, Number(newProductStock) || 0);
    setAddingNewProductSaving(true);
    setStockNotice('');
    try {
      const autoSku =
        typeof generateAutoSkuFromName === 'function'
          ? generateAutoSkuFromName(cleanName)
          : `NAT-${cleanName.slice(0, 3).toUpperCase()}-01`;
      await addStockItem({
        sku: autoSku,
        productName: cleanName,
        category: 'Produk Baru / Tambahan',
        stockIn: readyQty,
        stockOut: 0,
        minThreshold: 3,
        unit: 'Botol',
        expTercepat: '2026-11',
        expTerlama: '2028-05',
        lastRestockDate: todayStr,
      });

      setSelectedItems((prev) => {
        const exists = prev.some(
          (p) => p.name.toLowerCase() === cleanName.toLowerCase()
        );
        const next = exists
          ? prev.map((p) =>
              p.name.toLowerCase() === cleanName.toLowerCase()
                ? { ...p, qty: p.qty + 1 }
                : p
            )
          : [...prev, { name: cleanName, qty: 1 }];
        setProductsSold(formatProductsSummary(next));
        setQuantity(next.reduce((acc, it) => acc + it.qty, 0));
        return next;
      });

      setNewProductName('');
      setNewProductStock(10);
      setIsAddingNewProduct(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menambah produk baru.');
    } finally {
      setAddingNewProductSaving(false);
    }
  };

  const callServerAiScanner = async (
    base64Data: string,
    mimeType: string,
    fileName = ''
  ) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);
      const res = await fetch('/api/scan-resi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64Data, mimeType, fileName }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) return null;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) return null;
      const data = await res.json();
      if (
        data &&
        (data.noPesanan || data.noResi || data.kurir || data.namaToko || data.pengirim || data.produk)
      ) {
        return data;
      }
    } catch {
      // Fallback to client-side extraction
    }
    return null;
  };

  const cleanScannedStoreName = (rawStore: string, fullRawText = ''): string => {
    const combinedSearch = `${rawStore || ''}\n${fullRawText || ''}`;
    const combinedLower = combinedSearch.toLowerCase();

    for (const store of availableStores) {
      if (store && combinedLower.includes(store.toLowerCase())) {
        return store;
      }
    }
    if (combinedLower.includes('akar sehat naturindo')) return 'Akar Sehat Naturindo';
    if (combinedLower.includes('sentra naturindo')) return 'Sentra Naturindo Official';

    const pengirimMatch = combinedSearch.match(/pengirim\s*[:\-]?\s*\n?\s*([^\n\r]+)/i);
    if (pengirimMatch && pengirimMatch[1]) {
      const candidateFromPengirim = pengirimMatch[1]
        .replace(/\(\+?62\)[\d*\-]+/g, '')
        .split(/\b(?:penerima|banten|kabupaten|kota|berat|kg|jumlah|print\s*time|order\s*id|\d{2,4}[-/]\d{2}[-/]\d{2,4})\b/i)[0]
        .replace(/[:\-|]+$/g, '')
        .trim();
      if (candidateFromPengirim.length >= 3 && !/print\s*time/i.test(candidateFromPengirim)) {
        return candidateFromPengirim;
      }
    }

    if (!rawStore) return '';

    if (/print\s*time|20\d{2}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]20\d{2}|banten|tangerang/i.test(rawStore)) {
      const stripped = rawStore
        .replace(/print\s*time\s*[:：\-]?\s*[\d\-/:\s]+/gi, '')
        .replace(/\b(?:banten|kabupaten|kota|tangerang|cipondoh|penerima|pengirim)\b.*/gi, '')
        .replace(/[:：\-|]+$/g, '')
        .trim();
      if (stripped.length < 3) return '';
      return stripped;
    }

    const cleaned = rawStore
      .split(/\b(?:penerima|pengirim|berat|kg|jumlah|qty|pcs|tanggal|order|resi|print\s*time|\d{2}[-/]\d{2}[-/]\d{4})\b/i)[0]
      .replace(/[:：\-|]+$/g, '')
      .trim();

    return cleaned.length >= 3 ? cleaned : '';
  };

  const detectSmartCourier = (
    rawCourier: string,
    resiNo: string,
    orderId: string,
    fullRawText = ''
  ): string => {
    const codeCheck = `${resiNo || ''} ${orderId || ''}`.toUpperCase();
    const textCheck = `${rawCourier || ''} ${fullRawText || ''}`.toLowerCase();

    if (/\bTSA[-\s]?\d+/i.test(codeCheck) || /\b1000\d{8,}/.test(codeCheck) || textCheck.includes('anteraja')) {
      return 'Anteraja';
    }
    if (/\bSPXID/i.test(codeCheck) || textCheck.includes('spx') || textCheck.includes('shopee xpress')) {
      return 'Shopee Xpress (SPX)';
    }
    if (/\b00\d{10}/.test(codeCheck) || textCheck.includes('sicepat')) {
      return 'SiCepat';
    }
    if (/\bTLJR|\bCM\d+|\bTG\d+/i.test(codeCheck) || textCheck.includes('jne')) {
      return 'JNE Express';
    }
    if (/\bNLIDAP/i.test(codeCheck) || textCheck.includes('ninja')) {
      return 'Ninja Xpress';
    }
    if (/\bIDE\d+/i.test(codeCheck) || textCheck.includes('id express')) {
      return 'ID Express';
    }
    if (/\bJY\d+|\bJX\d+|\bJP\d+|\bJT\d+/i.test(codeCheck)) {
      return 'J&T Express';
    }
    if (textCheck.includes('j&t') || textCheck.includes('jnt')) {
      return 'J&T Express';
    }

    return String(rawCourier || '').trim();
  };

  const applyExtractedResiData = (params: {
    orderId: string;
    resiNo: string;
    kurir: string;
    mp: string;
    store: string;
    owner?: string;
    extractedDate?: string;
    rawTextForDate?: string;
    produkItems: { name: string; qty: number }[];
    produkText: string;
  }) => {
    const cleanOrder = String(params.orderId || '').trim();
    const cleanResi = String(params.resiNo || '').trim();

    if (cleanOrder) setDetectedOrderId(cleanOrder);
    if (cleanResi) setDetectedResiNo(cleanResi);

    if (cleanOrder) {
      setNoPemesanan(cleanOrder);
    } else if (cleanResi) {
      setNoPemesanan(cleanResi);
    }

    if (!validOrderToEdit) {
      setOrderDate(todayStr);
    }

    const resolvedCourier = detectSmartCourier(
      params.kurir,
      cleanResi,
      cleanOrder,
      params.rawTextForDate || ''
    );
    if (resolvedCourier) {
      setCourier(resolvedCourier);
    }

    if (params.mp) {
      const lowerMp = params.mp.toLowerCase();
      if (lowerMp.includes('tiktok')) setMarketplace('TikTok Shop');
      else if (lowerMp.includes('shopee')) setMarketplace('Shopee');
      else if (lowerMp.includes('tokopedia') || lowerMp.includes('tokped'))
        setMarketplace('Tokopedia/Tokped');
      else if (lowerMp.includes('lazada')) setMarketplace('Lazada');
    }

    const scannedStore = cleanScannedStoreName(params.store || '', params.rawTextForDate || '');
    const scannedOwner = String(params.owner || '').trim();

    if (scannedStore) {
      const canonicalStore = availableStores.find(
        (s) => s.toLowerCase() === scannedStore.toLowerCase()
      );
      setStoreName(canonicalStore || scannedStore);
      setIsAddingNewStore(!canonicalStore);
    }

    const resolvedOwner =
      scannedOwner || (scannedStore ? safeResolveOwner(scannedStore) : '');
    if (resolvedOwner) {
      const canonicalOwner = availableOwners.find(
        (o) => o.toLowerCase() === resolvedOwner.toLowerCase()
      );
      setOwnerName(canonicalOwner || resolvedOwner);
      setIsAddingNewOwner(!canonicalOwner);
      setIsOwnerManuallyEdited(false);
    }

    // Sinkronkan produk terdeteksi dari array produkItems maupun string produkText
    let resolvedItems: SelectedProductItem[] = [];
    if (params.produkItems && params.produkItems.length > 0) {
      resolvedItems = params.produkItems.map((item) => ({
        name: String(item.name || '').trim(),
        qty: Math.max(1, Number(item.qty) || 1),
      })).filter((it) => Boolean(it.name));
    } else if (params.produkText && params.produkText.trim()) {
      const parsedFallback =
        typeof parseProductsSoldString === 'function'
          ? parseProductsSoldString(params.produkText.trim(), 1)
          : [];
      if (Array.isArray(parsedFallback) && parsedFallback.length > 0) {
        resolvedItems = parsedFallback;
      } else {
        resolvedItems = [{ name: params.produkText.trim(), qty: 1 }];
      }
    }

    if (resolvedItems.length > 0) {
      setSelectedItems(resolvedItems);
      setProductsSold(formatProductsSummary(resolvedItems));
      setQuantity(resolvedItems.reduce((acc, it) => acc + it.qty, 0));

      const lowOrMinusNames = resolvedItems
        .filter((it) => getAvailableStockForProduct(it.name) < it.qty)
        .map((it) => `${it.name} (Stok: ${getAvailableStockForProduct(it.name)})`);

      if (lowOrMinusNames.length > 0) {
        setStockNotice(
          `Info: Produk [${lowOrMinusNames.join(', ')}] stoknya 0/kurang dan otomatis akan tercatat minus saat order disimpan.`
        );
      }
    }

    if (cleanOrder && cleanResi && cleanOrder !== cleanResi) {
      setScanSuccessMessage(
        `Berhasil Terdeteksi — No. Pesanan: ${cleanOrder} | No. Resi: ${cleanResi}${
          resolvedCourier ? ` | Kurir: ${resolvedCourier}` : ''
        }`
      );
    } else if (cleanOrder) {
      setScanSuccessMessage(
        `Berhasil Terdeteksi — No. Pesanan: ${cleanOrder}${
          resolvedCourier ? ` | Kurir: ${resolvedCourier}` : ''
        }`
      );
    } else if (cleanResi) {
      setScanSuccessMessage(
        `No. Resi terdeteksi: ${cleanResi}. No. Pesanan belum terbaca, silakan periksa atau ketik manual jika ada No. Pesanan berbeda.`
      );
    } else if (resolvedCourier) {
      setScanSuccessMessage(
        `Kurir [${resolvedCourier}] terdeteksi. Silakan periksa atau ketik No. Pesanan / Resi di bawah.`
      );
    } else {
      setScanSuccessMessage(
        'File resi terlampir. Pastikan gambar terang & jelas, atau ketik No. Pesanan / Resi di bawah.'
      );
    }
  };

  const uploadFileToSharedDriveFolder = async (
    fileToUpload: File,
    orderCodeHint?: string,
    interactiveIfMissingToken = false
  ): Promise<string | null> => {
    setDriveUploadError('');
    let token = driveAccessToken || getGoogleAccessToken();
    if (!token && interactiveIfMissingToken) {
      token = await requestDriveAccessToken(false);
    }
    if (!token) {
      setDriveUploadError(
        'Izin Google Drive diperlukan. Klik tombol "Upload ke Folder Google Drive" atau klik Simpan Order untuk mengizinkan akses Drive.'
      );
      return null;
    }

    setUploadingToDrive(true);
    try {
      const cleanCode = (orderCodeHint || noPemesanan || detectedOrderId || detectedResiNo || '').trim();
      const customName = cleanCode && !fileToUpload.name.includes(cleanCode)
        ? `RESI_${cleanCode}_${fileToUpload.name}`
        : `RESI_${fileToUpload.name}`;

      const uploaded = await uploadResiToGoogleDrive(fileToUpload, token, customName);
      if (uploaded.webViewLink) {
        setDrivePrintUrl(uploaded.webViewLink);
        return uploaded.webViewLink;
      }
      return null;
    } catch (err: any) {
      console.warn('Google Drive upload warning:', err);
      if (err?.code === 'INSUFFICIENT_DRIVE_SCOPE') {
        clearDriveAccessToken();
        if (interactiveIfMissingToken) {
          try {
            const freshToken = await requestDriveAccessToken(true);
            if (freshToken) {
              const cleanCode = (orderCodeHint || noPemesanan || detectedOrderId || detectedResiNo || '').trim();
              const customName = cleanCode && !fileToUpload.name.includes(cleanCode)
                ? `RESI_${cleanCode}_${fileToUpload.name}`
                : `RESI_${fileToUpload.name}`;
              const retryUploaded = await uploadResiToGoogleDrive(fileToUpload, freshToken, customName);
              if (retryUploaded.webViewLink) {
                setDrivePrintUrl(retryUploaded.webViewLink);
                return retryUploaded.webViewLink;
              }
            }
          } catch (retryErr: any) {
            setDriveUploadError(retryErr.message || 'Gagal mengunggah ke Google Drive.');
            return null;
          }
        }
      }
      setDriveUploadError(err.message || 'Gagal mengunggah ke Google Drive.');
      return null;
    } finally {
      setUploadingToDrive(false);
    }
  };

  const uploadBriProofToSharedDriveFolder = async (
    fileToUpload: File,
    interactiveIfMissingToken = false
  ): Promise<string | null> => {
    setBriDriveError('');
    let token = driveAccessToken || getGoogleAccessToken();
    if (!token && interactiveIfMissingToken) {
      token = await requestDriveAccessToken(false);
    }
    if (!token) {
      setBriDriveError(
        'Izin Google Drive diperlukan. Klik tombol Upload ke Drive atau Simpan Order untuk mengizinkan akses Drive.'
      );
      return null;
    }

    setUploadingBriToDrive(true);
    try {
      const cleanCode = (noPemesanan || detectedOrderId || detectedResiNo || 'ORDER').trim();
      const customName = `BUKTI_CAIR_BRI_${cleanCode}_${fileToUpload.name}`;
      const uploaded = await uploadResiToGoogleDrive(fileToUpload, token, customName);
      if (uploaded.webViewLink) {
        setDisbursementProof(uploaded.webViewLink);
        return uploaded.webViewLink;
      }
      return null;
    } catch (err: any) {
      console.warn('Google Drive BRI proof upload warning:', err);
      if (err?.code === 'INSUFFICIENT_DRIVE_SCOPE') {
        clearDriveAccessToken();
        if (interactiveIfMissingToken) {
          try {
            const freshToken = await requestDriveAccessToken(true);
            if (freshToken) {
              const cleanCode = (noPemesanan || detectedOrderId || detectedResiNo || 'ORDER').trim();
              const customName = `BUKTI_CAIR_BRI_${cleanCode}_${fileToUpload.name}`;
              const retryUploaded = await uploadResiToGoogleDrive(fileToUpload, freshToken, customName);
              if (retryUploaded.webViewLink) {
                setDisbursementProof(retryUploaded.webViewLink);
                return retryUploaded.webViewLink;
              }
            }
          } catch (retryErr: any) {
            setBriDriveError(retryErr.message || 'Gagal mengunggah bukti BRI ke Google Drive.');
            return null;
          }
        }
      }
      setBriDriveError(err.message || 'Gagal mengunggah bukti BRI ke Google Drive.');
      return null;
    } finally {
      setUploadingBriToDrive(false);
    }
  };

  const handleBriProofFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setBriDriveError('');
    setRawBriProofFile(file);
    setDisbursementProofFileName(file.name);
    setDisbursedToBri(true);
    setDisbursementStatus('Sudah cair');
    if (!disbursementDate) setDisbursementDate(todayStr);

    try {
      if (!driveAccessToken && !getGoogleAccessToken() && user) {
        try {
          await requestDriveAccessToken(false);
        } catch {
          // Will retry on manual button click or form submit
        }
      }

      const isPdf = file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf');
      if (isPdf) {
        const { previewDataUrl } = await extractAndRenderPdfFile(file);
        if (previewDataUrl) {
          setDisbursementProofPreview(previewDataUrl);
        }
      } else {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const imageEl = new Image();
          const objUrl = URL.createObjectURL(file);
          imageEl.onload = () => {
            URL.revokeObjectURL(objUrl);
            resolve(imageEl);
          };
          imageEl.onerror = (err) => {
            URL.revokeObjectURL(objUrl);
            reject(err);
          };
          imageEl.src = objUrl;
        });
        const { previewDataUrl } = createOcrOptimizedImage(img, 1400);
        setDisbursementProofPreview(previewDataUrl);
      }

      await uploadBriProofToSharedDriveFolder(file, true);
    } catch (err) {
      console.warn('Error processing BRI proof file:', err);
    }
  };

  const handleResiFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = '';

    setErrorMsg('');
    setDriveUploadError('');
    setScanSuccessMessage('');
    setDetectedOrderId('');
    setDetectedResiNo('');
    setRawResiFile(file);
    setResiFileName(file.name);
    if (!validOrderToEdit) {
      setOrderDate(todayStr);
    }
    setScanningResi(true);
    setScanProgress(15);

    try {
      const isPdf = file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf');

      if (isPdf) {
        setScanProgress(35);
        const {
          text: pdfText,
          previewDataUrl: pdfPreview,
          barcodes: pdfBarcodes,
        } = await extractAndRenderPdfFile(file);

        if (pdfPreview) {
          setUploadedImagePreview(pdfPreview);
        }

        const parsedPdf = parseResiText(pdfText, pdfBarcodes, file.name);
        setScanProgress(75);

        let aiData: any = null;
        if (pdfPreview) {
          aiData = await callServerAiScanner(pdfPreview, 'image/jpeg', file.name);
        }
        const aiStorePdf = String(aiData?.storeName || aiData?.namaToko || '').trim();
        const aiOwnerPdf = String(aiData?.ownerName || aiData?.pengirim || '').trim();

        const aiParsed = aiData
          ? parseResiText(
              [
                aiData.noPesanan ? `No. Pesanan: ${aiData.noPesanan}` : '',
                aiData.noResi ? `No. Resi: ${aiData.noResi}` : '',
                aiData.kurir || '',
                aiData.marketplace || '',
                aiData.namaToko ? `Pengirim: ${aiData.namaToko}` : '',
                aiData.produk || '',
              ].join('\n'),
              [],
              file.name
            )
          : null;

        const detectedOrd = parsedPdf.noPesanan || aiData?.noPesanan || aiParsed?.noPesanan || '';
        const detectedRes = parsedPdf.noResi || aiData?.noResi || aiParsed?.noResi || '';
        const detectedKurir = parsedPdf.kurir || aiData?.kurir || aiParsed?.kurir || '';
        const detectedMp = parsedPdf.marketplace || aiData?.marketplace || aiParsed?.marketplace || '';
        const detectedStore =
          aiStorePdf ||
          aiParsed?.storeName ||
          parsedPdf.storeName ||
          '';
        const detectedProds =
          parsedPdf.produkList.length > 0
            ? parsedPdf.produkList
            : aiData?.produkItems || aiParsed?.produkList || [];

        applyExtractedResiData({
          orderId: detectedOrd,
          resiNo: detectedRes,
          kurir: detectedKurir,
          mp: detectedMp,
          store: detectedStore,
          owner: aiOwnerPdf,
          extractedDate: String(aiData?.tanggalOrder || aiData?.orderDate || '').trim(),
          rawTextForDate: `${pdfText || ''}\n${aiData?.rawText || ''}`,
          produkItems: detectedProds,
          produkText: aiData?.produk || '',
        });

        setScanningResi(false);
        setScanProgress(100);

        const cleanPdfStore = cleanScannedStoreName(detectedStore, `${pdfText || ''}\n${aiData?.rawText || ''}`);
        const cleanPdfKurir = detectSmartCourier(detectedKurir, detectedRes, detectedOrd, `${pdfText || ''}\n${aiData?.rawText || ''}`);
        const pdfSummary = [
          detectedOrd ? `No. Pesanan: ${detectedOrd}` : (detectedRes ? `No. Resi: ${detectedRes}` : ''),
          cleanPdfStore ? `Toko: ${cleanPdfStore}` : '',
          cleanPdfKurir ? `Kurir: ${cleanPdfKurir}` : '',
        ].filter(Boolean).join(' • ');

        if (pdfSummary) {
          setScanSuccessMessage(`Berhasil terscan otomatis dari PDF: ${pdfSummary}`);
        }

        if (driveAccessToken || getGoogleAccessToken()) {
          uploadFileToSharedDriveFolder(file, detectedOrd || detectedRes, false).catch(() => {});
        }
        return;
      }

      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const imageEl = new Image();
        const objUrl = URL.createObjectURL(file);
        imageEl.onload = () => {
          URL.revokeObjectURL(objUrl);
          resolve(imageEl);
        };
        imageEl.onerror = (err) => {
          URL.revokeObjectURL(objUrl);
          reject(err);
        };
        imageEl.src = objUrl;
      });

      const { ocrDataUrl, previewDataUrl } = createOcrOptimizedImage(img, 1600);
      setUploadedImagePreview(previewDataUrl);
      setScanProgress(20);

      const barcodes = await scanBarcodesFromImage(img);
      const barcodeParsed = parseResiText('', barcodes, file.name);

      if (barcodeParsed.noPesanan || barcodeParsed.noResi) {
        if (barcodeParsed.noPesanan) setDetectedOrderId(barcodeParsed.noPesanan);
        if (barcodeParsed.noResi) setDetectedResiNo(barcodeParsed.noResi);
        setNoPemesanan(barcodeParsed.noPesanan || barcodeParsed.noResi);
        const earlyCourier = detectSmartCourier(
          barcodeParsed.kurir,
          barcodeParsed.noResi,
          barcodeParsed.noPesanan,
          barcodes.join(' ')
        );
        if (earlyCourier) setCourier(earlyCourier);
        if (barcodeParsed.marketplace) setMarketplace(barcodeParsed.marketplace);
      }

      setScanProgress(30);

      const browserOcrPromise = runBrowserOcr(
        ocrDataUrl,
        (pct) => {
          setScanProgress(30 + Math.round(pct * 0.5));
        },
        6000
      );
      const serverScannerPromise = callServerAiScanner(previewDataUrl, 'image/jpeg', file.name);

      const [ocrText, aiData] = await Promise.all([browserOcrPromise, serverScannerPromise]);

      const fullParsed = parseResiText(ocrText, barcodes, file.name);

      const aiCombinedText = aiData
        ? [
            aiData.rawText || '',
            aiData.noPesanan ? `No. Pesanan: ${aiData.noPesanan}` : '',
            aiData.noResi ? `No. Resi: ${aiData.noResi}` : '',
            aiData.kurir || '',
            aiData.marketplace || '',
            aiData.namaToko ? `Pengirim: ${aiData.namaToko}` : '',
            aiData.produk || '',
          ].join('\n')
        : '';
      const aiValidated = aiCombinedText ? parseResiText(aiCombinedText, barcodes, file.name) : null;

      const finalOrderId =
        barcodeParsed.noPesanan ||
        String(aiData?.noPesanan || '').trim() ||
        aiValidated?.noPesanan ||
        fullParsed.noPesanan ||
        '';

      const finalResiNo =
        barcodeParsed.noResi ||
        fullParsed.noResi ||
        aiValidated?.noResi ||
        String(aiData?.noResi || '').trim() ||
        '';

      const finalKurir =
        fullParsed.kurir ||
        aiValidated?.kurir ||
        barcodeParsed.kurir ||
        String(aiData?.kurir || '').trim() ||
        '';

      const finalMp =
        fullParsed.marketplace ||
        aiValidated?.marketplace ||
        barcodeParsed.marketplace ||
        String(aiData?.marketplace || '').trim() ||
        '';

      const finalStore =
        String(aiData?.storeName || aiData?.namaToko || '').trim() ||
        aiValidated?.storeName ||
        fullParsed.storeName ||
        '';

      const finalOwner = String(aiData?.ownerName || aiData?.pengirim || '').trim();

      const finalProducts =
        fullParsed.produkList.length > 0
          ? fullParsed.produkList
          : aiData?.produkItems || aiValidated?.produkList || [];

      applyExtractedResiData({
        orderId: finalOrderId,
        resiNo: finalResiNo,
        kurir: finalKurir,
        mp: finalMp,
        store: finalStore,
        owner: finalOwner,
        extractedDate: String(aiData?.tanggalOrder || aiData?.orderDate || '').trim(),
        rawTextForDate: `${ocrText || ''}\n${aiData?.rawText || ''}`,
        produkItems: finalProducts,
        produkText: String(aiData?.produk || '').trim(),
      });

      const cleanImgStore = cleanScannedStoreName(finalStore, `${ocrText || ''}\n${aiData?.rawText || ''}`);
      const cleanImgKurir = detectSmartCourier(finalKurir, finalResiNo, finalOrderId, `${ocrText || ''}\n${aiData?.rawText || ''}`);
      const extractedSummary = [
        finalOrderId ? `No. Pesanan: ${finalOrderId}` : (finalResiNo ? `No. Resi: ${finalResiNo}` : ''),
        cleanImgStore ? `Toko: ${cleanImgStore}` : '',
        cleanImgKurir ? `Kurir: ${cleanImgKurir}` : '',
      ].filter(Boolean).join(' • ');

      if (extractedSummary) {
        setScanSuccessMessage(`Berhasil terscan otomatis: ${extractedSummary}`);
      }

      if (driveAccessToken || getGoogleAccessToken()) {
        uploadFileToSharedDriveFolder(file, finalOrderId || finalResiNo, false).catch(() => {});
      }
    } catch (err: any) {
      console.warn('Error scanning resi file:', err);
      setScanSuccessMessage('Resi diunggah. Silakan lengkapi No. Pesanan / Resi & kurir di bawah.');
    } finally {
      setScanningResi(false);
      setScanProgress(100);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      setErrorMsg('Akses ditolak: Anda harus login dengan akun Google terlebih dahulu untuk mencatat order.');
      return;
    }

    const finalProductsString = (productsSold.trim() || formatProductsSummary(selectedItems)).trim();

    if (!storeName.trim() || !finalProductsString || !noPemesanan.trim()) {
      setErrorMsg('Harap lengkapi Nama Toko, No. Resi / Pemesanan, dan Produk Terjual.');
      return;
    }

    setSaving(true);
    setErrorMsg('');

    try {
      let finalDriveUrl = drivePrintUrl.trim();
      if (rawResiFile && !finalDriveUrl) {
        const uploadedLink = await uploadFileToSharedDriveFolder(
          rawResiFile,
          noPemesanan.trim(),
          true
        );
        if (uploadedLink) {
          finalDriveUrl = uploadedLink;
        }
      }

      let finalBriProof = disbursementProof.trim();
      if (rawBriProofFile && !finalBriProof.startsWith('http')) {
        const uploadedBriLink = await uploadBriProofToSharedDriveFolder(
          rawBriProofFile,
          true
        );
        if (uploadedBriLink) {
          finalBriProof = uploadedBriLink;
        }
      }

      const payloadData = {
        orderDate,
        storeName: storeName.trim(),
        marketplace,
        courier: courier.trim() || 'J&T Express',
        ownerName: (ownerName.trim() || safeResolveOwner(storeName.trim())).trim(),
        noPemesanan: noPemesanan.trim(),
        noResi: detectedResiNo.trim() || '',
        resiFileData: uploadedImagePreview || '',
        resiFileName: resiFileName.trim() || '',
        productsSold: finalProductsString,
        quantity: Number(quantity) || 1,
        checklistComplete,
        shippingStatus,
        dropoffDate: shippingStatus === 'Package Sent' ? (dropoffDate || todayStr) : '',
        drivePrintUrl: finalDriveUrl,
        notes: notes.trim(),
        disbursedToBri,
        disbursementStatus: disbursedToBri ? 'Sudah cair' : disbursementStatus,
        disbursementDate: disbursedToBri && !disbursementDate ? todayStr : disbursementDate,
        disbursementProof: finalBriProof,
        disbursementProofData: disbursementProofPreview || '',
        disbursementProofFileName: disbursementProofFileName.trim() || '',
        verifiedCheck,
      };

      if (validOrderToEdit && validOrderToEdit.id) {
        await updateOrder(validOrderToEdit.id, payloadData);
      } else {
        await addOrder(payloadData);
      }
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan order.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden my-8 animate-scale-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {validOrderToEdit && validOrderToEdit.id ? 'Edit Tracking Order' : 'Pencatatan Order Baru'}
              </h2>
              <p className="text-xs text-slate-500">
                Unggah label resi untuk scan otomatis Order ID & simpan ke Google Drive Folder Resi.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {!user && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Anda belum login. Silakan login dengan Google di navigasi atas sebelum menyimpan data.</span>
            </div>
          )}

          {/* Section: Upload & Scan Resi Ekspedisi */}
          <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200/90 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-emerald-700" />
                <span className="font-bold text-emerald-950 text-xs">
                  Upload & Scan Resi Otomatis + Simpan ke Google Drive
                </span>
              </div>
              <a
                href={SENTRA_RESI_DRIVE_FOLDER_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] font-bold bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-1 rounded-full transition-colors shadow-2xs"
                title={`Folder ID: ${SENTRA_RESI_DRIVE_FOLDER_ID}`}
              >
                <FolderOpen className="w-3 h-3 text-emerald-600" />
                <span>Buka Folder Drive Resi</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>

            <p className="text-[11px] text-emerald-900/80">
              Unggah file <strong>PDF Resi</strong> atau <strong>Foto Label Pengiriman</strong>. Sistem otomatis memindai <strong>No. Pemesanan / Order ID</strong>, <strong>No. Resi</strong>, <strong>Kurir</strong>, dan mengunggah file resi langsung ke <strong>Folder Google Drive Resi Sentra Naturindo</strong>.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={scanningResi || uploadingToDrive}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
              >
                {scanningResi ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>
                      Memindai No. Pesanan & Resi... {scanProgress > 0 ? `${scanProgress}%` : ''}
                    </span>
                  </>
                ) : uploadingToDrive ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Mengunggah ke Google Drive Folder...</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4" />
                    <span>Pilih File Resi (PDF / Foto)</span>
                  </>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf,.pdf"
                onChange={handleResiFileChange}
                className="hidden"
              />

              {uploadedImagePreview && (
                <div className="flex items-center gap-2 text-xs text-emerald-900 bg-white px-2.5 py-1.5 rounded-xl border border-emerald-200 shadow-2xs">
                  <img
                    src={uploadedImagePreview}
                    alt="Preview Resi"
                    className="w-9 h-9 object-cover rounded-lg border border-emerald-300"
                  />
                  <div className="flex flex-col">
                    <span className="font-bold text-[11px] text-emerald-950 flex items-center gap-1">
                      <Printer className="w-3 h-3 text-emerald-600" />
                      <span>
                        {drivePrintUrl ? 'Tersimpan di Drive & Siap Print' : 'Resi Siap Print'}
                      </span>
                    </span>
                    {resiFileName && (
                      <span className="text-[10px] text-slate-500 max-w-[140px] truncate">
                        {resiFileName}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setUploadedImagePreview(null);
                      setRawResiFile(null);
                      setResiFileName('');
                      setScanSuccessMessage('');
                      setDetectedOrderId('');
                      setDetectedResiNo('');
                    }}
                    className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                    title="Hapus file resi"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {rawResiFile && !drivePrintUrl && !uploadingToDrive && (
                <button
                  type="button"
                  onClick={() => uploadFileToSharedDriveFolder(rawResiFile, noPemesanan, true)}
                  className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload ke Folder Google Drive</span>
                </button>
              )}
            </div>

            {drivePrintUrl && (
              <div className="p-2 rounded-lg bg-blue-50/90 border border-blue-200 text-blue-900 flex items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-1.5 font-medium truncate">
                  <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span className="truncate">Tersimpan di Google Drive Folder Resi</span>
                </div>
                <a
                  href={drivePrintUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-bold text-blue-700 hover:underline shrink-0"
                >
                  <span>Buka File Drive</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            {driveUploadError && (
              <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 flex items-center justify-between gap-2 text-[11px]">
                <span>{driveUploadError}</span>
                {rawResiFile && (
                  <button
                    type="button"
                    onClick={() => uploadFileToSharedDriveFolder(rawResiFile, noPemesanan, true)}
                    className="font-bold underline cursor-pointer shrink-0"
                  >
                    Coba Upload Lagi
                  </button>
                )}
              </div>
            )}

            {scanSuccessMessage && (
              <div className="p-2.5 rounded-lg bg-white border border-emerald-300 text-emerald-800 flex items-center gap-2 text-[11px] font-semibold">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>{scanSuccessMessage}</span>
              </div>
            )}
          </div>

          {/* Row 1: No. Pemesanan/Order ID & Kurir */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                No. Pemesanan / Order ID *
              </label>
              <input
                type="text"
                required
                value={noPemesanan}
                onChange={(e) => setNoPemesanan(e.target.value)}
                placeholder="Otomatis terisi saat upload resi (misal: 251010P1QW3N4G)"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-900 font-mono font-bold text-xs"
              />
              {(detectedOrderId || detectedResiNo) && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {detectedOrderId && (
                    <button
                      type="button"
                      onClick={() => setNoPemesanan(detectedOrderId)}
                      className={`px-2 py-0.5 text-[10px] rounded border transition-colors cursor-pointer font-mono ${
                        noPemesanan === detectedOrderId
                          ? 'bg-emerald-600 text-white border-emerald-600 font-bold'
                          : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                      }`}
                    >
                      Order ID: {detectedOrderId}
                    </button>
                  )}
                  {detectedResiNo && detectedResiNo !== detectedOrderId && (
                    <button
                      type="button"
                      onClick={() => setNoPemesanan(detectedResiNo)}
                      className={`px-2 py-0.5 text-[10px] rounded border transition-colors cursor-pointer font-mono ${
                        noPemesanan === detectedResiNo
                          ? 'bg-emerald-600 text-white border-emerald-600 font-bold'
                          : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                      }`}
                    >
                      Resi: {detectedResiNo}
                    </button>
                  )}
                  {detectedOrderId && detectedResiNo && detectedOrderId !== detectedResiNo && (
                    <button
                      type="button"
                      onClick={() => setNoPemesanan(`${detectedOrderId} / ${detectedResiNo}`)}
                      className={`px-2 py-0.5 text-[10px] rounded border transition-colors cursor-pointer font-mono ${
                        noPemesanan === `${detectedOrderId} / ${detectedResiNo}`
                          ? 'bg-emerald-600 text-white border-emerald-600 font-bold'
                          : 'bg-slate-100 hover:bg-emerald-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      Gabung Keduanya
                    </button>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Kurir yang Digunakan *
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  required
                  value={courier}
                  onChange={(e) => setCourier(e.target.value)}
                  placeholder="Hasil scan kurir (contoh: J&T Express, SPX, SiCepat)"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-900 font-medium text-xs"
                />
              </div>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {COMMON_COURIERS.slice(0, 4).map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setCourier(c)}
                    className="px-2 py-0.5 text-[10px] rounded bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200 transition-colors cursor-pointer"
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Tanggal Order, Marketplace, Nama Toko, Pemilik Toko */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Tanggal Order (Otomatis) *
              </label>
              <input
                type="date"
                required
                value={orderDate}
                readOnly
                disabled
                title="Terisi otomatis sesuai tanggal waktu upload resi (tidak dapat diisi/diubah manual)"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-100 text-slate-600 cursor-not-allowed font-medium"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Marketplace *
              </label>
              <select
                value={marketplace}
                onChange={(e) => setMarketplace(e.target.value as MarketplaceType)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 font-medium"
              >
                <option value="Shopee">Shopee</option>
                <option value="TikTok Shop">TikTok Shop</option>
                <option value="Tokopedia/Tokped">Tokopedia</option>
                <option value="Lazada">Lazada</option>
                <option value="Offline/Lainnya">Offline / Lainnya</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-semibold text-slate-700">
                  Nama Toko *
                </label>
                {isAddingNewStore ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingNewStore(false);
                      if (!storeName.trim() && availableStores.length > 0) {
                        const st = availableStores[0];
                        setStoreName(st);
                        if (!isOwnerManuallyEdited) {
                          setOwnerName(safeResolveOwner(st));
                        }
                      }
                    }}
                    className="text-[10px] font-semibold text-emerald-700 hover:underline cursor-pointer"
                  >
                    Pilih dari Daftar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingNewStore(true);
                      setStoreName('');
                    }}
                    className="text-[10px] font-semibold text-emerald-700 hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Tambah Toko Baru</span>
                  </button>
                )}
              </div>

              {isAddingNewStore ? (
                <input
                  type="text"
                  required
                  autoFocus
                  value={storeName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setStoreName(val);
                    if (!isOwnerManuallyEdited) {
                      setOwnerName(safeResolveOwner(val));
                    }
                  }}
                  placeholder="Ketik nama toko baru..."
                  className="w-full px-3 py-2 rounded-xl border border-emerald-400 bg-white text-slate-900 font-medium text-xs focus:ring-2 focus:ring-emerald-500/20"
                />
              ) : (
                <select
                  required
                  value={
                    availableStores.includes(storeName)
                      ? storeName
                      : availableStores[0] || 'Sentra Naturindo Official'
                  }
                  onChange={(e) => {
                    if (e.target.value === '__ADD_NEW_STORE__') {
                      setIsAddingNewStore(true);
                      setStoreName('');
                    } else {
                      const val = e.target.value;
                      setStoreName(val);
                      const autoOwner = safeResolveOwner(val);
                      setOwnerName(autoOwner);
                      setIsOwnerManuallyEdited(false);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 font-medium text-xs cursor-pointer"
                >
                  {availableStores.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                  <option value="__ADD_NEW_STORE__">+ Tambah Toko Baru...</option>
                </select>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <label className="block font-semibold text-slate-700">
                    Pemilik Toko *
                  </label>
                  {!isOwnerManuallyEdited && ownerName ? (
                    <span
                      className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded font-normal border border-emerald-200"
                      title="Disesuaikan otomatis sesuai nama toko di resi"
                    >
                      Sesuai Resi
                    </span>
                  ) : isOwnerManuallyEdited ? (
                    <span
                      className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded font-normal border border-amber-200"
                      title="Dipilih / diedit manual"
                    >
                      Pilihan Manual
                    </span>
                  ) : null}
                </div>
                {isAddingNewOwner ? (
                  <button
                    type="button"
                    onClick={() => setIsAddingNewOwner(false)}
                    className="text-[10px] font-semibold text-emerald-700 hover:underline cursor-pointer"
                  >
                    Pilih dari Daftar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingNewOwner(true);
                      setOwnerName('');
                    }}
                    className="text-[10px] font-semibold text-emerald-700 hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Tambah Pemilik</span>
                  </button>
                )}
              </div>

              {isAddingNewOwner ? (
                <input
                  type="text"
                  required
                  autoFocus
                  value={ownerName}
                  onChange={(e) => {
                    setOwnerName(e.target.value);
                    setIsOwnerManuallyEdited(true);
                  }}
                  placeholder="Ketik nama pemilik baru..."
                  className="w-full px-3 py-2 rounded-xl border border-emerald-400 bg-white text-slate-900 font-medium text-xs focus:ring-2 focus:ring-emerald-500/20"
                />
              ) : (
                <div className="space-y-1.5">
                  <select
                    required
                    value={
                      availableOwners.includes(ownerName)
                        ? ownerName
                        : availableOwners[0] || 'Agung'
                    }
                    onChange={(e) => {
                      if (e.target.value === '__ADD_NEW_OWNER__') {
                        setIsAddingNewOwner(true);
                        setOwnerName('');
                      } else {
                        setOwnerName(e.target.value);
                        setIsOwnerManuallyEdited(true);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 font-medium text-xs cursor-pointer"
                  >
                    {availableOwners.map((owner) => (
                      <option key={owner} value={owner}>
                        {owner}
                      </option>
                    ))}
                    <option value="__ADD_NEW_OWNER__">+ Tambah Pemilik Baru...</option>
                  </select>

                  <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px] no-scrollbar">
                    {availableOwners.map((owner) => {
                      const isSelected =
                        String(ownerName || '').trim().toLowerCase() === owner.toLowerCase();
                      return (
                        <button
                          key={owner}
                          type="button"
                          onClick={() => {
                            setOwnerName(owner);
                            setIsOwnerManuallyEdited(true);
                          }}
                          className={`px-2 py-0.5 rounded-lg whitespace-nowrap text-[10px] font-semibold transition-all shrink-0 cursor-pointer border ${
                            isSelected
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs font-bold'
                              : 'bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border-slate-200'
                          }`}
                        >
                          {isSelected && '✓ '}
                          {owner}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between mt-1 text-[10px] text-slate-400">
                <span>{isOwnerManuallyEdited ? 'Pilihan manual' : 'Disesuaikan dari toko di resi'}</span>
                {isOwnerManuallyEdited && (
                  <button
                    type="button"
                    onClick={() => {
                      setOwnerName(safeResolveOwner(storeName));
                      setIsOwnerManuallyEdited(false);
                    }}
                    className="text-emerald-700 hover:underline font-semibold cursor-pointer"
                  >
                    Kembalikan ke Toko Resi
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Row 3: Produk Terjual & Qty */}
          <div className="space-y-2.5 p-3.5 bg-slate-50/80 rounded-xl border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <label className="block font-bold text-slate-800 text-xs">
                    Produk Terjual & Total Qty (Urut A–Z) *
                  </label>
                  <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
                    {unifiedCatalogWithStock.length} Produk ({outOfStockOrMinusCount} Stok 0/Minus Tetap Bisa Dipilih)
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Semua produk tetap dapat dipilih meskipun stok 0 (stok otomatis menjadi minus dan berkurang minusnya saat restock masuk).
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsAddingNewProduct(!isAddingNewProduct)}
                  className="text-[10px] text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1 cursor-pointer bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  <span>{isAddingNewProduct ? 'Tutup Form Produk Baru' : 'Tambah Nama Produk Baru'}</span>
                </button>
                {selectedItems.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllProducts}
                    className="text-[10px] text-rose-600 hover:text-rose-700 font-medium flex items-center gap-1 cursor-pointer bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded-lg border border-rose-200 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset Pilihan</span>
                  </button>
                )}
              </div>
            </div>

            {isAddingNewProduct && (
              <div className="p-3 rounded-xl bg-white border border-emerald-300 shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-emerald-950">
                    Tambah Nama Produk Baru (Otomatis Masuk Stok & Urut A–Z)
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <div className="sm:col-span-2">
                    <input
                      type="text"
                      value={newProductName}
                      onChange={(e) => setNewProductName(e.target.value)}
                      placeholder="Ketik nama produk baru (misal: Glucofit Premium)..."
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-slate-900 font-semibold text-xs"
                    />
                  </div>
                  <div>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        value={newProductStock}
                        onChange={(e) => setNewProductStock(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-slate-900 font-mono font-bold text-xs"
                        placeholder="Stok Ready"
                      />
                      <span className="absolute right-2 top-1.5 text-[10px] text-slate-400 pointer-events-none">
                        Stok Awal
                      </span>
                    </div>
                  </div>
                  <div>
                    <button
                      type="button"
                      disabled={!newProductName.trim() || addingNewProductSaving}
                      onClick={handleQuickAddNewProduct}
                      className="w-full py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 text-white font-bold text-xs transition-colors cursor-pointer"
                    >
                      {addingNewProductSaving ? 'Menyimpan...' : 'Simpan & Pilih'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {stockNotice && (
              <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 flex items-center gap-1.5 text-[11px] font-semibold">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>{stockNotice}</span>
              </div>
            )}

            {selectedItems.length > 0 && (
              <div className="p-2.5 rounded-xl bg-emerald-50/90 border border-emerald-300 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-emerald-950 font-bold">
                  <span>
                    {selectedItems.length} Produk Dipilih (Total {quantity} botol/item):
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedItems.map((item) => {
                    const maxAvail = getAvailableStockForProduct(item.name);
                    return (
                      <div
                        key={item.name}
                        className="flex items-center gap-1.5 bg-white border border-emerald-300 rounded-lg px-2.5 py-1 text-xs shadow-xs text-slate-800"
                      >
                        <span className="font-bold text-emerald-950">{item.name}</span>
                        <span
                          className={`text-[10px] font-mono ${
                            maxAvail <= 0 ? 'text-rose-600 font-bold' : 'text-slate-500'
                          }`}
                        >
                          (Stok: {maxAvail})
                        </span>
                        <div className="flex items-center gap-1 bg-slate-100 rounded-md px-1 py-0.5 ml-1 border border-slate-200">
                          <button
                            type="button"
                            onClick={() => handleUpdateItemQty(item.name, -1)}
                            className="w-4 h-4 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded cursor-pointer font-bold"
                            title="Kurangi qty produk ini"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-mono font-bold text-xs px-1 text-emerald-900 min-w-4 text-center">
                            {item.qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateItemQty(item.name, 1)}
                            className="w-4 h-4 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded cursor-pointer font-bold"
                            title="Tambah qty produk ini"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.name)}
                          className="text-slate-400 hover:text-rose-600 p-0.5 ml-1 cursor-pointer"
                          title="Hapus produk ini dari order"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              <div className="sm:col-span-3">
                <input
                  type="text"
                  required
                  value={productsSold}
                  onChange={(e) => {
                    const val = e.target.value;
                    setProductsSold(val);
                    if (!val.trim()) {
                      setSelectedItems([]);
                    }
                  }}
                  placeholder="Klik produk di bawah atau ketik nama produk..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 font-medium text-xs focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
              <div>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 font-bold text-center text-xs focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="Total Qty"
                  />
                  <span className="absolute right-2 top-2 text-[10px] text-slate-400 font-semibold pointer-events-none">
                    Total
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Cari nama produk (urut A–Z, misal: Azzahra Premium, Cardiafit, Herbaslim GO)..."
                  className="w-full pl-8 pr-7 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] text-slate-800 placeholder-slate-400"
                />
                {productSearch && (
                  <button
                    type="button"
                    onClick={() => setProductSearch('')}
                    className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pt-1 pr-1">
              {filteredCatalog.length === 0 ? (
                <div className="w-full py-4 text-center text-[11px] text-slate-500 bg-white rounded-lg border border-dashed border-slate-200">
                  Tidak ada produk yang cocok dengan pencarian. Klik <strong>+ Tambah Nama Produk Baru</strong> di atas jika ingin menambahkan produk baru.
                </div>
              ) : (
                filteredCatalog.map((cat) => {
                  const isSelected = selectedItems.some(
                    (p) => p.name.toLowerCase() === cat.name.toLowerCase()
                  );
                  const selectedItem = selectedItems.find(
                    (p) => p.name.toLowerCase() === cat.name.toLowerCase()
                  );
                  const isZeroOrMinus = cat.stockReady <= 0;

                  return (
                    <button
                      type="button"
                      key={cat.sku + '-' + cat.name}
                      onClick={() => handleToggleProduct(cat.name)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-600 text-white font-bold shadow-xs border border-emerald-700'
                          : isZeroOrMinus
                          ? 'bg-rose-50/60 hover:bg-rose-100/70 text-slate-700 border border-rose-200'
                          : 'bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200'
                      }`}
                    >
                      {isSelected ? (
                        <>
                          <Check className="w-3 h-3 text-white" />
                          <span>{cat.name}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-800 text-emerald-100 font-mono">
                            {selectedItem ? `${selectedItem.qty}x (Stok: ${cat.stockReady})` : cat.stockReady}
                          </span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3 h-3 text-slate-400" />
                          <span>{cat.name}</span>
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                              isZeroOrMinus
                                ? 'bg-rose-100 text-rose-700 border-rose-200 font-bold'
                                : 'bg-slate-100 text-slate-600 border-slate-200/80'
                            }`}
                          >
                            {cat.stockReady}
                          </span>
                        </>
                      )}
                      {cat.isCustomNew && (
                        <span
                          className={`text-[9px] font-extrabold uppercase px-1 rounded ${
                            isSelected
                              ? 'bg-amber-300 text-slate-950'
                              : 'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}
                        >
                          Baru
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Row 4: Status Kirim, Checklist Packing & Drop Off */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200/70">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Status Pengiriman
              </label>
              <select
                value={shippingStatus}
                onChange={(e) => {
                  const nextStatus = e.target.value as ShippingStatus;
                  setShippingStatus(nextStatus);
                  if (nextStatus === 'Package Sent') {
                    setDropoffDate((prev) => prev || todayStr);
                    setChecklistComplete(true);
                  } else if (nextStatus === 'Diproses' || nextStatus === 'Siap Kirim') {
                    setDropoffDate('');
                  }
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold text-slate-800"
              >
                <option value="Diproses">Diproses</option>
                <option value="Siap Kirim">Siap Kirim</option>
                <option value="Package Sent">Package Sent</option>
                <option value="Retur">Retur</option>
                <option value="Dibatalkan">Dibatalkan</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Tgl Drop Off (Otomatis)
              </label>
              <input
                type="date"
                value={shippingStatus === 'Package Sent' ? (dropoffDate || todayStr) : ''}
                readOnly
                disabled
                title="Terisi otomatis saat status berubah menjadi Package Sent (tidak dapat diisi manual)"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-100 text-slate-600 cursor-not-allowed font-mono"
              />
            </div>

            <div className="flex items-center sm:pt-6">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={checklistComplete}
                  onChange={(e) => setChecklistComplete(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 border-slate-300"
                />
                <span className="font-semibold text-slate-800">
                  Checklist Packing Selesai
                </span>
              </label>
            </div>
          </div>

          {/* Row 5: Rekening BRI, Pencairan Dana & Checklist Pengecekan Uang Masuk */}
          <div className="p-3.5 bg-emerald-50/50 rounded-xl border border-emerald-200/80 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={disbursedToBri}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setDisbursedToBri(checked);
                    if (checked) {
                      setDisbursementStatus('Sudah cair');
                      if (!disbursementDate) setDisbursementDate(todayStr);
                    } else {
                      setDisbursementStatus('Belum cair');
                      setVerifiedCheck(false);
                    }
                  }}
                  className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 border-slate-300"
                />
                <span className="font-bold text-emerald-950">
                  Dana Sudah Cair Masuk ke Rekening BRI
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none bg-white px-2.5 py-1 rounded-lg border border-blue-300 shadow-2xs">
                <input
                  type="checkbox"
                  checked={verifiedCheck}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setVerifiedCheck(checked);
                    if (checked && !disbursedToBri) {
                      setDisbursedToBri(true);
                      setDisbursementStatus('Sudah cair');
                      if (!disbursementDate) setDisbursementDate(todayStr);
                    }
                  }}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-slate-300"
                />
                <span className="font-bold text-blue-900">
                  Checklist Pengecekan Uang Masuk
                </span>
              </label>
            </div>

            {disbursedToBri && (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Tanggal Masuk Rekening BRI *
                    </label>
                    <input
                      type="date"
                      value={disbursementDate}
                      onChange={(e) => setDisbursementDate(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-800 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Upload Bukti Pencairan BRI (Ke Google Drive) *
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => briFileInputRef.current?.click()}
                        disabled={uploadingBriToDrive}
                        className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-[11px] flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                      >
                        {uploadingBriToDrive ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Mengunggah Bukti...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-3.5 h-3.5" />
                            <span>Pilih File Bukti Cair</span>
                          </>
                        )}
                      </button>
                      <input
                        ref={briFileInputRef}
                        type="file"
                        accept="image/*,application/pdf,.pdf"
                        onChange={handleBriProofFileChange}
                        className="hidden"
                      />

                      {rawBriProofFile && !disbursementProof.startsWith('http') && !uploadingBriToDrive && (
                        <button
                          type="button"
                          onClick={() => uploadBriProofToSharedDriveFolder(rawBriProofFile, true)}
                          className="px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] flex items-center gap-1 shadow-2xs cursor-pointer"
                        >
                          <Upload className="w-3 h-3" />
                          <span>Aktifkan Izin & Upload Drive</span>
                        </button>
                      )}

                      {(disbursementProof.startsWith('http') || disbursementProofPreview) && (
                        <a
                          href={disbursementProof.startsWith('http') ? disbursementProof : SENTRA_RESI_DRIVE_FOLDER_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 shadow-2xs transition-colors"
                          title="Buka File Bukti Pencairan BRI di Google Drive"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {disbursementProofPreview && (
                  <div className="flex items-center justify-between gap-2 bg-white p-2 rounded-xl border border-emerald-200">
                    <div className="flex items-center gap-2">
                      <img
                        src={disbursementProofPreview}
                        alt="Preview Bukti BRI"
                        className="w-9 h-9 object-cover rounded-lg border border-emerald-300"
                      />
                      <div className="flex flex-col">
                        <span className="text-[11px] font-bold text-emerald-950">
                          {disbursementProof.startsWith('http')
                            ? 'Bukti Cair Tersimpan di Google Drive'
                            : 'Bukti Cair Terlampir'}
                        </span>
                        {disbursementProofFileName && (
                          <span className="text-[10px] text-slate-500 truncate max-w-[180px]">
                            {disbursementProofFileName}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {disbursementProof.startsWith('http') && (
                        <a
                          href={disbursementProof}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200"
                          title="Buka Link Google Drive Bukti Pencairan"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setDisbursementProofPreview(null);
                          setRawBriProofFile(null);
                          setDisbursementProofFileName('');
                          setDisbursementProof('');
                        }}
                        className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                        title="Hapus bukti pencairan"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {briDriveError && (
                  <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 flex items-center justify-between gap-2 text-[11px]">
                    <span>{briDriveError}</span>
                    {rawBriProofFile && (
                      <button
                        type="button"
                        onClick={() => uploadBriProofToSharedDriveFolder(rawBriProofFile, true)}
                        className="font-bold underline cursor-pointer shrink-0"
                      >
                        Aktifkan Izin & Upload Ulang
                      </button>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Link Google Drive / No. Ref Bukti Mutasi BRI
                  </label>
                  <input
                    type="text"
                    value={disbursementProof}
                    onChange={(e) => setDisbursementProof(e.target.value)}
                    placeholder="Otomatis terisi link Google Drive saat upload bukti..."
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-800 font-mono text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Row 6: Link Drive Label Resi & Catatan Tambahan */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Link Google Drive Label / Resi PDF
              </label>
              <input
                type="url"
                value={drivePrintUrl}
                onChange={(e) => setDrivePrintUrl(e.target.value)}
                placeholder="https://drive.google.com/..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Catatan / Keterangan Khusus
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Contoh: Bubble tebal, kardus dobel, dll."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving || !user}
              className={`px-5 py-2 rounded-xl text-white font-semibold shadow-sm transition-all flex items-center gap-1.5 ${
                !user
                  ? 'bg-slate-400 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500 cursor-pointer'
              }`}
            >
              {saving ? 'Menyimpan...' : validOrderToEdit && validOrderToEdit.id ? 'Simpan Perubahan' : 'Simpan Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};