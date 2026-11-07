import React, { useState, useEffect } from 'react';
import { X, ArrowUpRight, ArrowDownRight, AlertCircle, Boxes } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAuth } from '../context/AuthContext';

interface StockAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  stockId: string | null;
  defaultType?: 'in' | 'out';
}

export const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({
  isOpen,
  onClose,
  stockId,
  defaultType = 'in',
}) => {
  const { stocks, adjustStock } = useWorkspace();
  const { user } = useAuth();

  const [type, setType] = useState<'in' | 'out'>(defaultType);
  const [delta, setDelta] = useState<number>(10);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const currentItem = stocks.find((s) => s.id === stockId);

  useEffect(() => {
    setType(defaultType);
    setDelta(defaultType === 'in' ? 25 : 5);
    setNote(defaultType === 'in' ? 'Restock pasokan baru' : 'Pengurangan mutasi order');
    setErrorMsg('');
  }, [stockId, defaultType, isOpen]);

  if (!isOpen || !currentItem) return null;

  const previewIn = type === 'in' ? currentItem.stockIn + delta : currentItem.stockIn;
  const previewOut = type === 'out' ? currentItem.stockOut + delta : currentItem.stockOut;
  const previewReady = Math.max(0, previewIn - previewOut);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setErrorMsg('Akses ditolak: Anda harus login dengan Google terlebih dahulu untuk melakukan mutasi stok.');
      return;
    }

    if (!delta || delta <= 0) {
      setErrorMsg('Jumlah mutasi harus lebih besar dari 0.');
      return;
    }

    if (type === 'out' && delta > currentItem.stockReady) {
      if (!confirm(`Jumlah keluar (${delta}) melebihi stok ready saat ini (${currentItem.stockReady}). Tetap lanjutkan?`)) {
        return;
      }
    }

    setSaving(true);
    setErrorMsg('');

    try {
      await adjustStock(currentItem.id, type, Number(delta), note.trim());
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal melakukan mutasi stok.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden animate-scale-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-white ${
                type === 'in' ? 'bg-emerald-600' : 'bg-slate-800'
              }`}
            >
              {type === 'in' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {type === 'in' ? 'Catat Restock (Stok Masuk)' : 'Catat Pengurangan (Stok Keluar)'}
              </h2>
              <p className="text-[11px] text-slate-500 font-mono">
                {currentItem.sku} — {currentItem.productName}
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Toggle Type */}
          <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setType('in')}
              className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                type === 'in'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>+ Stok Masuk (In)</span>
            </button>
            <button
              type="button"
              onClick={() => setType('out')}
              className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                type === 'out'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowDownRight className="w-3.5 h-3.5" />
              <span>- Stok Keluar (Out)</span>
            </button>
          </div>

          {/* Amount / Delta */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Jumlah Unit ({currentItem.unit || 'Botol'}) *
            </label>
            <input
              type="number"
              min="1"
              required
              value={delta}
              onChange={(e) => setDelta(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-900 font-mono font-bold text-center text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          {/* Live Preview Box */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-500 block">Stok Ready Sekarang:</span>
              <strong className="text-sm font-bold text-slate-900 font-mono">
                {currentItem.stockReady} {currentItem.unit}
              </strong>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-slate-500 block">Setelah Penyesuaian:</span>
              <strong
                className={`text-sm font-extrabold font-mono ${
                  previewReady <= currentItem.minThreshold ? 'text-amber-700' : 'text-emerald-700'
                }`}
              >
                {previewReady} {currentItem.unit}
              </strong>
            </div>
          </div>

          {/* Reason / Notes */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Keterangan / Alasan Mutasi
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Contoh: Kiriman dari pabrik Cilacap, pesanan Shopee, dll."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800"
            />
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`px-4 py-1.5 rounded-xl text-white font-semibold transition-all cursor-pointer ${
                type === 'in' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-slate-900 hover:bg-slate-800'
              }`}
            >
              {saving ? 'Menyimpan...' : type === 'in' ? 'Tambahkan Stok' : 'Kurangi Stok'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
