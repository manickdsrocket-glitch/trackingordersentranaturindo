import React, { useState } from 'react';
import { X, FileSpreadsheet, Download, Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAuth } from '../context/AuthContext';
import {
  MarketplaceType,
  ShippingStatus,
  DisbursementStatus,
  getDefaultOwnerForStore,
  calculateDisbursementProcessDays,
} from '../types';

interface ImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { orders, stocks, addOrder, logActivity } = useWorkspace();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [importing, setImporting] = useState(false);
  const [importSuccessCount, setImportSuccessCount] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  // Export to Excel with two clean formatted sheets
  const handleExportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      // 1. Sheet Tracking Orders
      const today = new Date().toISOString().split('T')[0];
      const orderData = orders.map((o, idx) => ({
        No: idx + 1,
        'Tanggal Order': o.orderDate || '',
        'No. Pemesanan / Resi': o.noPemesanan || o.id,
        'Nama Toko': o.storeName || '',
        'Pemilik Toko': o.ownerName || getDefaultOwnerForStore(o.storeName, orders),
        Marketplace: o.marketplace || '',
        'Kurir Ekspedisi': o.courier || '-',
        'Produk Terjual': o.productsSold || '',
        'Jumlah (Qty)': o.quantity || 1,
        'Checklist Packing': o.checklistComplete ? 'SUDAH' : 'BELUM',
        'Status Kirim': o.shippingStatus || '',
        'Tanggal Drop Off': o.dropoffDate || '',
        'Proses Pencairan (Hari)': calculateDisbursementProcessDays(o, today).label,
        'Masuk Rekening BRI': o.disbursedToBri || o.disbursementStatus === 'Sudah cair' ? 'SUDAH CAIR' : 'BELUM CAIR',
        'Tanggal Cair BRI': o.disbursementDate || '',
        'No. Ref / Bukti BRI': o.disbursementProof || '',
        'Link Label Drive': o.drivePrintUrl || '',
        Catatan: o.notes || '',
      }));

      const wsOrders = XLSX.utils.json_to_sheet(orderData);
      XLSX.utils.book_append_sheet(wb, wsOrders, 'Tracking Order');

      // 2. Sheet Stok Barang
      const stockData = stocks.map((s) => ({
        SKU: s.sku || '',
        'Nama Produk Herbal': s.productName || '',
        Kategori: s.category || '',
        'Stok Masuk (In)': s.stockIn || 0,
        'Stok Keluar (Out)': s.stockOut || 0,
        'Stok Ready': s.stockReady || 0,
        'Batas Minimum': s.minThreshold || 0,
        'Status Peringatan':
          s.stockReady <= 0
            ? 'HABIS'
            : s.stockReady <= s.minThreshold
            ? 'MENIPIS'
            : 'AMAN',
        'Exp Tercepat': s.expTercepat || '',
        'Exp Terlama': s.expTerlama || '',
        Satuan: s.unit || 'Botol',
        'Restock Terakhir': s.lastRestockDate || '',
      }));

      const wsStocks = XLSX.utils.json_to_sheet(stockData);
      XLSX.utils.book_append_sheet(wb, wsStocks, 'Stok Barang');

      // Download file
      XLSX.writeFile(wb, `Sentra_Naturindo_Order_Stok_${today}.xlsx`);
    } catch (err: any) {
      setErrorMsg('Gagal mengunduh file Excel: ' + (err.message || ''));
    }
  };

  // Import from Excel or CSV
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user) {
      setErrorMsg('Akses ditolak: Anda harus login dengan akun Google terlebih dahulu untuk mengimpor order.');
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setErrorMsg('');
    setImportSuccessCount(null);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows: any[] = XLSX.utils.sheet_to_json(worksheet);

        if (rows.length === 0) {
          setErrorMsg('File Excel tidak memiliki baris data.');
          setImporting(false);
          return;
        }

        let imported = 0;
        const today = new Date().toISOString().split('T')[0];

        for (const row of rows) {
          // Normalize column names
          const storeName = row['Nama Toko'] || row['storeName'] || row['Toko'] || 'Sentra Naturindo Official';
          const courier = String(row['Kurir Ekspedisi'] || row['Kurir'] || row['courier'] || 'J&T Express');
          const productsSold = row['Produk Terjual'] || row['productsSold'] || row['Produk'] || 'Naturindo Herbal';
          const quantity = Number(row['Jumlah (Qty)'] || row['quantity'] || row['Qty'] || 1);
          const rawMp = row['Marketplace'] || row['marketplace'] || 'Shopee';
          const noPemesanan = String(row['No. Pemesanan / Resi'] || row['noPemesanan'] || row['No Resi'] || '');
          const orderDate = String(row['Tanggal Order'] || row['orderDate'] || row['Tanggal'] || today);
          const notes = String(row['Catatan'] || row['notes'] || '');
          const drivePrintUrl = String(row['Link Label Drive'] || row['drivePrintUrl'] || '');

          let marketplace: MarketplaceType = 'Shopee';
          if (String(rawMp).toLowerCase().includes('tiktok')) marketplace = 'TikTok Shop';
          else if (String(rawMp).toLowerCase().includes('tokped') || String(rawMp).toLowerCase().includes('tokopedia')) marketplace = 'Tokopedia/Tokped';
          else if (String(rawMp).toLowerCase().includes('lazada')) marketplace = 'Lazada';
          else if (String(rawMp).toLowerCase().includes('offline')) marketplace = 'Offline/Lainnya';

          await addOrder({
            orderDate,
            storeName,
            marketplace,
            courier,
            ownerName: String(row['Pemilik Toko'] || row['ownerName'] || row['Pemilik'] || getDefaultOwnerForStore(storeName, orders)).trim(),
            noPemesanan: noPemesanan || `IMP-${Date.now().toString().slice(-6)}`,
            productsSold,
            quantity: quantity > 0 ? quantity : 1,
            checklistComplete: false,
            shippingStatus: 'Diproses' as ShippingStatus,
            dropoffDate: '',
            drivePrintUrl,
            notes,
            disbursedToBri: false,
            disbursementStatus: 'Belum cair' as DisbursementStatus,
            disbursementDate: '',
            disbursementProof: '',
            verifiedCheck: false,
          });
          imported++;
        }

        setImportSuccessCount(imported);
        await logActivity('order', 'Import Excel Berhasil', `${imported} order berhasil diimport ke workspace.`);
      } catch (err: any) {
        setErrorMsg('Gagal membaca file: ' + (err.message || 'Format tidak sesuai'));
      } finally {
        setImporting(false);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-scale-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Sinkronisasi Excel (.xlsx / .csv)
              </h2>
              <p className="text-[11px] text-slate-500">
                Ekspor laporan terpadu atau impor batch pesanan dari spreadsheet.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="p-5 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('export')}
              className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'export'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Ekspor ke Excel</span>
            </button>
            <button
              onClick={() => setActiveTab('import')}
              className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'import'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Impor dari Excel</span>
            </button>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {activeTab === 'export' ? (
            <div className="space-y-4 text-slate-600">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                <h4 className="font-bold text-slate-800 text-xs">Isi Workbook Excel yang Diekspor:</h4>
                <ul className="space-y-1 text-[11px] list-disc list-inside text-slate-600">
                  <li>
                    <strong>Sheet 1 (Tracking Order):</strong> {orders.length} baris riwayat order, no pesanan, toko, checklist, status kirim, dan status pencairan rekening BRI.
                  </li>
                  <li>
                    <strong>Sheet 2 (Stok Barang):</strong> {stocks.length} SKU master herbal Naturindo lengkap dengan Stok Ready, Stok Keluar, batas minimum, dan exp date.
                  </li>
                </ul>
              </div>

              <button
                onClick={handleExportExcel}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Unduh File Excel (.xlsx) Sekarang</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600 space-y-1.5">
                <p className="font-semibold text-slate-800">Petunjuk Impor:</p>
                <p>
                  Pastikan spreadsheet Anda memiliki kolom: <code>Nama Toko</code>, <code>Marketplace</code>,{' '}
                  <code>Kurir Ekspedisi</code>, <code>No. Pemesanan / Resi</code>, <code>Produk Terjual</code>, dan <code>Jumlah (Qty)</code>.
                </p>
              </div>

              {!user && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Anda harus login dengan akun Google terlebih dahulu untuk mengimpor file data.</span>
                </div>
              )}

              <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-emerald-500 transition-colors bg-slate-50/50">
                <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <label className={`block font-bold text-slate-800 text-xs mb-1 ${!user ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                  <span>Pilih File Excel (.xlsx atau .csv)</span>
                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleFileUpload}
                    disabled={importing || !user}
                    className="hidden"
                  />
                </label>
                <p className="text-[11px] text-slate-500">
                  {!user ? 'Login diperlukan' : importing ? 'Sedang memproses data...' : 'Klik untuk mengunggah'}
                </p>
              </div>

              {importSuccessCount !== null && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-2 text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Berhasil mengimpor <strong>{importSuccessCount}</strong> data order ke workspace!
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
