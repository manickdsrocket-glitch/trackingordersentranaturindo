import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  QrCode,
  Search,
  CheckCircle2,
  AlertCircle,
  Truck,
  ArrowRight,
  Camera,
  Upload,
  Keyboard,
  Loader2,
  PlusCircle,
  Volume2,
} from 'lucide-react';
import { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } from '@zxing/library';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAuth } from '../context/AuthContext';
import { OrderRecord, getDefaultOwnerForStore } from '../types';
import { scanBarcodesFromImage, parseResiText } from '../utils/resiScanner';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEditOrder: (order?: OrderRecord) => void;
}

type ScanTab = 'camera' | 'upload' | 'manual';

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onEditOrder,
}) => {
  const { orders, updateOrder } = useWorkspace();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<ScanTab>('manual');
  const [inputResi, setInputResi] = useState('');
  const [matchedOrders, setMatchedOrders] = useState<OrderRecord[]>([]);
  const [unmatchedCodes, setUnmatchedCodes] = useState<string[]>([]);
  const [processedIds, setProcessedIds] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [isScanningCamera, setIsScanningCamera] = useState(false);
  const [fileScanning, setFileScanning] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const latestExtractedDataRef = useRef<any>(null);

  const todayStr = new Date().toISOString().split('T')[0];

  // Play subtle feedback beep on successful barcode scan
  const playBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {
      // Ignore audio error
    }
  };

  const requireAuth = (actionName: string): boolean => {
    if (!user) {
      alert(`Akses ditolak: Anda harus login dengan akun Google terlebih dahulu untuk ${actionName}.`);
      return false;
    }
    return true;
  };

  const processScannedCodes = (rawCodes: string[]) => {
    const cleanList = rawCodes
      .map((c) => c.trim().toLowerCase())
      .filter((c) => c.length >= 6);

    if (cleanList.length === 0) return;

    playBeep();

    const found: OrderRecord[] = [...matchedOrders];
    const notFound: string[] = [...unmatchedCodes];

    for (const code of cleanList) {
      const match = orders.find(
        (o) =>
          (o.noPemesanan || '').toLowerCase() === code ||
          (o.noResi || '').toLowerCase() === code ||
          o.id.toLowerCase() === code ||
          (o.drivePrintUrl || '').toLowerCase().includes(code)
      );

      if (match) {
        if (!found.some((m) => m.id === match.id)) {
          found.push(match);
        }
      } else {
        if (!notFound.includes(code)) {
          notFound.push(code);
        }
      }
    }

    setMatchedOrders(found);
    setUnmatchedCodes(notFound);

    if (found.length > 0) {
      setMessage(`Berhasil memindai ${found.length} order cocok.${notFound.length > 0 ? ` (${notFound.length} belum terdaftar)` : ''}`);
    } else {
      setMessage(`Barcode terdeteksi: ${cleanList.join(', ')}. Belum ada order terdaftar dengan kode ini.`);
    }
  };

  // Live Camera Scanner Lifecycle
  useEffect(() => {
    if (!isOpen || activeTab !== 'camera') {
      stopCamera();
      return;
    }

    startCamera();

    return () => {
      stopCamera();
    };
  }, [isOpen, activeTab]);

  const startCamera = async () => {
    setCameraError('');
    setIsScanningCamera(true);

    try {
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.QR_CODE,
        BarcodeFormat.EAN_13,
        BarcodeFormat.ITF,
        BarcodeFormat.DATA_MATRIX,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);

      const codeReader = new BrowserMultiFormatReader(hints);
      codeReaderRef.current = codeReader;

      if (!videoRef.current) return;

      // Start decoding from default/back video device
      await codeReader.decodeFromVideoDevice(
        null,
        videoRef.current,
        (result, err) => {
          if (result) {
            const text = result.getText();
            if (text && text.trim().length >= 6) {
              processScannedCodes([text.trim()]);
            }
          }
        }
      );
    } catch (err: any) {
      console.warn('Camera barcode scanner error:', err);
      setCameraError(
        'Kamera tidak dapat diakses atau izin ditolak. Silakan gunakan tab Unggah Foto Resi atau Input Manual.'
      );
      setIsScanningCamera(false);
    }
  };

  const stopCamera = () => {
    if (codeReaderRef.current) {
      try {
        codeReaderRef.current.reset();
      } catch {
        // Ignore
      }
      codeReaderRef.current = null;
    }
    setIsScanningCamera(false);
  };

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputResi.trim()) return;

    const rawList = inputResi.split(/[\n,;\s]+/).filter(Boolean);
    processScannedCodes(rawList);
    setInputResi('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileScanning(true);
    setMessage('');
    latestExtractedDataRef.current = null;

    try {
      // 1. Read base64 data for server OCR/AI scanner
      const base64Data: string = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      // 2. Barcode decoding from client canvas
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const imageEl = new Image();
        const objUrl = URL.createObjectURL(file);
        imageEl.onload = () => {
          URL.revokeObjectURL(objUrl);
          resolve(imageEl);
        };
        imageEl.onerror = reject;
        imageEl.src = objUrl;
      });

      let barcodes = await scanBarcodesFromImage(img);

      // 3. Always invoke Server OCR/AI scanner to capture Order ID, Store Name, Courier, etc.
      try {
        const res = await fetch('/api/scan-resi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64Data, fileName: file.name }),
        });
        if (res.ok) {
          const data = await res.json();
          latestExtractedDataRef.current = data;
          const found = data.noPesanan || data.noResi;
          if (found && !barcodes.includes(found)) {
            barcodes.unshift(found);
          }
        }
      } catch {
        // Fallback gracefully to barcode scanning
      }

      if (barcodes.length > 0) {
        processScannedCodes(barcodes);
      } else {
        setMessage('Tidak ditemukan barcode atau nomor resi pada gambar. Pastikan gambar jelas & terang.');
      }
    } catch (err: any) {
      console.warn('Error reading file barcode:', err);
      setMessage('Gagal membaca gambar resi.');
    } finally {
      setFileScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleMarkAsSent = async (order: OrderRecord) => {
    if (!requireAuth('menandai status Package Sent')) return;
    await updateOrder(order.id, {
      shippingStatus: 'Package Sent',
      checklistComplete: true,
      dropoffDate: todayStr,
    });
    setProcessedIds((prev) => [...prev, order.id]);
  };

  const handleBulkMarkAllSent = async () => {
    if (!requireAuth('menandai status Package Sent')) return;
    for (const order of matchedOrders) {
      if (!processedIds.includes(order.id)) {
        await updateOrder(order.id, {
          shippingStatus: 'Package Sent',
          checklistComplete: true,
          dropoffDate: todayStr,
        });
        setProcessedIds((prev) => [...prev, order.id]);
      }
    }
  };

  const handleCreateNewOrderForCode = (code: string) => {
    onClose();
    const scanData = latestExtractedDataRef.current;
    const parsed = parseResiText(code, [code]);

    const detectedStore =
      (scanData?.namaToko || '').trim() ||
      parsed.storeName ||
      'Sentra Naturindo Official';

    const detectedKurir =
      (scanData?.kurir || '').trim() ||
      parsed.kurir ||
      'J&T Express';

    const detectedMp =
      (scanData?.marketplace || '').trim() ||
      parsed.marketplace ||
      'Shopee';

    const detectedOrder =
      (scanData?.noPesanan || '').trim() ||
      parsed.noPesanan ||
      code;

    const autoOwner = getDefaultOwnerForStore(detectedStore, orders);

    // Pre-populate new order modal with scanned code and auto-detected details
    onEditOrder({
      id: '',
      workspaceId: '',
      orderDate: todayStr,
      storeName: detectedStore,
      ownerName: autoOwner,
      marketplace: (detectedMp || 'Shopee') as any,
      courier: detectedKurir,
      noPemesanan: detectedOrder,
      productsSold: (scanData?.produk || '').trim(),
      quantity: 1,
      checklistComplete: false,
      shippingStatus: 'Diproses',
      dropoffDate: '',
      drivePrintUrl: '',
      notes: '',
      disbursedToBri: false,
      disbursementStatus: 'Belum cair',
      disbursementDate: '',
      disbursementProof: '',
      verifiedCheck: false,
      authorId: '',
      updatedByName: '',
      createdAt: null,
      updatedAt: null,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden animate-scale-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Scan No. Pemesanan & Resi
              </h2>
              <p className="text-[11px] text-slate-500">
                Pindai barcode via Kamera Live, Unggah Foto Resi, atau Input Scanner USB.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-100/70 px-4 pt-2 gap-2 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('camera')}
            className={`px-3 py-2 font-semibold rounded-t-xl flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'camera'
                ? 'bg-white text-emerald-800 border-t-2 border-emerald-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Kamera Live</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`px-3 py-2 font-semibold rounded-t-xl flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'upload'
                ? 'bg-white text-emerald-800 border-t-2 border-emerald-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Unggah Foto Resi</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`px-3 py-2 font-semibold rounded-t-xl flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'manual'
                ? 'bg-white text-emerald-800 border-t-2 border-emerald-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>Scanner USB / Manual</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* 1. Camera Tab */}
          {activeTab === 'camera' && (
            <div className="space-y-3">
              <div className="relative rounded-2xl overflow-hidden bg-slate-950 aspect-video flex items-center justify-center border border-slate-800">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  playsInline
                  muted
                />
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-64 h-32 border-2 border-emerald-400/80 rounded-xl shadow-lg ring-4 ring-emerald-500/20 animate-pulse flex items-center justify-center">
                    <span className="text-[10px] font-bold text-white/90 bg-slate-950/70 px-2 py-0.5 rounded-full">
                      Arahkan Barcode ke Sini
                    </span>
                  </div>
                </div>
              </div>

              {cameraError ? (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>{cameraError}</span>
                </div>
              ) : (
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Kamera aktif memindai Code 128, QR Code, dan barcode ekspedisi...</span>
                  <span className="font-semibold text-emerald-700 flex items-center gap-1">
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Auto-Beep</span>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* 2. File Upload Tab */}
          {activeTab === 'upload' && (
            <div className="space-y-3">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50/40 hover:bg-emerald-50/80 rounded-2xl p-6 text-center cursor-pointer transition-all"
              >
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-2">
                  {fileScanning ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Upload className="w-5 h-5" />
                  )}
                </div>
                <span className="font-bold text-slate-800 block text-xs">
                  {fileScanning ? 'Membaca Barcode Resi...' : 'Klik untuk Pilih Foto / File Resi'}
                </span>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Format JPG, PNG, WEBP. Barcode pada label akan langsung dipindai.
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
          )}

          {/* 3. Manual / USB Gun Input Tab */}
          {activeTab === 'manual' && (
            <form onSubmit={handleManualSearch} className="space-y-2">
              <label className="block font-semibold text-slate-700">
                Input Barcode Scanner USB / Tempel Nomor Resi
              </label>
              <textarea
                rows={3}
                autoFocus
                value={inputResi}
                onChange={(e) => setInputResi(e.target.value)}
                placeholder="Scan dengan barcode gun di sini atau tempel nomor resi (bisa beberapa resi sekaligus)..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-900 font-mono text-xs focus:ring-2 focus:ring-emerald-500/20"
              />
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-400">
                  Tekan Enter atau klik Cari Order
                </span>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Cari Order</span>
                </button>
              </div>
            </form>
          )}

          {/* Message notification */}
          {message && (
            <div className="p-2.5 rounded-xl bg-slate-100 text-slate-800 font-medium text-[11px] border border-slate-200 flex items-center justify-between gap-2">
              <span>{message}</span>
              {(matchedOrders.length > 0 || unmatchedCodes.length > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    setMatchedOrders([]);
                    setUnmatchedCodes([]);
                    setMessage('');
                  }}
                  className="text-slate-500 hover:text-slate-800 text-[10px] font-semibold underline cursor-pointer"
                >
                  Bersihkan
                </button>
              )}
            </div>
          )}

          {/* Unmatched Codes (Helpful Quick-Action) */}
          {unmatchedCodes.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200/80 space-y-2">
              <div className="flex items-center gap-1.5 text-amber-900 font-semibold text-[11px]">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                <span>Kode Belum Terdaftar di Workspace:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {unmatchedCodes.map((code) => (
                  <div
                    key={code}
                    className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-amber-300 text-[11px]"
                  >
                    <span className="font-mono font-bold text-slate-800">{code}</span>
                    <button
                      type="button"
                      onClick={() => handleCreateNewOrderForCode(code)}
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 px-1.5 py-0.5 rounded cursor-pointer"
                    >
                      <PlusCircle className="w-3 h-3" />
                      <span>Buat Order</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Matched Orders Results */}
          {matchedOrders.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800">
                  Hasil Pencocokan ({matchedOrders.length} Order)
                </span>
                <button
                  type="button"
                  onClick={handleBulkMarkAllSent}
                  className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] flex items-center gap-1 cursor-pointer shadow-xs"
                >
                  <Truck className="w-3 h-3" />
                  <span>Tandai Semua "Package Sent"</span>
                </button>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {matchedOrders.map((ord) => {
                  const isSent =
                    ord.shippingStatus === 'Package Sent' || processedIds.includes(ord.id);

                  return (
                    <div
                      key={ord.id}
                      className="p-3 rounded-xl border border-slate-200/80 bg-slate-50/50 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900">
                            {ord.noPemesanan || ord.id}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {ord.marketplace}
                          </span>
                          {ord.courier && (
                            <span className="text-[10px] font-medium text-slate-500">
                              &bull; {ord.courier}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-600 mt-0.5">
                          <span className="font-semibold text-slate-800">{ord.storeName}</span>
                          {ord.ownerName ? (
                            <span className="text-slate-500"> ({ord.ownerName})</span>
                          ) : null}{' '}
                          &bull; <strong>{ord.productsSold}</strong> (Qty: {ord.quantity})
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isSent ? (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Package Sent</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleMarkAsSent(ord)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[10px] cursor-pointer shadow-xs"
                          >
                            Tandai Terkirim
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            stopCamera();
                            onClose();
                            onEditOrder(ord);
                          }}
                          className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                          title="Buka Form Edit Order"
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
