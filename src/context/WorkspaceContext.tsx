import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from './AuthContext';
import {
  OrderRecord,
  StockItem,
  ActivityLog,
  WorkspaceMember,
  NATURINDO_CATALOG,
  parseProductsSoldString,
} from '../types';

interface WorkspaceContextType {
  workspaceId: string;
  orders: OrderRecord[];
  stocks: StockItem[];
  activities: ActivityLog[];
  members: WorkspaceMember[];
  loadingData: boolean;
  addOrder: (orderData: Omit<OrderRecord, 'id' | 'workspaceId' | 'authorId' | 'updatedByName' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateOrder: (orderId: string, updates: Partial<OrderRecord>) => Promise<void>;
  deleteOrder: (orderId: string) => Promise<void>;
  toggleOrderChecklist: (orderId: string, current: boolean) => Promise<void>;
  toggleOrderBriDisbursement: (orderId: string, current: boolean) => Promise<void>;
  addStockItem: (itemData: Omit<StockItem, 'id' | 'workspaceId' | 'authorId' | 'updatedByName' | 'createdAt' | 'updatedAt' | 'stockReady'>) => Promise<string>;
  updateStockItem: (stockId: string, updates: Partial<StockItem>) => Promise<void>;
  adjustStock: (stockId: string, type: 'in' | 'out', delta: number, note: string) => Promise<void>;
  deleteStockItem: (stockId: string) => Promise<void>;
  logActivity: (category: 'order' | 'stock' | 'access', actionTitle: string, detail: string) => Promise<void>;
  seedAll27ProductsWith10Stock: () => Promise<void>;
  syncRealStocksCatalog: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

// Only 1 unified workspace for Sentra Naturindo
const WORKSPACE_ID = 'sentra-naturindo';

// Legacy product names or SKUs from older versions that were renamed in the 48 real stock list
const LEGACY_RENAMED_NAMES = new Set([
  'bron c fit',
  'bv flow',
  'cardiafit',
  'hemocare',
  'herb 4 slim',
  'joint nature',
  'metfit',
  'prosela',
  'soya lecithin (kapsul/softgel)',
]);

const LEGACY_RENAMED_SKUS = new Set([
  'NAT-H4S-01',
  'NAT-PRS-01',
  'NAT-OSL-01',
]);

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, role } = useAuth();
  const workspaceId = WORKSPACE_ID;

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const autoSyncedRef = useRef<boolean>(false);
  const deletedOrderIdsRef = useRef<Set<string>>(new Set());
  const deletedStockIdsRef = useRef<Set<string>>(new Set());

  // Setup / check workspace document
  useEffect(() => {
    if (!user) return;
    const ensureWorkspaceDoc = async () => {
      const wsRef = doc(db, 'workspaces', workspaceId);
      try {
        await setDoc(
          wsRef,
          {
            name: 'Sentra Naturindo — Tracking & Stok',
            ownerId: user.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (err) {
        console.warn('Workspace doc ensure warning:', err);
      }
    };
    ensureWorkspaceDoc();
  }, [user, workspaceId]);

  // Real-time synchronization for shared workspace sentra-naturindo
  useEffect(() => {
    setLoadingData(true);
    let loadedCount = 0;
    const checkLoaded = () => {
      loadedCount++;
      if (loadedCount >= 3) {
        setLoadingData(false);
      }
    };

    // 1. Orders listener
    const ordersPath = `workspaces/${workspaceId}/orders`;
    const ordersColRef = collection(db, 'workspaces', workspaceId, 'orders');
    const unsubOrders = onSnapshot(
      ordersColRef,
      (snapshot) => {
        const items: OrderRecord[] = snapshot.docs
          .filter((d) => !deletedOrderIdsRef.current.has(d.id))
          .map((d) => ({
            id: d.id,
            ...(d.data() as any),
          }));
        items.sort((a, b) => {
          const dateA = a.orderDate || '';
          const dateB = b.orderDate || '';
          if (dateA !== dateB) return dateB.localeCompare(dateA);
          return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
        });
        setOrders(items);
        checkLoaded();
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, ordersPath);
        checkLoaded();
      }
    );

    // 2. Stocks listener (Always sorted A-Z)
    const stocksPath = `workspaces/${workspaceId}/stocks`;
    const stocksColRef = collection(db, 'workspaces', workspaceId, 'stocks');
    const unsubStocks = onSnapshot(
      stocksColRef,
      (snapshot) => {
        const items: StockItem[] = snapshot.docs
          .filter((d) => !deletedStockIdsRef.current.has(d.id))
          .map((d) => ({
            id: d.id,
            ...(d.data() as any),
          }));
        items.sort((a, b) =>
          (a.productName || '').localeCompare(b.productName || '', 'id', {
            sensitivity: 'base',
          })
        );
        setStocks(items);
        checkLoaded();
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, stocksPath);
        checkLoaded();
      }
    );

    // 3. Activities listener
    const actPath = `workspaces/${workspaceId}/activities`;
    const actQuery = query(
      collection(db, 'workspaces', workspaceId, 'activities'),
      orderBy('createdAt', 'desc'),
      limit(60)
    );
    const unsubActivities = onSnapshot(
      actQuery,
      (snapshot) => {
        const items: ActivityLog[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));
        setActivities(items);
        checkLoaded();
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, actPath);
        checkLoaded();
      }
    );

    // 4. Members listener
    const membersColRef = collection(db, 'workspaces', workspaceId, 'members');
    const unsubMembers = onSnapshot(
      membersColRef,
      (snapshot) => {
        const items: WorkspaceMember[] = snapshot.docs.map((d) => ({
          uid: d.id,
          ...(d.data() as any),
        }));
        setMembers(items);
      },
      (error) => {
        console.warn('Members listener warning:', error.message);
      }
    );

    return () => {
      unsubOrders();
      unsubStocks();
      unsubActivities();
      unsubMembers();
    };
  }, [user, workspaceId]);

  const logActivity = async (
    category: 'order' | 'stock' | 'access',
    actionTitle: string,
    detail: string
  ) => {
    if (!user) return;
    const actId = `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    try {
      await setDoc(doc(db, 'workspaces', workspaceId, 'activities', actId), {
        workspaceId,
        category,
        actionTitle,
        detail,
        actorUid: user.uid,
        actorName: user.displayName || user.email || 'Staff Sentra',
        actorRole: role,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('Log activity error:', err);
    }
  };

  // Guard: User must be signed in to perform ANY input or modification
  const ensureAuthenticated = () => {
    if (!user) {
      throw new Error(
        'Akses ditolak: Anda harus login dengan akun Google untuk menginput atau mengubah data.'
      );
    }
  };

  // Helper to apply stock deductions/restorations for a list of { name, qtyDelta }
  // qtyDelta > 0 means stockOut increases (stockReady decreases)
  // qtyDelta < 0 means stockOut decreases (stockReady increases)
  const applyStockDeltasForOrder = async (
    deltas: { name: string; qtyDelta: number }[],
    orderCodeLabel: string
  ) => {
    if (!user || deltas.length === 0) return;

    const summaryLogs: string[] = [];

    for (const { name, qtyDelta } of deltas) {
      if (!name || qtyDelta === 0) continue;
      const targetNameLower = name.trim().toLowerCase();

      const matchedStock = stocks.find(
        (s) => s.productName.trim().toLowerCase() === targetNameLower
      );

      if (matchedStock) {
        const currentStockIn = Number(matchedStock.stockIn) || 0;
        const currentStockOut = Number(matchedStock.stockOut) || 0;
        const nextStockOut = Math.max(0, currentStockOut + qtyDelta);
        const nextStockReady = Math.max(0, currentStockIn - nextStockOut);

        // Optimistically update local stocks state immediately
        setStocks((prev) =>
          prev.map((s) =>
            s.id === matchedStock.id
              ? { ...s, stockOut: nextStockOut, stockReady: nextStockReady }
              : s
          )
        );

        const stockPath = `workspaces/${workspaceId}/stocks/${matchedStock.id}`;
        try {
          await updateDoc(doc(db, 'workspaces', workspaceId, 'stocks', matchedStock.id), {
            stockOut: nextStockOut,
            stockReady: nextStockReady,
            updatedByName: user.displayName || user.email || 'Staff',
            updatedAt: serverTimestamp(),
          });
          summaryLogs.push(
            `${matchedStock.productName} (${qtyDelta > 0 ? `-${qtyDelta}` : `+${Math.abs(qtyDelta)}`} -> Sisa: ${nextStockReady})`
          );
        } catch (err) {
          console.warn(`Failed updating stock for ${matchedStock.productName}:`, stockPath, err);
        }
      }
    }

    if (summaryLogs.length > 0) {
      await logActivity(
        'stock',
        `Potong Stok Otomatis (${orderCodeLabel})`,
        summaryLogs.join(', ')
      );
    }
  };

  const addOrder = async (
    orderData: Omit<
      OrderRecord,
      'id' | 'workspaceId' | 'authorId' | 'updatedByName' | 'createdAt' | 'updatedAt'
    >
  ) => {
    ensureAuthenticated();
    const orderId = `ord-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const path = `workspaces/${workspaceId}/orders/${orderId}`;
    const payload = {
      ...orderData,
      workspaceId,
      authorId: user!.uid,
      updatedByName: user!.displayName || user!.email || 'Staff',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(doc(db, 'workspaces', workspaceId, 'orders', orderId), payload);

      // Automatically deduct stock for every product sold in this order
      const parsedItems = parseProductsSoldString(
        orderData.productsSold,
        orderData.quantity
      );
      if (parsedItems.length > 0) {
        await applyStockDeltasForOrder(
          parsedItems.map((it) => ({ name: it.name, qtyDelta: it.qty })),
          orderData.noPemesanan || orderId
        );
      }

      await logActivity(
        'order',
        `Order Baru Dibuat (${orderData.marketplace})`,
        `${orderData.storeName} — ${orderData.productsSold} (Qty: ${orderData.quantity}) | Resi: ${orderData.noPemesanan} | Kurir: ${orderData.courier || '-'}`
      );
      return orderId;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
      throw error;
    }
  };

  const updateOrder = async (orderId: string, updates: Partial<OrderRecord>) => {
    ensureAuthenticated();
    const path = `workspaces/${workspaceId}/orders/${orderId}`;
    const existingOrder = orders.find((o) => o.id === orderId);

    // Optimistic UI update so changes reflect immediately without waiting for network
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              ...updates,
              updatedByName: user!.displayName || user!.email || 'Staff',
            }
          : o
      )
    );

    const payload = {
      ...updates,
      updatedByName: user!.displayName || user!.email || 'Staff',
      updatedAt: serverTimestamp(),
    };

    try {
      await updateDoc(doc(db, 'workspaces', workspaceId, 'orders', orderId), payload);

      // If productsSold or quantity changed, reconcile the stock difference
      if (
        existingOrder &&
        (updates.productsSold !== undefined || updates.quantity !== undefined)
      ) {
        const oldItems = parseProductsSoldString(
          existingOrder.productsSold,
          existingOrder.quantity
        );
        const newItems = parseProductsSoldString(
          updates.productsSold !== undefined ? updates.productsSold : existingOrder.productsSold,
          updates.quantity !== undefined ? updates.quantity : existingOrder.quantity
        );

        const deltaMap = new Map<string, { name: string; qtyDelta: number }>();

        for (const oldIt of oldItems) {
          const key = oldIt.name.trim().toLowerCase();
          deltaMap.set(key, { name: oldIt.name, qtyDelta: -oldIt.qty });
        }
        for (const newIt of newItems) {
          const key = newIt.name.trim().toLowerCase();
          const prev = deltaMap.get(key);
          if (prev) {
            prev.qtyDelta += newIt.qty;
          } else {
            deltaMap.set(key, { name: newIt.name, qtyDelta: newIt.qty });
          }
        }

        const nonZeroDeltas = Array.from(deltaMap.values()).filter(
          (d) => d.qtyDelta !== 0
        );
        if (nonZeroDeltas.length > 0) {
          await applyStockDeltasForOrder(
            nonZeroDeltas,
            updates.noPemesanan || existingOrder.noPemesanan || orderId
          );
        }
      }

      await logActivity(
        'order',
        `Order Diperbarui (${orderId})`,
        `Status: ${updates.shippingStatus || 'Updated'} | Resi: ${updates.noPemesanan || '-'} | Kurir: ${updates.courier || '-'}`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
      throw error;
    }
  };

  const deleteOrder = async (orderId: string) => {
    ensureAuthenticated();
    const path = `workspaces/${workspaceId}/orders/${orderId}`;
    const existingOrder = orders.find((o) => o.id === orderId);

    // 1. Optimistically remove order from UI immediately (0ms delay, no refresh needed)
    deletedOrderIdsRef.current.add(orderId);
    setOrders((prev) => prev.filter((o) => o.id !== orderId));

    try {
      await deleteDoc(doc(db, 'workspaces', workspaceId, 'orders', orderId));
      // Restore stock when an order is deleted
      if (existingOrder && existingOrder.productsSold) {
        const oldItems = parseProductsSoldString(
          existingOrder.productsSold,
          existingOrder.quantity
        );
        if (oldItems.length > 0) {
          await applyStockDeltasForOrder(
            oldItems.map((it) => ({ name: it.name, qtyDelta: -it.qty })),
            `Hapus Order ${existingOrder.noPemesanan || orderId}`
          );
        }
      }
      await logActivity(
        'order',
        `Order Dihapus`,
        `ID Order: ${existingOrder?.noPemesanan || orderId} telah dihapus dari sistem`
      );
    } catch (error) {
      // Rollback optimistic removal if Firestore rejected the delete
      deletedOrderIdsRef.current.delete(orderId);
      if (existingOrder) {
        setOrders((prev) => [existingOrder, ...prev]);
      }
      handleFirestoreError(error, OperationType.DELETE, path);
      throw error;
    }
  };

  const toggleOrderChecklist = async (orderId: string, current: boolean) => {
    ensureAuthenticated();
    await updateOrder(orderId, { checklistComplete: !current });
  };

  const toggleOrderBriDisbursement = async (orderId: string, current: boolean) => {
    ensureAuthenticated();
    const nextState = !current;
    await updateOrder(orderId, {
      disbursedToBri: nextState,
      disbursementStatus: nextState ? 'Sudah cair' : 'Belum cair',
      disbursementDate: nextState ? new Date().toISOString().split('T')[0] : '',
    });
  };

  const addStockItem = async (
    itemData: Omit<
      StockItem,
      'id' | 'workspaceId' | 'authorId' | 'updatedByName' | 'createdAt' | 'updatedAt' | 'stockReady'
    >
  ) => {
    ensureAuthenticated();
    const stockId = `stk-${itemData.sku.toLowerCase().replace(/[^a-z0-9]/g, '-') || Date.now()}`;
    const path = `workspaces/${workspaceId}/stocks/${stockId}`;
    const stockReady = Math.max(0, itemData.stockIn - itemData.stockOut);

    const payload = {
      ...itemData,
      stockReady,
      workspaceId,
      authorId: user!.uid,
      updatedByName: user!.displayName || user!.email || 'Staff',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(doc(db, 'workspaces', workspaceId, 'stocks', stockId), payload);
      await logActivity(
        'stock',
        `Master Produk Baru Ditambahkan`,
        `${itemData.sku} - ${itemData.productName} (Stok Ready: ${stockReady} ${itemData.unit})`
      );
      return stockId;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
      throw error;
    }
  };

  const updateStockItem = async (stockId: string, updates: Partial<StockItem>) => {
    ensureAuthenticated();
    const path = `workspaces/${workspaceId}/stocks/${stockId}`;
    const currentItem = stocks.find((s) => s.id === stockId);

    const newStockIn =
      updates.stockIn !== undefined ? updates.stockIn : currentItem?.stockIn || 0;
    const newStockOut =
      updates.stockOut !== undefined ? updates.stockOut : currentItem?.stockOut || 0;
    const stockReady = Math.max(0, newStockIn - newStockOut);

    // Optimistically update local stocks state immediately
    setStocks((prev) =>
      prev
        .map((s) => (s.id === stockId ? { ...s, ...updates, stockReady } : s))
        .sort((a, b) =>
          (a.productName || '').localeCompare(b.productName || '', 'id', {
            sensitivity: 'base',
          })
        )
    );

    const payload: any = {
      ...updates,
      stockReady,
      updatedByName: user!.displayName || user!.email || 'Staff',
      updatedAt: serverTimestamp(),
    };

    try {
      await updateDoc(doc(db, 'workspaces', workspaceId, 'stocks', stockId), payload);
      await logActivity(
        'stock',
        `Perubahan Data Stok`,
        `${currentItem?.productName || stockId} — Stok Ready kini: ${stockReady}`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
      throw error;
    }
  };

  const adjustStock = async (
    stockId: string,
    type: 'in' | 'out',
    delta: number,
    note: string
  ) => {
    ensureAuthenticated();
    const currentItem = stocks.find((s) => s.id === stockId);
    if (!currentItem) throw new Error('Item stok tidak ditemukan');

    const stockIn = type === 'in' ? currentItem.stockIn + delta : currentItem.stockIn;
    const stockOut = type === 'out' ? currentItem.stockOut + delta : currentItem.stockOut;
    const stockReady = Math.max(0, stockIn - stockOut);

    const path = `workspaces/${workspaceId}/stocks/${stockId}`;
    const today = new Date().toISOString().split('T')[0];

    // Optimistic local state update
    setStocks((prev) =>
      prev.map((s) =>
        s.id === stockId
          ? {
              ...s,
              stockIn,
              stockOut,
              stockReady,
              lastRestockDate: type === 'in' ? today : currentItem.lastRestockDate || today,
            }
          : s
      )
    );

    const payload = {
      stockIn,
      stockOut,
      stockReady,
      lastRestockDate: type === 'in' ? today : currentItem.lastRestockDate || today,
      updatedByName: user!.displayName || user!.email || 'Staff',
      updatedAt: serverTimestamp(),
    };

    try {
      await updateDoc(doc(db, 'workspaces', workspaceId, 'stocks', stockId), payload);
      await logActivity(
        'stock',
        type === 'in' ? `Restock Masuk (+${delta})` : `Stok Keluar (-${delta})`,
        `${currentItem.productName} | Catatan: ${note || '-'} | Sisa Ready: ${stockReady} ${currentItem.unit}`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
      throw error;
    }
  };

  const deleteStockItem = async (stockId: string) => {
    ensureAuthenticated();
    const path = `workspaces/${workspaceId}/stocks/${stockId}`;
    const item = stocks.find((s) => s.id === stockId);

    // 1. Optimistically remove stock item from UI immediately (0ms delay)
    deletedStockIdsRef.current.add(stockId);
    setStocks((prev) => prev.filter((s) => s.id !== stockId));

    try {
      await deleteDoc(doc(db, 'workspaces', workspaceId, 'stocks', stockId));
      await logActivity(
        'stock',
        `Item Stok Dihapus`,
        `${item?.productName || stockId} dihapus dari master inventaris`
      );
    } catch (error) {
      deletedStockIdsRef.current.delete(stockId);
      if (item) {
        setStocks((prev) =>
          [...prev, item].sort((a, b) =>
            (a.productName || '').localeCompare(b.productName || '', 'id', {
              sensitivity: 'base',
            })
          )
        );
      }
      handleFirestoreError(error, OperationType.DELETE, path);
      throw error;
    }
  };

  // Rapihkan & Sinkronkan 48 Stok Real Sentra Naturindo sesuai daftar terbaru (A-Z)
  const syncRealStocksCatalog = async () => {
    ensureAuthenticated();
    const today = new Date().toISOString().split('T')[0];

    // 1. Hapus produk lama/duplikat yang namanya sudah diganti di daftar 48 produk terbaru
    for (const existing of stocks) {
      const lowerName = (existing.productName || '').trim().toLowerCase();
      const upperSku = (existing.sku || '').trim().toUpperCase();
      if (LEGACY_RENAMED_NAMES.has(lowerName) || LEGACY_RENAMED_SKUS.has(upperSku)) {
        const matchesNewCatalogId = NATURINDO_CATALOG.some(
          (cat) => `stk-${cat.sku.toLowerCase().replace(/[^a-z0-9]/g, '-')}` === existing.id
        );
        if (!matchesNewCatalogId) {
          try {
            await deleteDoc(doc(db, 'workspaces', workspaceId, 'stocks', existing.id));
          } catch (err) {
            console.warn('Cleanup legacy stock warning:', err);
          }
        }
      }
    }

    // 2. Set ke-48 produk dengan angka Stok Real terbaru
    for (const item of NATURINDO_CATALOG) {
      const stockId = `stk-${item.sku.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      const stockIn = item.defaultStock;
      const stockOut = 0;
      const stockReady = item.defaultStock;

      await setDoc(doc(db, 'workspaces', workspaceId, 'stocks', stockId), {
        workspaceId,
        sku: item.sku,
        productName: item.name,
        category: item.category,
        stockIn,
        stockOut,
        stockReady,
        minThreshold: item.defaultMinThreshold,
        expTercepat: '2026-11',
        expTerlama: '2028-05',
        unit: 'Botol',
        lastRestockDate: today,
        authorId: user!.uid,
        updatedByName: user!.displayName || 'Admin Sentra',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    try {
      localStorage.setItem('sentra_real_stock_v48_synced', 'true');
    } catch {
      // ignore storage errors
    }

    await logActivity(
      'stock',
      'Rapihkan 48 Stok Real Naturindo (A-Z)',
      'Seluruh 48 produk (Reguler, Premium, GO) berhasil dirapihkan sesuai daftar stok real terbaru.'
    );
  };

  // Auto-sync once when user logs in if the 48 real stock list hasn't been synced yet
  useEffect(() => {
    if (!user || loadingData || autoSyncedRef.current) return;

    const alreadySynced =
      typeof window !== 'undefined' &&
      localStorage.getItem('sentra_real_stock_v48_synced') === 'true';

    const hasLegacyItems = stocks.some((s) =>
      LEGACY_RENAMED_NAMES.has((s.productName || '').trim().toLowerCase())
    );

    if (!alreadySynced || hasLegacyItems || stocks.length < 48) {
      autoSyncedRef.current = true;
      syncRealStocksCatalog().catch((err) => {
        console.warn('Auto-sync 48 real stocks warning:', err);
      });
    }
  }, [user, loadingData, stocks.length]);

  return (
    <WorkspaceContext.Provider
      value={{
        workspaceId,
        orders,
        stocks,
        activities,
        members,
        loadingData,
        addOrder,
        updateOrder,
        deleteOrder,
        toggleOrderChecklist,
        toggleOrderBriDisbursement,
        addStockItem,
        updateStockItem,
        adjustStock,
        deleteStockItem,
        logActivity,
        seedAll27ProductsWith10Stock: syncRealStocksCatalog,
        syncRealStocksCatalog,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
};
