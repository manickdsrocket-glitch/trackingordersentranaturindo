import React, { useState } from 'react';
import {
  Leaf,
  LogOut,
  ShieldCheck,
  UserCheck,
  Sparkles,
  LogIn,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';

interface NavbarProps {
  activeTab: 'dashboard' | 'orders' | 'stocks' | 'activities';
  setActiveTab: (tab: 'dashboard' | 'orders' | 'stocks' | 'activities') => void;
  onOpenOrderModal: () => void;
  onOpenStockModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenOrderModal,
}) => {
  const { user, role, signOutUser, signInWithGoogle } = useAuth();
  const { stocks, seedAll27ProductsWith10Stock } = useWorkspace();
  const [seeding, setSeeding] = useState(false);

  // Calculate low stock items count
  const lowStockCount = stocks.filter((s) => s.stockReady <= s.minThreshold).length;

  const handleSeedAll27 = async () => {
    if (!user) {
      alert('Silakan login dengan akun Google terlebih dahulu untuk memasukkan stok.');
      return;
    }
    setSeeding(true);
    try {
      await seedAll27ProductsWith10Stock();
    } finally {
      setSeeding(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand - Single Unified Sentra Naturindo Workspace */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 ring-1 ring-emerald-400/30">
              <Leaf className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-base sm:text-lg text-white">
                  SENTRA NATURINDO
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  TRACKING & STOK
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Tabs (Desktop) */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-emerald-600 text-white shadow-sm font-semibold'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                activeTab === 'orders'
                  ? 'bg-emerald-600 text-white shadow-sm font-semibold'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              Tracking Order
            </button>
            <button
              onClick={() => setActiveTab('stocks')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all relative cursor-pointer ${
                activeTab === 'stocks'
                  ? 'bg-emerald-600 text-white shadow-sm font-semibold'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <span>Stok Barang (48 Herbal)</span>
              {lowStockCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-500 text-slate-950">
                  {lowStockCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('activities')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                activeTab === 'activities'
                  ? 'bg-emerald-600 text-white shadow-sm font-semibold'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              Riwayat Aktivitas
            </button>
          </nav>

          {/* Right Section */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Button to seed all 27 products with 10 stock each */}
            {user && stocks.length < 27 && (
              <button
                onClick={handleSeedAll27}
                disabled={seeding}
                className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 transition-colors cursor-pointer"
                title="Masukkan 27 produk herbal Naturindo dengan stok masing-masing 10"
              >
                <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                <span>{seeding ? 'Mengisi...' : 'Isi 27 Stok (10 Semua)'}</span>
              </button>
            )}

            {/* Auth Button / Profile */}
            {user ? (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
                <div className="flex items-center gap-2">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'User'}
                      className="w-8 h-8 rounded-full border border-slate-700"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-xs">
                      {user.displayName?.[0] || user.email?.[0] || 'U'}
                    </div>
                  )}
                  <div className="hidden xl:block text-left">
                    <div className="text-xs font-medium text-white max-w-[120px] truncate">
                      {user.displayName || user.email}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                      {role === 'admin' ? (
                        <ShieldCheck className="w-3 h-3 text-amber-400" />
                      ) : (
                        <UserCheck className="w-3 h-3 text-emerald-400" />
                      )}
                      <span>{role}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={signOutUser}
                  title="Keluar"
                  className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={signInWithGoogle}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Masuk Google</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Navigation Tabs */}
        <div className="flex md:hidden border-t border-slate-800/80 py-2 gap-1 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-3 py-1 text-xs font-medium rounded-lg whitespace-nowrap cursor-pointer ${
              activeTab === 'dashboard'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-3 py-1 text-xs font-medium rounded-lg whitespace-nowrap cursor-pointer ${
              activeTab === 'orders'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            Tracking Order
          </button>
          <button
            onClick={() => setActiveTab('stocks')}
            className={`px-3 py-1 text-xs font-medium rounded-lg whitespace-nowrap flex items-center gap-1 cursor-pointer ${
              activeTab === 'stocks'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <span>Stok (48 Herbal)</span>
            {lowStockCount > 0 && (
              <span className="px-1.5 py-0.2 text-[9px] font-bold rounded-full bg-amber-500 text-slate-950">
                {lowStockCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('activities')}
            className={`px-3 py-1 text-xs font-medium rounded-lg whitespace-nowrap cursor-pointer ${
              activeTab === 'activities'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            Riwayat
          </button>
        </div>
      </div>
    </header>
  );
};
