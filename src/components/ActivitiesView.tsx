import React, { useState, useMemo } from 'react';
import {
  Clock,
  Search,
  ShoppingBag,
  Boxes,
  ShieldAlert,
  User,
  CheckCircle,
  X,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { ActivityLog } from '../types';

export const ActivitiesView: React.FC = () => {
  const { activities, orders, workspaceId } = useWorkspace();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Lengkapi detail log lama yang belum mencantumkan nama produk
  const enrichedActivities = useMemo(() => {
    return activities.map((act: ActivityLog) => {
      if (act.category !== 'order') return act;

      const combined = `${act.actionTitle} ${act.detail}`;
      const orderIdMatch = combined.match(/\((ord-[a-z0-9-]+)\)/i);
      const resiMatch = act.detail.match(/Resi:\s*([^\s|]+)/i);
      const resiVal = resiMatch && resiMatch[1] !== '-' ? resiMatch[1].trim() : '';

      const matchedOrder = orders.find(
        (o) =>
          (orderIdMatch && o.id === orderIdMatch[1]) ||
          (resiVal && (o.noPemesanan === resiVal || o.noResi === resiVal))
      );

      if (!matchedOrder || !matchedOrder.productsSold) return act;

      // Jika detail sudah memuat nama produk, biarkan
      if (act.detail.toLowerCase().includes(matchedOrder.productsSold.toLowerCase())) {
        return act;
      }

      const prefix = `${matchedOrder.storeName ? `${matchedOrder.storeName} — ` : ''}${matchedOrder.productsSold} (Qty: ${matchedOrder.quantity || 1})`;
      return {
        ...act,
        detail: `${prefix} | ${act.detail}`,
      };
    });
  }, [activities, orders]);

  const filteredActivities = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return enrichedActivities.filter((act) => {
      const matchSearch =
        term === '' ||
        act.actionTitle.toLowerCase().includes(term) ||
        act.detail.toLowerCase().includes(term) ||
        act.actorName.toLowerCase().includes(term);

      if (!matchSearch) return false;

      if (categoryFilter !== 'all' && act.category !== categoryFilter) {
        return false;
      }

      return true;
    });
  }, [enrichedActivities, searchTerm, categoryFilter]);

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-emerald-600" />
              <span>Riwayat Aktivitas & Sinkronisasi Real-Time</span>
            </h1>
            <p className="text-xs text-slate-500">
              Audit trail permanen pencatatan order, perubahan status, mutasi stok, dan akses pengguna di workspace{' '}
              <strong className="text-slate-700">{workspaceId}</strong>.
            </p>
          </div>

          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 self-start sm:self-auto">
            {activities.length} Total Log Terkam
          </span>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2.5 pt-2 border-t border-slate-100">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari nama produk, resi, aktivitas, atau nama staff..."
              className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-slate-700"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                title="Hapus pencarian"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto">
            {['all', 'order', 'stock', 'access'].map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-xl whitespace-nowrap transition-colors cursor-pointer ${
                  categoryFilter === cat
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat === 'all' && 'Semua'}
                {cat === 'order' && 'Order Saja'}
                {cat === 'stock' && 'Stok Saja'}
                {cat === 'access' && 'Akses & Sistem'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Activity Timeline List */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
        {filteredActivities.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs">
            <Clock className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p className="font-medium">
              {searchTerm
                ? `Tidak ada log aktivitas yang cocok dengan "${searchTerm}".`
                : 'Tidak ada log aktivitas yang cocok.'}
            </p>
          </div>
        ) : (
          <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200">
            {filteredActivities.map((act) => {
              let dotColor = 'bg-slate-400';
              let icon = <CheckCircle className="w-3.5 h-3.5 text-white" />;
              if (act.category === 'order') {
                dotColor = 'bg-blue-600';
                icon = <ShoppingBag className="w-3 h-3 text-white" />;
              } else if (act.category === 'stock') {
                dotColor = 'bg-emerald-600';
                icon = <Boxes className="w-3 h-3 text-white" />;
              } else if (act.category === 'access') {
                dotColor = 'bg-purple-600';
                icon = <ShieldAlert className="w-3 h-3 text-white" />;
              }

              const timeStr = act.createdAt?.seconds
                ? new Date(act.createdAt.seconds * 1000).toLocaleString('id-ID', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })
                : 'Baru saja';

              return (
                <div key={act.id} className="relative group">
                  {/* Pin Dot */}
                  <div
                    className={`absolute -left-6 top-1 w-5 h-5 rounded-full flex items-center justify-center ring-4 ring-white shadow-xs ${dotColor}`}
                  >
                    {icon}
                  </div>

                  {/* Card Content */}
                  <div className="bg-slate-50/70 hover:bg-slate-50 p-3.5 rounded-xl border border-slate-200/70 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">
                          {act.actionTitle}
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.2 rounded-full bg-slate-200 text-slate-700">
                          {act.category}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-500">
                        {timeStr}
                      </span>
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed">
                      {act.detail}
                    </p>

                    <div className="mt-2.5 pt-2 border-t border-slate-200/50 flex items-center justify-between text-[11px] text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3 h-3 text-slate-400" />
                        <span>Staff/Aktor: <strong className="text-slate-700">{act.actorName}</strong></span>
                      </div>
                      <span className="uppercase text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        Role: {act.actorRole}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};