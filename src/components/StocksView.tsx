import React, { useState, useMemo } from 'react';
import {
  Boxes,
  Plus,
  Search,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Edit2,
  Trash2,
  FileSpreadsheet,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Tag,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAuth } from '../context/AuthContext';
import { StockItem, NATURINDO_CATALOG } from '../types';

interface StocksViewProps {
  onOpenStockModal: (stockToEdit?: StockItem) => void;
  onOpenAdjustmentModal: (stockId: string, defaultType: 'in' | 'out') => void;
  onOpenExportModal: () => void;
}

// Produk baru / varian tambahan (Premium, GO, Omega Capsul, Soya Cair) dibandingkan 26 produk reguler awal
const NEW_VARIANT_OR_PRODUCT_NAMES = new Set(
  [
    'Azzahra Premium',
    'Biolipid Premium',
    'Brainovit Premium',
    'Bronc Fit Premium',
    'BV. Flow Premium',
    'Cabone Premium',
    'Carcinofit Premium',
    'Carsifit Premium',
    'Cysto Up Premium',
    'Forheuma GO',
    'Hemo Care Premium',
    'Hepatifit Premium',
    'Herbaslim GO',
    'Hitenfit GO',
    'Met Fit GO',
    'Mucosafit Premium',
    'Omega Capsul',
    'Pos-K Premium',
    'Soya Cair',
    'Staminofit GO',
    'Stenosifit Premium',
    'Urinofit Premium',
  ].map((n) => n.toLowerCase())
);

const CATALOG_NAME_SET = new Set(
  NATURINDO_CATALOG.map((c) => c.name.trim().toLowerCase())
);

export const StocksView: React.FC<StocksViewProps> = ({
  onOpenStockModal,
  onOpenAdjustmentModal,
  onOpenExportModal,
}) => {
  const { stocks, deleteStockItem, syncRealStocksCatalog } = useWorkspace();
  const { user, role } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [filterMode, setFilterMode] = useState<'all' | 'ready' | 'empty' | 'new'>('all');
  const [seeding, setSeeding] = useState<boolean>(false);
  const [showNewProductsBanner, setShowNewProductsBanner] = useState<boolean>(true);

  const requireAuth = (actionName: string): boolean => {
    if (!user) {
      alert(
        `Akses ditolak: Anda harus login dengan akun Google terlebih dahulu untuk ${actionName}.`
      );
      return false;
    }
    return true;
  };

  // Sort stocks strictly A-Z
  const sortedStocks = useMemo(() => {
    return [...stocks].sort((a, b) =>
      (a.productName || '').localeCompare(b.productName || '', 'id', {
        sensitivity: 'base',
      })
    );
  }, [stocks]);

  // Identify new product names (either newly added Premium/GO/Omega/Soya Cair variants or custom user-added products), sorted A-Z
  const newProductItems = useMemo(() => {
    return sortedStocks.filter((item) => {
      const lower = (item.productName || '').trim().toLowerCase();
      return NEW_VARIANT_OR_PRODUCT_NAMES.has(lower) || !CATALOG_NAME_SET.has(lower);
    });
  }, [sortedStocks]);

  // Categories list sorted A-Z
  const categories = useMemo(() => {
    const set = new Set(sortedStocks.map((s) => s.category).filter(Boolean));
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, 'id', { sensitivity: 'base' })
    );
  }, [sortedStocks]);

  // Filtered stocks (always sorted A-Z)
  const filteredStocks = useMemo(() => {
    return sortedStocks.filter((item) => {
      const matchSearch =
        searchTerm === '' ||
        item.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.category || '').toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchSearch) return false;

      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }

      if (filterMode === 'ready' && item.stockReady <= 0) {
        return false;
      }
      if (filterMode === 'empty' && item.stockReady > 0) {
        return false;
      }
      if (filterMode === 'new') {
        const lower = (item.productName || '').trim().toLowerCase();
        const isNew =
          NEW_VARIANT_OR_PRODUCT_NAMES.has(lower) || !CATALOG_NAME_SET.has(lower);
        if (!isNew) return false;
      }

      return true;
    });
  }, [sortedStocks, searchTerm, selectedCategory, filterMode]);

  const readyStockCount = sortedStocks.filter((s) => s.stockReady > 0).length;
  const emptyStockCount = sortedStocks.filter((s) => s.stockReady <= 0).length;
  const totalBottlesReady = sortedStocks.reduce(
    (sum, s) => sum + Math.max(0, Number(s.stockReady) || 0),
    0
  );

  const handleSyncRealStocks = async () => {
    if (!requireAuth('merapihkan & menyinkronkan 48 stok real Naturindo')) return;
    setSeeding(true);
    try {
      await syncRealStocksCatalog();
    } finally {
      setSeeding(false);
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
            <span>
              Anda dapat meninjau inventaris stok real (A–Z). Silakan login dengan Google di navigasi atas untuk mencatat mutasi, restock, atau menambah produk baru.
            </span>
          </div>
        </div>
      )}

      {/* Top Header */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Boxes className="w-5 h-5 text-emerald-600" />
                <span>Stok Real Sentra Naturindo (Urut A–Z)</span>
              </h1>
              <span className="text-[11px] font-bold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-200">
                {sortedStocks.length} Produk • {totalBottlesReady} Botol Ready
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Setiap input order otomatis memotong stok barang yang ada. Produk dengan stok 0 otomatis disembunyikan saat input order.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleSyncRealStocks}
              disabled={seeding}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-teal-600 hover:bg-teal-500 text-white shadow-sm transition-all cursor-pointer"
              title="Rapihkan & set ulang 48 produk sesuai daftar stok real terbaru (A-Z)"
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {seeding ? 'Merapihkan Stok Real...' : 'Rapihkan 48 Stok Real (A–Z)'}
              </span>
            </button>

            <button
              onClick={() => {
                if (requireAuth('menambah nama produk baru')) {
                  onOpenStockModal();
                }
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Nama Produk Baru</span>
            </button>

            <button
              onClick={onOpenExportModal}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
              <span>Export Excel</span>
            </button>
          </div>
        </div>

        {/* Summary Info of Newly Added Products / Variants (A-Z) */}
        {newProductItems.length > 0 && showNewProductsBanner && (
          <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200/90 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-950">
                <Tag className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Daftar Nama Produk Baru & Varian Tambahan ({newProductItems.length} Produk — Urut A–Z):
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowNewProductsBanner(false)}
                className="text-[11px] text-emerald-700 hover:underline font-medium cursor-pointer"
              >
                Sembunyikan Info
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {newProductItems.map((np) => {
                const isCustomOutside48 = !CATALOG_NAME_SET.has(
                  (np.productName || '').trim().toLowerCase()
                );
                return (
                  <span
                    key={np.id}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
                      np.stockReady > 0
                        ? 'bg-white text-slate-800 border-emerald-300 shadow-2xs'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}
                  >
                    <span>{np.productName}</span>
                    <span
                      className={`font-mono font-bold px-1.5 py-0.2 rounded text-[10px] ${
                        np.stockReady > 0
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {np.stockReady}
                    </span>
                    {isCustomOutside48 && (
                      <span className="bg-amber-200 text-amber-950 text-[9px] font-extrabold px-1 rounded uppercase">
                        Custom Baru
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Filter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari Nama Produk (A–Z) atau SKU..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-slate-700 font-medium"
            />
          </div>

          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-slate-700 font-medium"
            >
              <option value="all">Semua Kategori Khasiat (A–Z)</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                filterMode === 'all'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              Semua A–Z ({sortedStocks.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('ready')}
              className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                filterMode === 'ready'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-emerald-50/70 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
              }`}
            >
              Ada Barang / Ready ({readyStockCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('empty')}
              className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                filterMode === 'empty'
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'bg-rose-50/70 hover:bg-rose-100 text-rose-800 border-rose-200'
              }`}
            >
              Stok Kosong / 0 ({emptyStockCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('new')}
              className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                filterMode === 'new'
                  ? 'bg-teal-600 text-white border-teal-600'
                  : 'bg-teal-50/70 hover:bg-teal-100 text-teal-800 border-teal-200'
              }`}
            >
              Produk / Varian Baru ({newProductItems.length})
            </button>
          </div>
        </div>
      </div>

      {/* Stocks Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/90 text-slate-600 font-semibold border-b border-slate-200 text-[11px] uppercase tracking-wider">
                <th className="py-3 px-4 whitespace-nowrap">No</th>
                <th className="py-3 px-4 whitespace-nowrap">Nama Produk Herbal (A–Z)</th>
                <th className="py-3 px-4 whitespace-nowrap">SKU Otomatis</th>
                <th className="py-3 px-4 whitespace-nowrap">Kategori Khasiat</th>
                <th className="py-3 px-4 text-center whitespace-nowrap">Stok Masuk</th>
                <th className="py-3 px-4 text-center whitespace-nowrap">Terjual / Keluar</th>
                <th className="py-3 px-4 text-center whitespace-nowrap bg-emerald-50/60 font-bold text-emerald-900">
                  Stok Real Ready
                </th>
                <th className="py-3 px-4 whitespace-nowrap">Status di Input Order</th>
                <th className="py-3 px-4 text-center whitespace-nowrap">Aksi Mutasi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStocks.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <Boxes className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p className="font-medium">Belum ada item inventaris yang sesuai filter.</p>
                    {stocks.length < 48 && (
                      <button
                        onClick={handleSyncRealStocks}
                        className="mt-2 text-xs font-semibold text-emerald-700 underline cursor-pointer"
                      >
                        Klik di sini untuk merapihkan 48 Stok Real Sentra Naturindo (A–Z)
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredStocks.map((item, idx) => {
                  const isOutOfStock = item.stockReady <= 0;
                  const isLowStock = item.stockReady <= item.minThreshold && !isOutOfStock;
                  const lowerName = (item.productName || '').trim().toLowerCase();
                  const isNewVariant = NEW_VARIANT_OR_PRODUCT_NAMES.has(lowerName);
                  const isCustomOutside48 = !CATALOG_NAME_SET.has(lowerName);

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isOutOfStock
                          ? 'bg-rose-50/30'
                          : isLowStock
                          ? 'bg-amber-50/30'
                          : ''
                      }`}
                    >
                      {/* No */}
                      <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                        {idx + 1}
                      </td>

                      {/* Nama Produk Herbal (A-Z) */}
                      <td className="py-3 px-4 font-bold text-slate-900">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>{item.productName}</span>
                          {isCustomOutside48 ? (
                            <span className="px-2 py-0.5 text-[9px] font-extrabold uppercase rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                              Produk Baru Tambahan
                            </span>
                          ) : isNewVariant ? (
                            <span className="px-2 py-0.5 text-[9px] font-bold uppercase rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                              Produk Baru
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* SKU */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[11px] border border-slate-200">
                          {item.sku}
                        </span>
                      </td>

                      {/* Kategori */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-medium border border-slate-200">
                          {item.category || 'Umum'}
                        </span>
                      </td>

                      {/* Stok Masuk */}
                      <td className="py-3 px-4 text-center font-mono text-slate-700">
                        {item.stockIn}
                      </td>

                      {/* Stok Keluar */}
                      <td className="py-3 px-4 text-center font-mono text-slate-700">
                        {item.stockOut}
                      </td>

                      {/* Stok Ready (Stok Real) */}
                      <td className="py-3 px-4 text-center bg-emerald-50/40 whitespace-nowrap">
                        <span
                          className={`font-mono font-bold text-sm px-2.5 py-0.5 rounded-lg ${
                            isOutOfStock
                              ? 'bg-rose-100 text-rose-800'
                              : isLowStock
                              ? 'bg-amber-100 text-amber-900 font-extrabold'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {item.stockReady} {item.unit || 'Botol'}
                        </span>
                      </td>

                      {/* Status di Input Order */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {isOutOfStock ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                            <XCircle className="w-3 h-3" />
                            <span>Kosong (Disembunyikan di Input Order)</span>
                          </span>
                        ) : isLowStock ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            <AlertCircle className="w-3 h-3" />
                            <span>Tampil di Order (Stok Menipis)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Tampil di Input Order</span>
                          </span>
                        )}
                      </td>

                      {/* Aksi Mutasi */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => {
                              if (requireAuth('mencatat restock stok masuk')) {
                                onOpenAdjustmentModal(item.id, 'in');
                              }
                            }}
                            className="flex items-center gap-0.5 px-2 py-1 text-[11px] font-semibold rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white transition-colors cursor-pointer"
                            title="Tambah Stok Masuk (Restock)"
                          >
                            <ArrowUpRight className="w-3 h-3" />
                            <span>+ Masuk</span>
                          </button>
                          <button
                            onClick={() => {
                              if (requireAuth('mencatat pengurangan stok keluar')) {
                                onOpenAdjustmentModal(item.id, 'out');
                              }
                            }}
                            className="flex items-center gap-0.5 px-2 py-1 text-[11px] font-semibold rounded-md bg-slate-100 text-slate-700 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer"
                            title="Catat Stok Keluar (Pengurangan / Rusak)"
                          >
                            <ArrowDownRight className="w-3 h-3" />
                            <span>- Keluar</span>
                          </button>
                          <button
                            onClick={() => {
                              if (requireAuth('mengubah master SKU')) {
                                onOpenStockModal(item);
                              }
                            }}
                            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded cursor-pointer"
                            title="Edit Data Produk"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!requireAuth('menghapus SKU produk')) return;
                              await deleteStockItem(item.id);
                            }}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                            title="Hapus Item Langsung"
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
    </div>
  );
};
