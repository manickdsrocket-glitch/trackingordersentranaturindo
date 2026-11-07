import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Plus,
  FileSpreadsheet,
  QrCode,
  Check,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Edit2,
  Trash2,
  Copy,
  ChevronDown,
  RotateCw,
  ShoppingBag,
  CreditCard,
  Truck,
  ArrowUpDown,
  Download,
  Printer,
  FolderOpen,
  Clock,
  Calendar,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAuth } from '../context/AuthContext';
import {
  OrderRecord,
  MarketplaceType,
  ShippingStatus,
  DisbursementStatus,
  calculateDisbursementProcessDays,
  GSHEET_DEFAULT_OWNERS,
  DEFAULT_STORE_OWNER_MAP,
  getDefaultOwnerForStore,
} from '../types';
import { ResiPrintModal } from './ResiPrintModal';
import { SENTRA_RESI_DRIVE_FOLDER_URL } from '../utils/googleDriveUpload';

interface OrdersViewProps {
  onOpenOrderModal: (orderToEdit?: OrderRecord) => void;
  onOpenScanModal: () => void;
  onOpenExportModal: () => void;
}

export const OrdersView: React.FC<OrdersViewProps> = ({
  onOpenOrderModal,
  onOpenScanModal,
  onOpenExportModal,
}) => {
  const {
    orders,
    deleteOrder,
    toggleOrderChecklist,
    toggleOrderBriDisbursement,
    updateOrder,
  } = useWorkspace();
  const { user } = useAuth();

  // Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOwner, setSelectedOwner] = useState<string>('all');
  const [selectedMarketplace, setSelectedMarketplace] = useState<string>('all');
  const [selectedShippingStatus, setSelectedShippingStatus] = useState<string>('all');
  const [selectedPackingStatus, setSelectedPackingStatus] = useState<string>('all');
  const [selectedBriStatus, setSelectedBriStatus] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [resiToPrint, setResiToPrint] = useState<OrderRecord | null>(null);

  const todayStr = new Date().toISOString().split('T')[0];

  const requireAuth = (actionName: string): boolean => {
    if (!user) {
      alert(`Akses ditolak: Anda harus login dengan akun Google terlebih dahulu untuk ${actionName}.`);
      return false;
    }
    return true;
  };

  // Daftar unik pemilik toko (dari preset default & data order live)
  const availableOwners = useMemo(() => {
    const list = new Set<string>(GSHEET_DEFAULT_OWNERS || []);
    if (DEFAULT_STORE_OWNER_MAP) {
      Object.values(DEFAULT_STORE_OWNER_MAP).forEach((o) => {
        if (o && o.trim()) list.add(o.trim());
      });
    }
    orders.forEach((o) => {
      const resolved = (o.ownerName || getDefaultOwnerForStore(o.storeName, orders) || '').trim();
      if (resolved) list.add(resolved);
    });
    return Array.from(list).sort((a, b) =>
      a.localeCompare(b, 'id', { sensitivity: 'base' })
    );
  }, [orders]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const orderOwner = (order.ownerName || getDefaultOwnerForStore(order.storeName, orders) || '').trim();

      // Search
      const searchMatch =
        searchTerm === '' ||
        (order.noPemesanan || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.storeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        orderOwner.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.courier || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.productsSold.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.notes || '').toLowerCase().includes(searchTerm.toLowerCase());

      if (!searchMatch) return false;

      // Filter Pemilik Toko
      if (selectedOwner !== 'all' && orderOwner.toLowerCase() !== selectedOwner.toLowerCase()) {
        return false;
      }

      // Marketplace
      if (selectedMarketplace !== 'all' && order.marketplace !== selectedMarketplace) {
        return false;
      }

      // Shipping Status
      if (selectedShippingStatus !== 'all' && order.shippingStatus !== selectedShippingStatus) {
        return false;
      }

      // Checklist Packing Status
      if (selectedPackingStatus === 'selesai' && !order.checklistComplete) {
        return false;
      }
      if (selectedPackingStatus === 'belum' && order.checklistComplete) {
        return false;
      }

      // BRI Status
      if (selectedBriStatus === 'cair' && !order.disbursedToBri && order.disbursementStatus !== 'Sudah cair') {
        return false;
      }
      if (selectedBriStatus === 'belum' && (order.disbursedToBri || order.disbursementStatus === 'Sudah cair')) {
        return false;
      }

      // Rentang Tanggal Order (Dari Tanggal - Sampai Tanggal)
      if (startDate && order.orderDate && order.orderDate < startDate) {
        return false;
      }
      if (endDate && order.orderDate && order.orderDate > endDate) {
        return false;
      }

      return true;
    });
  }, [
    orders,
    searchTerm,
    selectedOwner,
    selectedMarketplace,
    selectedShippingStatus,
    selectedPackingStatus,
    selectedBriStatus,
    startDate,
    endDate,
  ]);

  const unPackedCount = useMemo(
    () => orders.filter((o) => !o.checklistComplete).length,
    [orders]
  );
  const packedCount = useMemo(
    () => orders.filter((o) => o.checklistComplete).length,
    [orders]
  );

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedOrderIds(filteredOrders.map((o) => o.id));
    } else {
      setSelectedOrderIds([]);
    }
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedOrderIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Bulk actions
  const handleBulkMarkPacked = async () => {
    if (!requireAuth('mencentang checklist packing selesai secara massal')) return;
    if (selectedOrderIds.length === 0) return;
    for (const id of selectedOrderIds) {
      await updateOrder(id, {
        checklistComplete: true,
      });
    }
    setSelectedOrderIds([]);
  };

  const handleBulkMarkSent = async () => {
    if (!requireAuth('mengubah status pengiriman secara massal')) return;
    if (selectedOrderIds.length === 0) return;
    for (const id of selectedOrderIds) {
      await updateOrder(id, {
        shippingStatus: 'Package Sent',
        checklistComplete: true,
        dropoffDate: todayStr,
      });
    }
    setSelectedOrderIds([]);
  };

  const handleBulkMarkBriDisbursed = async () => {
    if (!requireAuth('mencatat pencairan BRI secara massal')) return;
    if (selectedOrderIds.length === 0) return;
    for (const id of selectedOrderIds) {
      await updateOrder(id, {
        disbursedToBri: true,
        disbursementStatus: 'Sudah cair',
        disbursementDate: todayStr,
      });
    }
    setSelectedOrderIds([]);
  };

  const handleBulkDeleteOrders = async () => {
    if (!requireAuth('menghapus order terpilih')) return;
    if (selectedOrderIds.length === 0) return;
    const idsToDelete = [...selectedOrderIds];
    setSelectedOrderIds([]);
    for (const id of idsToDelete) {
      await deleteOrder(id);
    }
  };

  const getMarketplaceBadge = (mp: MarketplaceType) => {
    switch (mp) {
      case 'Shopee':
        return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'TikTok Shop':
        return 'bg-slate-900 text-cyan-300 border-slate-700';
      case 'Tokopedia/Tokped':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Lazada':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  const getShippingBadge = (st: ShippingStatus) => {
    switch (st) {
      case 'Package Sent':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'Siap Kirim':
        return 'bg-teal-50 text-teal-800 border-teal-200';
      case 'Diproses':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'Retur':
        return 'bg-rose-100 text-rose-800 border-rose-300';
      case 'Dibatalkan':
        return 'bg-slate-200 text-slate-700 border-slate-300';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <div className="space-y-4">
      {/* Read-Only Notice if unauthenticated */}
      {!user && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-center justify-between text-xs text-amber-900 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="font-semibold">Mode Hanya Lihat (Read-Only):</span>
            <span>Anda dapat meninjau order. Untuk menambah, mengedit, scan resi, atau mencentang data, silakan login dengan Google di navigasi atas.</span>
          </div>
        </div>
      )}

      {/* Top Header & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-emerald-600" />
              <span>Tracking Order Marketplace</span>
            </h1>
            <p className="text-xs text-slate-500">
              Format buku pesanan Sentra Naturindo: checklist packing, status kirim, dan pencairan rekening BRI.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                if (requireAuth('menambah order baru')) {
                  onOpenOrderModal();
                }
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Order Baru</span>
            </button>
            <button
              onClick={() => {
                if (requireAuth('menggunakan fitur scan resi')) {
                  onOpenScanModal();
                }
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
              title="Scan / Cek Nomor Pemesanan / Resi"
            >
              <QrCode className="w-4 h-4 text-slate-600" />
              <span>Scan Resi</span>
            </button>
            <button
              onClick={onOpenExportModal}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
              title="Import atau Export Excel"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
              <span>Import/Export</span>
            </button>
            <a
              href={SENTRA_RESI_DRIVE_FOLDER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors"
              title="Buka Folder Google Drive Upload Resi"
            >
              <FolderOpen className="w-4 h-4 text-blue-600" />
              <span>Folder Drive Resi</span>
            </a>
          </div>
        </div>

        {/* Filters Row (Input Search, Filter Tanggal, Pemilik Toko & Status Lainnya) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 xl:grid-cols-7 gap-2.5 pt-2 border-t border-slate-100">
          {/* Search box */}
          <div className="relative sm:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari No Pesanan, Toko, Pemilik, Produk, Kurir..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600"
              >
                &times;
              </button>
            )}
          </div>

          {/* Filter Rentang Tanggal (Dari - Sampai) */}
          <div className="sm:col-span-2 flex items-center gap-1.5 bg-slate-50/70 px-2.5 py-1.5 rounded-xl border border-slate-200">
            <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-white px-2 py-1 text-[11px] rounded-lg border border-slate-200 text-slate-700 focus:outline-none focus:border-emerald-500 font-mono"
              title="Dari Tanggal"
            />
            <span className="text-[10px] text-slate-400 font-semibold uppercase">s/d</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-white px-2 py-1 text-[11px] rounded-lg border border-slate-200 text-slate-700 focus:outline-none focus:border-emerald-500 font-mono"
              title="Sampai Tanggal"
            />
            {(startDate || endDate) && (
              <button
                type="button"
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
                className="text-[10px] font-bold text-rose-600 hover:text-rose-700 px-1 cursor-pointer"
                title="Hapus filter tanggal"
              >
                Reset
              </button>
            )}
          </div>

          {/* Filter Pemilik Toko (Dropdown) */}
          <div>
            <select
              value={selectedOwner}
              onChange={(e) => setSelectedOwner(e.target.value)}
              className={`w-full px-3 py-2 text-xs rounded-xl border transition-all text-slate-700 font-medium ${
                selectedOwner !== 'all'
                  ? 'border-emerald-500 bg-emerald-50/60 text-emerald-900 font-bold ring-2 ring-emerald-500/20'
                  : 'border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20'
              }`}
            >
              <option value="all">Semua Pemilik Toko</option>
              {availableOwners.map((owner) => (
                <option key={owner} value={owner}>
                  Pemilik: {owner}
                </option>
              ))}
            </select>
          </div>

          {/* Marketplace Filter */}
          <div>
            <select
              value={selectedMarketplace}
              onChange={(e) => setSelectedMarketplace(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-slate-700 font-medium"
            >
              <option value="all">Semua Marketplace</option>
              <option value="Shopee">Shopee</option>
              <option value="TikTok Shop">TikTok Shop</option>
              <option value="Tokopedia/Tokped">Tokopedia</option>
              <option value="Lazada">Lazada</option>
              <option value="Offline/Lainnya">Offline / Lainnya</option>
            </select>
          </div>

          {/* Checklist Packing Filter */}
          <div>
            <select
              value={selectedPackingStatus}
              onChange={(e) => setSelectedPackingStatus(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-slate-700 font-medium"
            >
              <option value="all">Checklist Packing (Semua)</option>
              <option value="belum">Belum Packing ({unPackedCount})</option>
              <option value="selesai">Packing Selesai ({packedCount})</option>
            </select>
          </div>

          {/* Status Kirim */}
          <div>
            <select
              value={selectedShippingStatus}
              onChange={(e) => setSelectedShippingStatus(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-slate-700 font-medium"
            >
              <option value="all">Semua Status Kirim</option>
              <option value="Diproses">Diproses</option>
              <option value="Siap Kirim">Siap Kirim</option>
              <option value="Package Sent">Package Sent</option>
              <option value="Retur">Retur</option>
              <option value="Dibatalkan">Dibatalkan</option>
            </select>
          </div>

          {/* Pencairan BRI Filter */}
          <div>
            <select
              value={selectedBriStatus}
              onChange={(e) => setSelectedBriStatus(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-slate-700 font-medium"
            >
              <option value="all">Status BRI (Semua)</option>
              <option value="cair">Sudah Cair ke BRI</option>
              <option value="belum">Belum Cair</option>
            </select>
          </div>
        </div>

        {/* Quick Filter Pills Platform & Indikator Hasil */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-400 mr-1">Platform:</span>
            {['all', 'Shopee', 'TikTok Shop', 'Tokopedia/Tokped', 'Lazada'].map((mp) => (
              <button
                key={mp}
                onClick={() => setSelectedMarketplace(mp)}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all cursor-pointer ${
                  selectedMarketplace === mp
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {mp === 'all' ? 'Semua Platform' : mp}
              </button>
            ))}

            <span className="text-slate-300 mx-1">|</span>
            <button
              type="button"
              onClick={() =>
                setSelectedPackingStatus(
                  selectedPackingStatus === 'belum' ? 'all' : 'belum'
                )
              }
              className={`px-2.5 py-1 text-xs rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                selectedPackingStatus === 'belum'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              <span>Belum Checklist Packing ({unPackedCount})</span>
            </button>
            <button
              type="button"
              onClick={() =>
                setSelectedPackingStatus(
                  selectedPackingStatus === 'selesai' ? 'all' : 'selesai'
                )
              }
              className={`px-2.5 py-1 text-xs rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                selectedPackingStatus === 'selesai'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              <Check className="w-3 h-3" />
              <span>Packing Selesai ({packedCount})</span>
            </button>
          </div>

          <div className="text-xs text-slate-500 font-medium">
            Menampilkan <strong className="text-slate-800">{filteredOrders.length}</strong> dari {orders.length} order
          </div>
        </div>
      </div>

      {/* Bulk Action Bar (when rows selected) */}
      {selectedOrderIds.length > 0 && (
        <div className="bg-emerald-900 text-white p-3 rounded-xl flex flex-wrap items-center justify-between gap-2 shadow-md text-xs animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="bg-emerald-500 text-slate-950 font-bold px-2 py-0.5 rounded-full text-[11px]">
              {selectedOrderIds.length}
            </span>
            <span className="font-semibold">Order terpilih</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleBulkMarkPacked}
              className="bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Checklist Packing Selesai</span>
            </button>
            <button
              onClick={handleBulkMarkSent}
              className="bg-emerald-700 hover:bg-emerald-600 px-3 py-1.5 rounded-lg font-medium flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Tandai Package Sent</span>
            </button>
            <button
              onClick={handleBulkMarkBriDisbursed}
              className="bg-teal-700 hover:bg-teal-600 px-3 py-1.5 rounded-lg font-medium flex items-center gap-1 cursor-pointer transition-colors"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Tandai Cair ke BRI</span>
            </button>
            <button
              onClick={handleBulkDeleteOrders}
              className="bg-rose-600 hover:bg-rose-500 px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus Terpilih ({selectedOrderIds.length})</span>
            </button>
            <button
              onClick={() => setSelectedOrderIds([])}
              className="text-slate-300 hover:text-white px-2 py-1.5"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Orders Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/90 text-slate-600 font-semibold border-b border-slate-200 text-[11px] uppercase tracking-wider">
                <th className="py-3 px-3 w-8 text-center">
                  <input
                    type="checkbox"
                    checked={
                      filteredOrders.length > 0 &&
                      selectedOrderIds.length === filteredOrders.length
                    }
                    onChange={handleSelectAll}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                </th>
                <th className="py-3 px-3 whitespace-nowrap">Tanggal</th>
                <th className="py-3 px-3 whitespace-nowrap">No. Pemesanan / Order ID</th>
                <th className="py-3 px-3 text-center whitespace-nowrap">Resi</th>
                <th className="py-3 px-3 whitespace-nowrap">Toko & Platform</th>
                <th className="py-3 px-3 whitespace-nowrap">Kurir Ekspedisi</th>
                <th className="py-3 px-3 whitespace-nowrap">Produk Herbal</th>
                <th className="py-3 px-3 text-center whitespace-nowrap">Qty</th>
                <th className="py-3 px-3 text-center whitespace-nowrap" title="Klik langsung untuk Checklist Packing Selesai tanpa perlu buka Edit">
                  Checklist Packing
                </th>
                <th className="py-3 px-3 whitespace-nowrap">Status Kirim</th>
                <th className="py-3 px-3 whitespace-nowrap">Drop Off</th>
                <th
                  className="py-3 px-3 text-center whitespace-nowrap"
                  title="Hitungan hari proses pencairan sejak drop off sampai dana berhasil dicairkan atau bukti diunggah (berhenti otomatis saat sudah cair)"
                >
                  Proses Pencairan
                </th>
                <th className="py-3 px-3 whitespace-nowrap">Pencairan BRI</th>
                <th className="py-3 px-3 text-center whitespace-nowrap">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-12 text-center text-slate-400">
                    <ShoppingBag className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p className="font-medium">Tidak ada data order yang sesuai filter.</p>
                    <p className="text-[11px] mt-1 text-slate-400">
                      Ubah kata kunci pencarian, rentang tanggal, atau klik "+ Tambah Order Baru" untuk mencatat order.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const isSelected = selectedOrderIds.includes(order.id);
                  const isBriDisbursed = order.disbursedToBri || order.disbursementStatus === 'Sudah cair';
                  const hasResiFile = Boolean(order.resiFileData || order.drivePrintUrl);
                  const displayOwner = (order.ownerName || getDefaultOwnerForStore(order.storeName, orders) || '').trim();

                  return (
                    <tr
                      key={order.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isSelected ? 'bg-emerald-50/50' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectOne(order.id)}
                          className="rounded text-emerald-600 focus:ring-emerald-500"
                        />
                      </td>

                      {/* Tanggal Order */}
                      <td className="py-3 px-3 whitespace-nowrap font-mono text-slate-700">
                        {order.orderDate}
                      </td>

                      {/* No. Pemesanan / Order ID */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-[11px] border border-slate-200">
                            {order.noPemesanan || order.id}
                          </span>
                          <button
                            onClick={() => handleCopyText(order.noPemesanan || order.id, order.id)}
                            title="Salin No. Pemesanan / Order ID"
                            className="text-slate-400 hover:text-slate-700 p-1 rounded cursor-pointer"
                          >
                            {copiedId === order.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                        {order.noResi && order.noResi !== order.noPemesanan && (
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            Resi: {order.noResi}
                          </div>
                        )}
                      </td>

                      {/* Kolom Resi (Logo Saja -> Klik untuk Print) */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        {hasResiFile ? (
                          <button
                            type="button"
                            onClick={() => setResiToPrint(order)}
                            title="Klik untuk membuka & mencetak (print) file resi"
                            className="w-8 h-8 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white inline-flex items-center justify-center shadow-xs transition-all cursor-pointer mx-auto"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (requireAuth('mengunggah file resi')) {
                                onOpenOrderModal(order);
                              }
                            }}
                            title="Belum ada file resi — Klik untuk upload resi"
                            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-emerald-50 text-slate-400 hover:text-emerald-700 border border-slate-200 inline-flex items-center justify-center transition-all cursor-pointer mx-auto"
                          >
                            <QrCode className="w-4 h-4" />
                          </button>
                        )}
                      </td>

                      {/* Toko, Pemilik & Marketplace */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-medium text-slate-800">{order.storeName}</div>
                        {displayOwner && (
                          <div className="text-[10px] text-slate-500 font-medium">
                            Pemilik: <span className="text-emerald-800 font-bold">{displayOwner}</span>
                          </div>
                        )}
                        <span
                          className={`inline-block mt-0.5 px-2 py-0.2 rounded-full text-[10px] font-semibold border ${getMarketplaceBadge(
                            order.marketplace
                          )}`}
                        >
                          {order.marketplace}
                        </span>
                      </td>

                      {/* Kurir Ekspedisi */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {order.courier || '-'}
                        </span>
                      </td>

                      {/* Produk Terjual */}
                      <td className="py-3 px-3 max-w-[200px]" title={order.productsSold}>
                        <div className="font-medium text-slate-900 truncate">
                          {order.productsSold}
                        </div>
                        {order.notes && (
                          <div className="text-[10px] text-slate-400 truncate mt-0.5 italic">
                            Catatan: {order.notes}
                          </div>
                        )}
                      </td>

                      {/* Qty */}
                      <td className="py-3 px-3 text-center font-bold text-slate-900">
                        {order.quantity}
                      </td>

                      {/* Checklist Packing Selesai */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            if (requireAuth('mengubah checklist packing')) {
                              toggleOrderChecklist(order.id, order.checklistComplete);
                            }
                          }}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer border ${
                            order.checklistComplete
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-2xs'
                              : 'bg-amber-50 hover:bg-emerald-50 text-amber-900 hover:text-emerald-800 border-amber-300 hover:border-emerald-400'
                          }`}
                          title={
                            order.checklistComplete
                              ? 'Checklist Packing Selesai (Klik untuk batalkan centang)'
                              : 'Belum Checklist Packing — Klik langsung di sini untuk tandai Packing Selesai'
                          }
                        >
                          <span
                            className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                              order.checklistComplete
                                ? 'bg-white text-emerald-700 border-white'
                                : 'bg-white border-amber-400 text-transparent'
                            }`}
                          >
                            <Check className="w-3 h-3 stroke-[3]" />
                          </span>
                          <span>
                            {order.checklistComplete ? 'Packing Selesai' : 'Belum Packing'}
                          </span>
                        </button>
                      </td>

                      {/* Status Kirim */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <select
                          value={order.shippingStatus}
                          onChange={(e) => {
                            if (!requireAuth('mengubah status pengiriman')) return;
                            const nextStatus = e.target.value as ShippingStatus;
                            updateOrder(order.id, {
                              shippingStatus: nextStatus,
                              ...(nextStatus === 'Package Sent' && !order.dropoffDate
                                ? { dropoffDate: todayStr, checklistComplete: true }
                                : {}),
                            });
                          }}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold border cursor-pointer focus:outline-none ${getShippingBadge(
                            order.shippingStatus
                          )}`}
                          title="Ubah Status Kirim langsung dari tabel"
                        >
                          <option value="Diproses">Diproses</option>
                          <option value="Siap Kirim">Siap Kirim</option>
                          <option value="Package Sent">Package Sent</option>
                          <option value="Retur">Retur</option>
                          <option value="Dibatalkan">Dibatalkan</option>
                        </select>
                      </td>

                      {/* Drop Off */}
                      <td className="py-3 px-3 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                        {order.dropoffDate || '-'}
                      </td>

                      {/* Proses Pencairan */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        {(() => {
                          const aging = calculateDisbursementProcessDays(order, todayStr);
                          if (aging.isCair) {
                            return (
                              <span
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs"
                                title={`Pencairan selesai dalam ${aging.days} hari (mulai ${aging.startDate} s/d cair ${aging.endDate})`}
                              >
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>{aging.days} hari (Cair)</span>
                              </span>
                            );
                          }
                          if (!aging.hasDropoff && order.shippingStatus !== 'Package Sent') {
                            return (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200"
                                title={`Order dicatat ${aging.startDate}, belum drop off`}
                              >
                                <span>{aging.days} hari (Menunggu Kirim)</span>
                              </span>
                            );
                          }
                          return (
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border shadow-2xs ${
                                aging.days >= 4
                                  ? 'bg-rose-50 text-rose-800 border-rose-300'
                                  : aging.days >= 2
                                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                                  : 'bg-blue-50 text-blue-800 border-blue-200'
                              }`}
                              title={`Proses pencairan berjalan sejak drop off ${aging.startDate} (${aging.days} hari)`}
                            >
                              <Clock className="w-3 h-3 text-slate-500" />
                              <span>{aging.days === 0 ? 'Hari ini' : `${aging.days} hari`} (Proses)</span>
                            </span>
                          );
                        })()}
                      </td>

                      {/* Masuk Rekening BRI + Bukti */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              if (!requireAuth('mengubah status pencairan BRI')) return;
                              if (!isBriDisbursed) {
                                onOpenOrderModal({
                                  ...order,
                                  disbursedToBri: true,
                                  disbursementStatus: 'Sudah cair',
                                  disbursementDate:
                                    order.disbursementDate ||
                                    new Date().toISOString().split('T')[0],
                                });
                              } else {
                                toggleOrderBriDisbursement(order.id, isBriDisbursed);
                              }
                            }}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all cursor-pointer ${
                              isBriDisbursed
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                                : 'bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200'
                            }`}
                            title={
                              isBriDisbursed
                                ? 'Klik untuk ubah status pencairan'
                                : 'Klik untuk tandai Dana Sudah Cair & Upload Bukti BRI ke Google Drive'
                            }
                          >
                            <CreditCard className="w-3 h-3" />
                            <span>{isBriDisbursed ? 'Sudah Cair BRI' : 'Belum Cair'}</span>
                          </button>

                          {order.disbursementProof && order.disbursementProof.startsWith('http') ? (
                            <a
                              href={order.disbursementProof}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 hover:border-blue-600 shadow-2xs transition-all cursor-pointer"
                              title="Buka File Bukti Pencairan BRI di Google Drive"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          ) : order.disbursementProofData ? (
                            <a
                              href={order.disbursementProofData}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 hover:border-blue-600 shadow-2xs transition-all cursor-pointer"
                              title="Buka Bukti Pencairan BRI"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          ) : isBriDisbursed ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (requireAuth('mengunggah bukti pencairan BRI')) {
                                  onOpenOrderModal(order);
                                }
                              }}
                              className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-400 hover:text-emerald-700 border border-slate-200 hover:border-emerald-300 transition-colors cursor-pointer"
                              title="Upload Bukti Pencairan BRI ke Google Drive"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          ) : null}
                        </div>
                        {order.disbursementDate && (
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            Tgl: {order.disbursementDate}
                          </div>
                        )}
                      </td>

                      {/* Aksi */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              onOpenOrderModal(order);
                            }}
                            className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                            title="Edit Order"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!requireAuth('menghapus order')) return;
                              setSelectedOrderIds((prev) =>
                                prev.filter((id) => id !== order.id)
                              );
                              await deleteOrder(order.id);
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Hapus Order Langsung"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Preview & Print Resi */}
      <ResiPrintModal order={resiToPrint} onClose={() => setResiToPrint(null)} />
    </div>
  );
};