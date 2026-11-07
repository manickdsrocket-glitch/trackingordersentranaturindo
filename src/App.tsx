import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WorkspaceProvider } from './context/WorkspaceContext';
import { Navbar } from './components/Navbar';
import { DashboardView } from './components/DashboardView';
import { OrdersView } from './components/OrdersView';
import { StocksView } from './components/StocksView';
import { ActivitiesView } from './components/ActivitiesView';
import { OrderModal } from './components/OrderModal';
import { StockModal } from './components/StockModal';
import { StockAdjustmentModal } from './components/StockAdjustmentModal';
import { BarcodeScannerModal } from './components/BarcodeScannerModal';
import { ImportExportModal } from './components/ImportExportModal';
import { OrderRecord, StockItem } from './types';

const MainApp: React.FC = () => {
    const { user, signInWithGoogle } = useAuth();

    const [activeTab, setActiveTab] = useState<'dashboard' | 'orders' | 'stocks' | 'activities'>('dashboard');

    // Modals state
    const [orderModalOpen, setOrderModalOpen] = useState(false);
    const [orderToEdit, setOrderToEdit] = useState<OrderRecord | undefined>(undefined);

    const [stockModalOpen, setStockModalOpen] = useState(false);
    const [stockToEdit, setStockToEdit] = useState<StockItem | undefined>(undefined);

    const [adjustmentModalOpen, setAdjustmentModalOpen] = useState(false);
    const [adjustmentStockId, setAdjustmentStockId] = useState<string | null>(null);
    const [adjustmentType, setAdjustmentType] = useState<'in' | 'out'>('in');

    const [scanModalOpen, setScanModalOpen] = useState(false);
    const [exportModalOpen, setExportModalOpen] = useState(false);

    // Handlers tanpa pemblokir requireAuth
    const handleOpenOrderModal = (order?: OrderRecord) => {
        setOrderToEdit(order);
        setOrderModalOpen(true);
    };

    const handleOpenStockModal = (stock?: StockItem) => {
        setStockToEdit(stock);
        setStockModalOpen(true);
    };

    const handleOpenAdjustmentModal = (stockId: string, type: 'in' | 'out') => {
        setAdjustmentStockId(stockId);
        setAdjustmentType(type);
        setAdjustmentModalOpen(true);
    };

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
            {/* Top Navigation */}
            <Navbar
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                onOpenOrderModal={() => handleOpenOrderModal()}
                onOpenStockModal={() => handleOpenStockModal()}
            />

            {/* Main Container */}
            <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {/* Tab Views */}
                {activeTab === 'dashboard' && (
                    <DashboardView
                        onNavigateTab={setActiveTab}
                        onOpenOrderModal={() => handleOpenOrderModal()}
                        onOpenStockModal={() => handleOpenStockModal()}
                        onOpenScanModal={() => setScanModalOpen(true)}
                        onOpenExportModal={() => setExportModalOpen(true)}
                        onQuickRestock={(stockId) => handleOpenAdjustmentModal(stockId, 'in')}
                    />
                )}

                {activeTab === 'orders' && (
                    <OrdersView
                        onOpenOrderModal={handleOpenOrderModal}
                        onOpenScanModal={() => setScanModalOpen(true)}
                        onOpenExportModal={() => setExportModalOpen(true)}
                    />
                )}

                {activeTab === 'stocks' && (
                    <StocksView
                        onOpenStockModal={handleOpenStockModal}
                        onOpenAdjustmentModal={handleOpenAdjustmentModal}
                        onOpenExportModal={() => setExportModalOpen(true)}
                    />
                )}

                {activeTab === 'activities' && <ActivitiesView />}
            </main>

            {/* Footer */}
            <footer className="bg-slate-900 border-t border-slate-800 text-slate-400 py-4 text-xs mt-auto">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-200">Sentra Naturindo</span>
                        <span>&bull;</span>
                        <span>Tracking Order & Stok Barang Ready</span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                        <span>Created by Cetra Naturindo</span>
                    </div>
                </div>
            </footer>

            {/* Modals */}
            <OrderModal
                isOpen={orderModalOpen}
                onClose={() => {
                    setOrderModalOpen(false);
                    setOrderToEdit(undefined);
                }}
                orderToEdit={orderToEdit}
            />

            <StockModal
                isOpen={stockModalOpen}
                onClose={() => {
                    setStockModalOpen(false);
                    setStockToEdit(undefined);
                }}
                stockToEdit={stockToEdit}
            />

            <StockAdjustmentModal
                isOpen={adjustmentModalOpen}
                onClose={() => {
                    setAdjustmentModalOpen(false);
                    setAdjustmentStockId(null);
                }}
                stockId={adjustmentStockId}
                defaultType={adjustmentType}
            />

            <BarcodeScannerModal
                isOpen={scanModalOpen}
                onClose={() => setScanModalOpen(false)}
                onEditOrder={handleOpenOrderModal}
            />

            <ImportExportModal
                isOpen={exportModalOpen}
                onClose={() => setExportModalOpen(false)}
            />
        </div>
    );
};

export default function App() {
    return (
        <AuthProvider>
            <WorkspaceProvider>
                <MainApp />
            </WorkspaceProvider>
        </AuthProvider>
    );
}