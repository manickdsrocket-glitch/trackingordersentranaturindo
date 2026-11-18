import React from 'react';
import {
  Package,
  Send,
  AlertTriangle,
  CreditCard,
  TrendingUp,
  ShoppingBag,
  Clock,
  CheckCircle2,
  Plus,
  FileSpreadsheet,
  QrCode,
  ShieldAlert,
  ArrowRight,
  Boxes,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAuth } from '../context/AuthContext';
import { MarketplaceType } from '../types';

interface DashboardViewProps {
  onNavigateTab: (tab: 'orders' | 'stocks' | 'activities') => void;
  onOpenOrderModal: () => void;
  onOpenStockModal: () => void;
  onOpenScanModal: () => void;
  onOpenExportModal: () => void;
  onQuickRestock: (stockId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigateTab,
  onOpenOrderModal,
  onOpenStockModal,
  onOpenScanModal,
  onOpenExportModal,
  onQuickRestock,
}) => {
  const { orders, stocks, activities, toggleOrderChecklist } = useWorkspace();
  const { user } = useAuth();

  const requireAuth = (actionName: string): boolean => {
    if (!user) {
      alert(`Akses ditolak: Anda harus login dengan akun Google terlebih dahulu untuk ${actionName}.`);
      return false;
    }
    return true;
  };

  const todayStr = new Date().toISOString().split('T')[0];

  // Metrics calculation
  const totalOrders = orders.length;
  const todayOrders = orders.filter((o) => o.orderDate === todayStr).length;

  const packageSentOrders = orders.filter((o) => o.shippingStatus === 'Package Sent').length;
  const diprosesOrders = orders.filter((o) => o.shippingStatus === 'Diproses' || o.shippingStatus === 'Siap Kirim').length;
  const returOrders = orders.filter((o) => o.shippingStatus === 'Retur').length;
  const unpackedOrders = orders.filter((o) => !o.checklistComplete);
  const packedOrdersCount = orders.filter((o) => o.checklistComplete).length;

  const disbursedBriOrders = orders.filter((o) => o.disbursedToBri || o.disbursementStatus === 'Sudah cair').length;
  const pendingBriOrders = orders.filter((o) => !o.disbursedToBri && o.disbursementStatus !== 'Sudah cair').length;

  const lowStockItems = stocks.filter((s) => s.stockReady <= s.minThreshold);
  const lowStockCount = lowStockItems.length;
  const outOfStockItems = stocks.filter((s) => s.stockReady <= 0);

  // Marketplace distribution
  const marketplaces: MarketplaceType[] = [
    'Shopee',
    'TikTok Shop',
    'Tokopedia/Tokped',
    'Lazada',
    'Offline/Lainnya',
  ];

  const marketplaceStats = marketplaces.map((mp) => {
    const count = orders.filter((o) => o.marketplace === mp).length;
    const percentage = totalOrders > 0 ? Math.round((count / totalOrders) * 100) : 0;
    return { name: mp, count, percentage };
  });

  return (
    <div className="space-y-6">
      {/* Banner / Welcome */}
      <div className="bg-gradient-to-r from-emerald-900 via-slate-900 to-teal-900 border border-emerald-800/40 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial from-emerald-500/10 to-transparent pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-1">
              <span>Sistem Operasional Sentra Naturindo</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Sentra Naturindo</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Ringkasan Tracking Order & Inventaris Stok
            </h1>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                if (requireAuth('menginput order baru')) {
                  onOpenOrderModal();
                }
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-900/30 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Input Order</span>
            </button>
            <button
              onClick={() => {
                if (requireAuth('menggunakan scanner resi')) {
                  onOpenScanModal();
                }
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer"
              title="Cek / Scan No Resi Cepat"
            >
              <QrCode className="w-4 h-4 text-emerald-400" />
              <span>Scan Resi</span>
            </button>
            <button
              onClick={onOpenExportModal}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer"
              title="Import / Export Excel"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Total Orders */}
        <div
          onClick={() => onNavigateTab('orders')}
          className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Order Masuk
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <ShoppingBag className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-slate-900">
              {totalOrders}
            </span>
            <span className="text-xs text-slate-500">paket tercatat</span>
          </div>
          <div className="mt-2 text-xs text-slate-600 flex items-center gap-1.5">
            <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
              {todayOrders} order hari ini
            </span>
          </div>
        </div>

        {/* 2. Packages Sent */}
        <div
          onClick={() => onNavigateTab('orders')}
          className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Paket Terkirim (Sent)
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <Send className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-slate-900">
              {packageSentOrders}
            </span>
            <span className="text-xs text-slate-500">
              ({totalOrders > 0 ? Math.round((packageSentOrders / totalOrders) * 100) : 0}%)
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-600 flex items-center justify-between">
            <span>Packing Selesai: <strong className="text-emerald-700">{packedOrdersCount}</strong></span>
            {unpackedOrders.length > 0 ? (
              <span className="text-amber-700 font-semibold">Belum Packing: {unpackedOrders.length}</span>
            ) : (
              <span>Diproses: <strong className="text-slate-800">{diprosesOrders}</strong></span>
            )}
          </div>
        </div>

        {/* 3. Pencairan Rekening BRI */}
        <div
          onClick={() => onNavigateTab('orders')}
          className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Pencairan Dana BRI
            </span>
            <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center group-hover:bg-teal-600 group-hover:text-white transition-colors">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-emerald-700">
              {disbursedBriOrders}
            </span>
            <span className="text-xs text-slate-500">cair ke BRI</span>
          </div>
          <div className="mt-2 text-xs flex items-center justify-between">
            <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
              {pendingBriOrders} Belum Cair
            </span>
            <span className="text-slate-400 text-[11px]">Rek. BRI Sentra</span>
          </div>
        </div>

        {/* 4. Stok Kritis / Menipis */}
        <div
          onClick={() => onNavigateTab('stocks')}
          className={`rounded-2xl p-5 border shadow-sm hover:shadow-md transition-all cursor-pointer group ${
            lowStockCount > 0
              ? 'bg-amber-50/70 border-amber-200'
              : 'bg-white border-slate-200/80'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Peringatan Batas Stok
            </span>
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                lowStockCount > 0
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span
              className={`text-3xl font-bold tracking-tight ${
                lowStockCount > 0 ? 'text-amber-700' : 'text-slate-900'
              }`}
            >
              {lowStockCount}
            </span>
            <span className="text-xs text-slate-500">SKU menipis</span>
          </div>
          <div className="mt-2 text-xs text-slate-600 flex items-center justify-between">
            <span>Total: <strong>{stocks.length} SKU</strong></span>
            {outOfStockItems.length > 0 && (
              <span className="text-rose-600 font-bold">
                {outOfStockItems.length} Habis Total
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Quick Checklist Packing Banner (Direct 1-Click from Dashboard Outer View) */}
      {unpackedOrders.length > 0 && (
        <div className="bg-emerald-50/70 border-l-4 border-emerald-600 p-4 rounded-xl shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <Package className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {unpackedOrders.length} Order Belum Checklist Packing — Klik Langsung Tanpa Perlu Edit
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Klik tombol <strong>Packing Selesai</strong> pada order di bawah ini untuk mencentang langsung dari tampilan luar.
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {unpackedOrders.slice(0, 6).map((ord) => (
                    <div
                      key={ord.id}
                      className="bg-white border border-emerald-200 px-3 py-1.5 rounded-xl text-xs flex items-center gap-2.5 shadow-2xs"
                    >
                      <div className="flex flex-col">
                        <span className="font-mono font-bold text-slate-900 text-[11px]">
                          {ord.noPemesanan || ord.id}
                        </span>
                        <span className="text-[10px] text-slate-500 truncate max-w-[180px]">
                          {ord.storeName} • {ord.productsSold} ({ord.quantity}x)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (requireAuth('mengubah checklist packing')) {
                            toggleOrderChecklist(ord.id, ord.checklistComplete);
                          }
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-colors cursor-pointer shrink-0"
                        title="Klik untuk langsung menandai Checklist Packing Selesai"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Packing Selesai</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={() => onNavigateTab('orders')}
              className="text-xs font-semibold text-emerald-900 bg-emerald-200/70 hover:bg-emerald-200 px-3 py-1.5 rounded-lg shrink-0 transition-colors cursor-pointer"
            >
              Semua Order &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Critical Stock Alert Banner (If Any) */}
      {lowStockItems.length > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-xl shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-amber-900">
                  Perhatian: {lowStockItems.length} Produk Herbal di Bawah Batas Minimum Stok!
                </h3>
                <p className="text-xs text-amber-800 mt-0.5">
                  Segera jadwalkan restock untuk mencegah kehabisan barang saat pesanan marketplace masuk.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {lowStockItems.slice(0, 4).map((item) => (
                    <div
                      key={item.id}
                      className="bg-white/90 border border-amber-300 px-2.5 py-1 rounded-lg text-xs flex items-center gap-2"
                    >
                      <span className="font-semibold text-slate-900">{item.productName}</span>
                      <span className="text-[11px] font-bold text-rose-600">
                        Sisa: {item.stockReady} {item.unit}
                      </span>
                      <button
                        onClick={() => {
                          if (requireAuth('mencatat restock stok')) {
                            onQuickRestock(item.id);
                          }
                        }}
                        className="text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-0.5 rounded font-semibold cursor-pointer"
                      >
                        + Restock
                      </button>
                    </div>
                  ))}
                  {lowStockItems.length > 4 && (
                    <button
                      onClick={() => onNavigateTab('stocks')}
                      className="text-xs font-semibold text-amber-900 underline self-center ml-1"
                    >
                      +{lowStockItems.length - 4} lainnya
                    </button>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={() => onNavigateTab('stocks')}
              className="text-xs font-semibold text-amber-900 bg-amber-200/70 hover:bg-amber-200 px-3 py-1.5 rounded-lg shrink-0 transition-colors"
            >
              Buka Inventaris &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Two Column Layout: Marketplace Distribution & Recent Synchronized Activities */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Marketplace Distribution */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Distribusi Marketplace</h2>
              <p className="text-xs text-slate-500">Pangsa order per platform penjualan</p>
            </div>
            <ShoppingBag className="w-4 h-4 text-slate-400" />
          </div>

          <div className="space-y-3.5">
            {marketplaceStats.map((mp) => {
              let badgeColor = 'bg-slate-100 text-slate-800';
              let barColor = 'bg-slate-600';
              if (mp.name === 'Shopee') {
                badgeColor = 'bg-orange-50 text-orange-700';
                barColor = 'bg-orange-500';
              } else if (mp.name === 'Tokopedia/Tokped') {
                badgeColor = 'bg-emerald-50 text-emerald-700';
                barColor = 'bg-emerald-500';
              } else if (mp.name === 'TikTok Shop') {
                badgeColor = 'bg-cyan-50 text-cyan-800';
                barColor = 'bg-slate-900';
              } else if (mp.name === 'Lazada') {
                badgeColor = 'bg-blue-50 text-blue-700';
                barColor = 'bg-blue-600';
              }

              return (
                <div key={mp.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700">{mp.name}</span>
                    <span className="font-semibold text-slate-900">
                      {mp.count} order ({mp.percentage}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                      style={{ width: `${mp.percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Total Terdata: {totalOrders} paket</span>
            <button
              onClick={() => onNavigateTab('orders')}
              className="text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1"
            >
              <span>Lihat Detail</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Live Synchronized Activity Stream */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-600" />
                <h2 className="text-sm font-bold text-slate-900">Riwayat Sinkronisasi Terkini</h2>
              </div>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Live Audit Trail
              </span>
            </div>

            {activities.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                Belum ada aktivitas yang dicatat. Perubahan order atau stok akan otomatis tampil di sini.
              </div>
            ) : (
              <div className="space-y-3">
                {activities.slice(0, 6).map((act) => {
                  let iconBg = 'bg-slate-100 text-slate-700';
                  if (act.category === 'order') iconBg = 'bg-blue-50 text-blue-600';
                  if (act.category === 'stock') iconBg = 'bg-emerald-50 text-emerald-600';
                  if (act.category === 'access') iconBg = 'bg-purple-50 text-purple-600';

                  // format time
                  const timeStr = act.createdAt?.seconds
                    ? new Date(act.createdAt.seconds * 1000).toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Baru saja';

                  return (
                    <div
                      key={act.id}
                      className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100"
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
                        {act.category === 'order' && <ShoppingBag className="w-4 h-4" />}
                        {act.category === 'stock' && <Boxes className="w-4 h-4" />}
                        {act.category === 'access' && <ShieldAlert className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-900 truncate">
                            {act.actionTitle}
                          </span>
                          <span className="text-[11px] text-slate-400 shrink-0 font-mono">
                            {timeStr}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 line-clamp-1 mt-0.5">
                          {act.detail}
                        </p>
                        <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1.5">
                          <span>Oleh: <strong className="text-slate-600">{act.actorName}</strong></span>
                          <span>&bull;</span>
                          <span className="uppercase font-semibold tracking-wider text-[9px] text-emerald-600">
                            {act.actorRole}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 mt-4 flex items-center justify-between text-xs text-slate-500">
            <span>Audit trail tersimpan aman dan tidak dapat direkayasa.</span>
            <button
              onClick={() => onNavigateTab('activities')}
              className="text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1"
            >
              <span>Lihat Seluruh Log</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
