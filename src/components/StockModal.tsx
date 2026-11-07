import React, { useState, useEffect } from 'react';
import { X, Boxes, Sparkles, AlertCircle } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAuth } from '../context/AuthContext';
import { StockItem, NATURINDO_CATALOG, generateAutoSkuFromName } from '../types';

interface StockModalProps {
  isOpen: boolean;
  onClose: () => void;
  stockToEdit?: StockItem;
}

export const StockModal: React.FC<StockModalProps> = ({
  isOpen,
  onClose,
  stockToEdit,
}) => {
  const { addStockItem, updateStockItem } = useWorkspace();
  const { user } = useAuth();

  const todayStr = new Date().toISOString().split('T')[0];

  const [sku, setSku] = useState('');
  const [productName, setProductName] = useState('');
  const [category, setCategory] = useState('');
  const [stockIn, setStockIn] = useState<number>(10);
  const [stockOut, setStockOut] = useState<number>(0);
  const [minThreshold, setMinThreshold] = useState<number>(3);
  const [unit, setUnit] = useState('Botol');
  const [expTercepat, setExpTercepat] = useState('2026-11');
  const [expTerlama, setExpTerlama] = useState('2028-05');
  const [lastRestockDate, setLastRestockDate] = useState(todayStr);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const generateAutoSku = (name: string): string => {
    return generateAutoSkuFromName(name);
  };

  useEffect(() => {
    if (stockToEdit) {
      setSku(stockToEdit.sku || '');
      setProductName(stockToEdit.productName || '');
      setCategory(stockToEdit.category || '');
      setStockIn(stockToEdit.stockIn || 0);
      setStockOut(stockToEdit.stockOut || 0);
      setMinThreshold(stockToEdit.minThreshold || 3);
      setUnit(stockToEdit.unit || 'Botol');
      setExpTercepat(stockToEdit.expTercepat || '');
      setExpTerlama(stockToEdit.expTerlama || '');
      setLastRestockDate(stockToEdit.lastRestockDate || todayStr);
    } else {
      setSku('NAT-AUTO-01');
      setProductName('');
      setCategory('Herbal Naturindo');
      setStockIn(10);
      setStockOut(0);
      setMinThreshold(3);
      setUnit('Botol');
      setExpTercepat('2026-11');
      setExpTerlama('2028-05');
      setLastRestockDate(todayStr);
    }
    setErrorMsg('');
  }, [stockToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSelectPreset = (preset: (typeof NATURINDO_CATALOG)[0]) => {
    setSku(preset.sku);
    setProductName(preset.name);
    setCategory(preset.category);
    setStockIn(preset.defaultStock);
    setStockOut(0);
    setMinThreshold(preset.defaultMinThreshold);
  };

  const handleProductNameChange = (name: string) => {
    setProductName(name);
    if (!stockToEdit) {
      setSku(generateAutoSku(name));
    }
  };

  const calculatedReady = Math.max(0, (Number(stockIn) || 0) - (Number(stockOut) || 0));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setErrorMsg('Akses ditolak: Anda harus login dengan Google terlebih dahulu untuk menambah atau mengedit stok.');
      return;
    }

    if (!productName.trim()) {
      setErrorMsg('Harap isi Nama Produk Herbal.');
      return;
    }

    const finalSku = (
      sku.trim() ||
      generateAutoSku(productName) ||
      `NAT-PRD-${Date.now().toString().slice(-4)}`
    ).toUpperCase();

    setSaving(true);
    setErrorMsg('');

    try {
      if (stockToEdit) {
        await updateStockItem(stockToEdit.id, {
          sku: finalSku,
          productName: productName.trim(),
          category: category.trim(),
          stockIn: Number(stockIn) || 0,
          stockOut: Number(stockOut) || 0,
          minThreshold: Number(minThreshold) || 10,
          unit: unit.trim() || 'Botol',
          expTercepat: expTercepat.trim(),
          expTerlama: expTerlama.trim(),
          lastRestockDate: lastRestockDate || todayStr,
        });
      } else {
        await addStockItem({
          sku: finalSku,
          productName: productName.trim(),
          category: category.trim(),
          stockIn: Number(stockIn) || 0,
          stockOut: Number(stockOut) || 0,
          minThreshold: Number(minThreshold) || 10,
          unit: unit.trim() || 'Botol',
          expTercepat: expTercepat.trim(),
          expTerlama: expTerlama.trim(),
          lastRestockDate: lastRestockDate || todayStr,
        });
      }
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan data stok.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden my-8 animate-scale-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
              <Boxes className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {stockToEdit ? 'Edit Data Master SKU Stok' : 'Tambah Master Produk Herbal'}
              </h2>
              <p className="text-xs text-slate-500">
                Inventaris Sentra Naturindo: Stok Ready dihitung otomatis dari Stok Masuk dikurangi Stok Keluar.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Preset Selector */}
        {!stockToEdit && (
          <div className="p-4 bg-emerald-50/50 border-b border-emerald-100/70">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-900 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>Pilih Cepat dari Katalog Naturindo:</span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
              {NATURINDO_CATALOG.map((cat) => (
                <button
                  type="button"
                  key={cat.sku}
                  onClick={() => handleSelectPreset(cat)}
                  className="px-2.5 py-1 text-[11px] rounded-lg bg-white border border-emerald-200 text-emerald-950 hover:bg-emerald-600 hover:text-white transition-colors cursor-pointer font-medium"
                >
                  {cat.sku}: {cat.name.split(' (')[0]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-semibold text-slate-700">
                  Kode SKU Produk
                </label>
                <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                  Auto
                </span>
              </div>
              <div className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-100 text-slate-800 font-mono font-bold text-xs flex items-center justify-between select-none">
                <span>{sku || (productName ? generateAutoSku(productName) : 'NAT-AUTO-01')}</span>
                <span className="text-[10px] text-slate-400 font-sans font-normal">Otomatis oleh sistem</span>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Kategori Khasiat
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Contoh: Sirkulasi & Darah, Lambung/GERD"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Nama Produk Herbal Naturindo *
            </label>
            <input
              type="text"
              required
              value={productName}
              onChange={(e) => handleProductNameChange(e.target.value)}
              placeholder="Contoh: Naturindo BV Flow (Sirkulasi Darah & Penyumbatan)"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-900 font-semibold"
            />
          </div>

          {/* Stock In, Out, Ready */}
          <div className="grid grid-cols-3 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
            <div>
              <label className="block font-semibold text-slate-700 mb-1 text-center">
                Stok Masuk (In)
              </label>
              <input
                type="number"
                min="0"
                required
                value={stockIn}
                onChange={(e) => setStockIn(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 font-mono font-bold text-center"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1 text-center">
                Stok Keluar (Out)
              </label>
              <input
                type="number"
                min="0"
                required
                value={stockOut}
                onChange={(e) => setStockOut(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 font-mono font-bold text-center"
              />
            </div>

            <div>
              <label className="block font-bold text-emerald-800 mb-1 text-center">
                Stok Ready
              </label>
              <div className="w-full py-2 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-900 font-mono font-extrabold text-center text-sm">
                {calculatedReady} {unit}
              </div>
            </div>
          </div>

          {/* Threshold & Unit */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Batas Minimum Otomatis (Alert Threshold) *
              </label>
              <input
                type="number"
                min="1"
                required
                value={minThreshold}
                onChange={(e) => setMinThreshold(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 font-bold"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Sistem akan memunculkan alarm/badge jika Stok Ready &le; angka ini.
              </span>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Satuan Kemasan
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 font-medium"
              >
                <option value="Botol">Botol</option>
                <option value="Box">Box</option>
                <option value="Pcs">Pcs</option>
                <option value="Sachet">Sachet</option>
              </select>
            </div>
          </div>

          {/* Expiration Date Range & Restock Date */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Exp Tercepat (YYYY-MM)
              </label>
              <input
                type="text"
                value={expTercepat}
                onChange={(e) => setExpTercepat(e.target.value)}
                placeholder="2026-11"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Exp Terlama (YYYY-MM)
              </label>
              <input
                type="text"
                value={expTerlama}
                onChange={(e) => setExpTerlama(e.target.value)}
                placeholder="2028-05"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Tgl Restock Terakhir
              </label>
              <input
                type="date"
                value={lastRestockDate}
                onChange={(e) => setLastRestockDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 font-mono"
              />
            </div>
          </div>

          {/* Footer */}
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
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-sm transition-all cursor-pointer"
            >
              {saving ? 'Menyimpan...' : stockToEdit ? 'Simpan Perubahan' : 'Tambahkan Produk'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
