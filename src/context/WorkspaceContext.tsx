import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
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

const WORKSPACE_ID = 'sentra-naturindo';

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

const toFirestoreLikeTimestamp = (isoString?: string | null) => {
  if (!isoString) return null;
  const ms = Date.parse(isoString);
  if (Number.isNaN(ms)) return null;
  return { seconds: Math.floor(ms / 1000) };
};

const mapRowToOrder = (row: any): OrderRecord => ({
  id: row.id,
  workspaceId: row.workspace_id || WORKSPACE_ID,
  orderDate: row.order_date || '',
  storeName: row.store_name || '',
  ownerName: row.owner_name || '',
  marketplace: row.marketplace || 'Shopee',
  courier: row.courier || '',
  noPemesanan: row.no_pemesanan || '',
  noResi: row.no_resi || '',
  resiFileData: row.resi_file_data || '',
  resiFileName: row.resi_file_name || '',
  productsSold: row.products_sold || '',
  quantity: Number(row.quantity) || 1,
  checklistComplete: Boolean(row.checklist_complete),
  shippingStatus: row.shipping_status || 'Diproses',
  dropoffDate: row.dropoff_date || '',
  drivePrintUrl: row.drive_print_url || '',
  notes: row.notes || '',
  disbursedToBri: Boolean(row.disbursed_to_bri),
  disbursementStatus: row.disbursement_status || 'Belum cair',
  disbursementDate: row.disbursement_date || '',
  disbursementProof: row.disbursement_proof || '',
  disbursementProofData: row.disbursement_proof_data || '',
  disbursementProofFileName: row.disbursement_proof_file_name || '',
  verifiedCheck: Boolean(row.verified_check),
  authorId: row.author_id || '',
  updatedByName: row.updated_by_name || '',
  createdAt: toFirestoreLikeTimestamp(row.created_at) as any,
  updatedAt: toFirestoreLikeTimestamp(row.updated_at) as any,
});

const mapOrderToDbRow = (data: Partial<OrderRecord>) => {
  const row: Record<string, any> = {};
  if (data.workspaceId !== undefined) row.workspace_id = data.workspaceId;
  if (data.orderDate !== undefined) row.order_date = data.orderDate;
  if (data.storeName !== undefined) row.store_name = data.storeName;
  if (data.ownerName !== undefined) row.owner_name = data.ownerName;
  if (data.marketplace !== undefined) row.marketplace = data.marketplace;
  if (data.courier !== undefined) row.courier = data.courier;
  if (data.noPemesanan !== undefined) row.no_pemesanan = data.noPemesanan;
  if (data.noResi !== undefined) row.no_resi = data.noResi;
  if (data.resiFileData !== undefined) row.resi_file_data = data.resiFileData;
  if (data.resiFileName !== undefined) row.resi_file_name = data.resiFileName;
  if (data.productsSold !== undefined) row.products_sold = data.productsSold;
  if (data.quantity !== undefined) row.quantity = data.quantity;
  if (data.checklistComplete !== undefined) row.checklist_complete = data.checklistComplete;
  if (data.shippingStatus !== undefined) row.shipping_status = data.shippingStatus;
  if (data.dropoffDate !== undefined) row.dropoff_date = data.dropoffDate;
  if (data.drivePrintUrl !== undefined) row.drive_print_url = data.drivePrintUrl;
  if (data.notes !== undefined) row.notes = data.notes;
  if (data.disbursedToBri !== undefined) row.disbursed_to_bri = data.disbursedToBri;
  if (data.disbursementStatus !== undefined) row.disbursement_status = data.disbursementStatus;
  if (data.disbursementDate !== undefined) row.disbursement_date = data.disbursementDate;
  if (data.disbursementProof !== undefined) row.disbursement_proof = data.disbursementProof;
  if (data.disbursementProofData !== undefined) row.disbursement_proof_data = data.disbursementProofData;
  if (data.disbursementProofFileName !== undefined) row.disbursement_proof_file_name = data.disbursementProofFileName;
  if (data.verifiedCheck !== undefined) row.verified_check = data.verifiedCheck;
  if (data.authorId !== undefined) row.author_id = data.authorId;
  if (data.updatedByName !== undefined) row.updated_by_name = data.updatedByName;
  return row;
};

const mapRowToStock = (row: any): StockItem => ({
  id: row.id,
  workspaceId: row.workspace_id || WORKSPACE_ID,
  sku: row.sku || '',
  productName: row.product_name || '',
  category: row.category || '',
  stockIn: Number(row.stock_in) || 0,
  stockOut: Number(row.stock_out) || 0,
  stockReady: Number(row.stock_ready) || 0,
  minThreshold: Number(row.min_threshold) || 3,
  unit: row.unit || 'Botol',
  expTercepat: row.exp_tercepat || '',
  expTerlama: row.exp_terlama || '',
  lastRestockDate: row.last_restock_date || '',
  authorId: row.author_id || '',
  updatedByName: row.updated_by_name || '',
  createdAt: toFirestoreLikeTimestamp(row.created_at) as any,
  updatedAt: toFirestoreLikeTimestamp(row.updated_at) as any,
});

const mapStockToDbRow = (data: Partial<StockItem>) => {
  const row: Record<string, any> = {};
  if (data.workspaceId !== undefined) row.workspace_id = data.workspaceId;
  if (data.sku !== undefined) row.sku = data.sku;
  if (data.productName !== undefined) row.product_name = data.productName;
  if (data.category !== undefined) row.category = data.category;
  if (data.stockIn !== undefined) row.stock_in = data.stockIn;
  if (data.stockOut !== undefined) row.stock_out = data.stockOut;
  if (data.stockReady !== undefined) row.stock_ready = data.stockReady;
  if (data.minThreshold !== undefined) row.min_threshold = data.minThreshold;
  if (data.unit !== undefined) row.unit = data.unit;
  if (data.expTercepat !== undefined) row.exp_tercepat = data.expTercepat;
  if (data.expTerlama !== undefined) row.exp_terlama = data.expTerlama;
  if (data.lastRestockDate !== undefined) row.last_restock_date = data.lastRestockDate;
  if (data.authorId !== undefined) row.author_id = data.authorId;
  if (data.updatedByName !== undefined) row.updated_by_name = data.updatedByName;
  return row;
};

const mapRowToActivity = (row: any): ActivityLog => ({
  id: row.id,
  workspaceId: row.workspace_id || WORKSPACE_ID,
  category: row.category || 'order',
  actionTitle: row.action_title || '',
  detail: row.detail || '',
  actorUid: row.actor_uid || '',
  actorName: row.actor_name || 'Staff Sentra',
  actorRole: row.actor_role || 'staff',
  createdAt: toFirestoreLikeTimestamp(row.created_at) as any,
});

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, role } = useAuth();
  const workspaceId = WORKSPACE_ID;

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const deletedOrderIdsRef = useRef<Set<string>>(new Set());
  const deletedStockIdsRef = useRef<Set<string>>(new Set());

  const fetchAllData = useCallback(async () => {
    try {
      const [ordersRes, stocksRes, actRes, membersRes] = await Promise.all([
        supabase
          .from('orders')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('order_date', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('stocks')
          .select('*')
          .eq('workspace_id', workspaceId),
        supabase
          .from('activities')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })
          .limit(60),
        supabase
          .from('members')
          .select('*')
          .eq('workspace_id', workspaceId),
      ]);

      if (ordersRes.data) {
        const mappedOrders = ordersRes.data
          .filter((r) => !deletedOrderIdsRef.current.has(r.id))
          .map(mapRowToOrder);
        setOrders(mappedOrders);
      }

      if (stocksRes.data) {
        const mappedStocks = stocksRes.data
          .filter((r) => !deletedStockIdsRef.current.has(r.id))
          .map(mapRowToStock)
          .sort((a, b) =>
            String(a.productName || '').localeCompare(String(b.productName || ''), 'id', {
              sensitivity: 'base',
            })
          );
        setStocks(mappedStocks);
      }

      if (actRes.data) {
        setActivities(actRes.data.map(mapRowToActivity));
      }

      if (membersRes.data) {
        setMembers(
          membersRes.data.map((m: any) => ({
            uid: m.uid,
            workspaceId: m.workspace_id || 'sentra-naturindo',
            email: m.email || '',
            displayName: m.display_name || '',
            role: m.role || 'staff',
            addedByUid: m.added_by_uid || '',
            createdAt: toFirestoreLikeTimestamp(m.created_at) as any,
            updatedAt: toFirestoreLikeTimestamp(m.updated_at || m.created_at) as any,
          }))
        );
      }
    } catch (err) {
      console.error('Supabase fetch error:', err);
    } finally {
      setLoadingData(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    setLoadingData(true);
    fetchAllData();

    const channel = supabase
      .channel('sentra-naturindo-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => fetchAllData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stocks' },
        () => fetchAllData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'activities' },
        () => fetchAllData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAllData]);

  const logActivity = async (
    category: 'order' | 'stock' | 'access',
    actionTitle: string,
    detail: string
  ) => {
    if (!user) return;
    const actId = `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    const optimisticLog: ActivityLog = {
      id: actId,
      workspaceId,
      category,
      actionTitle,
      detail,
      actorUid: user.uid,
      actorName: user.displayName || user.email || 'Staff Sentra',
      actorRole: role,
      createdAt: toFirestoreLikeTimestamp(nowIso) as any,
    };
    setActivities((prev) => [optimisticLog, ...prev.slice(0, 59)]);

    try {
      await supabase.from('activities').insert({
        id: actId,
        workspace_id: workspaceId,
        category,
        action_title: actionTitle,
        detail,
        actor_uid: user.uid,
        actor_name: user.displayName || user.email || 'Staff Sentra',
        actor_role: role,
        created_at: nowIso,
      });
    } catch (err) {
      console.warn('Log activity error:', err);
    }
  };

  const ensureAuthenticated = () => {
    if (!user) {
      throw new Error(
        'Akses ditolak: Anda harus login dengan akun Google untuk menginput atau mengubah data.'
      );
    }
  };

  const applyStockDeltasForOrder = async (
    deltas: { name: string; qtyDelta: number }[],
    orderCodeLabel: string,
    actionTitle = 'Potong Stok Otomatis'
  ) => {
    if (!user || deltas.length === 0) return;

    const summaryLogs: string[] = [];

    for (const { name, qtyDelta } of deltas) {
      if (!name || qtyDelta === 0) continue;
      const targetNameLower = String(name).trim().toLowerCase();

      const matchedStock = stocks.find(
        (s) => String(s.productName || '').trim().toLowerCase() === targetNameLower
      );

      if (matchedStock) {
        const currentStockIn = Number(matchedStock.stockIn) || 0;
        const currentStockOut = Number(matchedStock.stockOut) || 0;
        const nextStockOut = Math.max(0, currentStockOut + qtyDelta);
        const nextStockReady = Math.max(0, currentStockIn - nextStockOut);

        setStocks((prev) =>
          prev.map((s) =>
            s.id === matchedStock.id
              ? { ...s, stockOut: nextStockOut, stockReady: nextStockReady }
              : s
          )
        );

        const { error } = await supabase
          .from('stocks')
          .update({
            stock_out: nextStockOut,
            stock_ready: nextStockReady,
            updated_by_name: user.displayName || user.email || 'Staff',
            updated_at: new Date().toISOString(),
          })
          .eq('id', matchedStock.id);

        if (!error) {
          summaryLogs.push(
            `${matchedStock.productName} (${qtyDelta > 0 ? `-${qtyDelta}` : `+${Math.abs(qtyDelta)}`} -> Sisa: ${nextStockReady})`
          );
        }
      }
    }

    if (summaryLogs.length > 0) {
      await logActivity(
        'stock',
        `${actionTitle} (${orderCodeLabel})`,
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
    const nowIso = new Date().toISOString();

    const dbRow = {
      id: orderId,
      ...mapOrderToDbRow({
        ...orderData,
        workspaceId,
        authorId: user!.uid,
        updatedByName: user!.displayName || user!.email || 'Staff',
      }),
      created_at: nowIso,
      updated_at: nowIso,
    };

    const { error } = await supabase.from('orders').insert(dbRow);
    if (error) throw new Error(error.message);

    setOrders((prev) => [mapRowToOrder(dbRow), ...prev]);

    const parsedItems = parseProductsSoldString(
      String(orderData.productsSold || ''),
      Number(orderData.quantity) || 1
    );
    if (parsedItems.length > 0) {
      await applyStockDeltasForOrder(
        parsedItems.map((it) => ({ name: it.name, qtyDelta: it.qty })),
        orderData.noPemesanan || orderId,
        'Potong Stok Otomatis'
      );
    }

    await logActivity(
      'order',
      `Order Baru Dibuat (${orderData.marketplace})`,
      `${orderData.storeName} — ${orderData.productsSold} (Qty: ${orderData.quantity}) | Resi: ${orderData.noPemesanan} | Kurir: ${orderData.courier || '-'}`
    );
    return orderId;
  };

  const updateOrder = async (orderId: string, updates: Partial<OrderRecord>) => {
    ensureAuthenticated();
    const existingOrder = orders.find((o) => o.id === orderId);
    const updatedByName = user!.displayName || user!.email || 'Staff';

    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              ...updates,
              updatedByName,
            }
          : o
      )
    );

    const dbUpdates = {
      ...mapOrderToDbRow({ ...updates, updatedByName }),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('orders')
      .update(dbUpdates)
      .eq('id', orderId);
    if (error) throw new Error(error.message);

    if (
      existingOrder &&
      (updates.productsSold !== undefined || updates.quantity !== undefined)
    ) {
      const oldItems = parseProductsSoldString(
        String(existingOrder.productsSold || ''),
        Number(existingOrder.quantity) || 1
      );
      const newItems = parseProductsSoldString(
        String(
          updates.productsSold !== undefined
            ? updates.productsSold
            : existingOrder.productsSold || ''
        ),
        Number(
          updates.quantity !== undefined
            ? updates.quantity
            : existingOrder.quantity
        ) || 1
      );

      const deltaMap = new Map<string, { name: string; qtyDelta: number }>();

      for (const oldIt of oldItems) {
        const key = String(oldIt.name).trim().toLowerCase();
        deltaMap.set(key, { name: oldIt.name, qtyDelta: -oldIt.qty });
      }
      for (const newIt of newItems) {
        const key = String(newIt.name).trim().toLowerCase();
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
          updates.noPemesanan || existingOrder.noPemesanan || orderId,
          'Penyesuaian Stok Edit Order'
        );
      }
    }

    await logActivity(
      'order',
      `Order Diperbarui (${orderId})`,
      `Status: ${updates.shippingStatus || 'Updated'} | Resi: ${updates.noPemesanan || '-'} | Kurir: ${updates.courier || '-'}`
    );
  };

  const deleteOrder = async (orderId: string) => {
    ensureAuthenticated();
    const existingOrder = orders.find((o) => o.id === orderId);

    deletedOrderIdsRef.current.add(orderId);
    setOrders((prev) => prev.filter((o) => o.id !== orderId));

    const { error } = await supabase.from('orders').delete().eq('id', orderId);
    if (error) {
      deletedOrderIdsRef.current.delete(orderId);
      if (existingOrder) setOrders((prev) => [existingOrder, ...prev]);
      throw new Error(error.message);
    }

    if (existingOrder && existingOrder.productsSold) {
      const oldItems = parseProductsSoldString(
        String(existingOrder.productsSold || ''),
        Number(existingOrder.quantity) || 1
      );
      if (oldItems.length > 0) {
        await applyStockDeltasForOrder(
          oldItems.map((it) => ({ name: it.name, qtyDelta: -it.qty })),
          `Hapus Order ${existingOrder.noPemesanan || orderId}`,
          'Balik Stok Otomatis (Hapus Order)'
        );
      }
    }

    await logActivity(
      'order',
      `Order Dihapus`,
      `ID Order: ${existingOrder?.noPemesanan || orderId} telah dihapus dari sistem & stok dikembalikan`
    );
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
    const stockReady = Math.max(0, itemData.stockIn - itemData.stockOut);
    const nowIso = new Date().toISOString();

    const dbRow = {
      id: stockId,
      ...mapStockToDbRow({
        ...itemData,
        stockReady,
        workspaceId,
        authorId: user!.uid,
        updatedByName: user!.displayName || user!.email || 'Staff',
      }),
      created_at: nowIso,
      updated_at: nowIso,
    };

    const { error } = await supabase.from('stocks').upsert(dbRow);
    if (error) throw new Error(error.message);

    setStocks((prev) =>
      [...prev.filter((s) => s.id !== stockId), mapRowToStock(dbRow)].sort((a, b) =>
        String(a.productName || '').localeCompare(String(b.productName || ''), 'id', {
          sensitivity: 'base',
        })
      )
    );

    await logActivity(
      'stock',
      `Master Produk Baru Ditambahkan`,
      `${itemData.sku} - ${itemData.productName} (Stok Ready: ${stockReady} ${itemData.unit})`
    );
    return stockId;
  };

  const updateStockItem = async (stockId: string, updates: Partial<StockItem>) => {
    ensureAuthenticated();
    const currentItem = stocks.find((s) => s.id === stockId);

    const newStockIn =
      updates.stockIn !== undefined ? updates.stockIn : currentItem?.stockIn || 0;
    const newStockOut =
      updates.stockOut !== undefined ? updates.stockOut : currentItem?.stockOut || 0;
    const stockReady = Math.max(0, newStockIn - newStockOut);

    setStocks((prev) =>
      prev
        .map((s) => (s.id === stockId ? { ...s, ...updates, stockReady } : s))
        .sort((a, b) =>
          String(a.productName || '').localeCompare(String(b.productName || ''), 'id', {
            sensitivity: 'base',
          })
        )
    );

    const dbUpdates = {
      ...mapStockToDbRow({
        ...updates,
        stockReady,
        updatedByName: user!.displayName || user!.email || 'Staff',
      }),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('stocks')
      .update(dbUpdates)
      .eq('id', stockId);
    if (error) throw new Error(error.message);

    await logActivity(
      'stock',
      `Perubahan Data Stok`,
      `${currentItem?.productName || stockId} — Stok Ready kini: ${stockReady}`
    );
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
    const today = new Date().toISOString().split('T')[0];
    const lastRestockDate = type === 'in' ? today : currentItem.lastRestockDate || today;

    setStocks((prev) =>
      prev.map((s) =>
        s.id === stockId
          ? { ...s, stockIn, stockOut, stockReady, lastRestockDate }
          : s
      )
    );

    const { error } = await supabase
      .from('stocks')
      .update({
        stock_in: stockIn,
        stock_out: stockOut,
        stock_ready: stockReady,
        last_restock_date: lastRestockDate,
        updated_by_name: user!.displayName || user!.email || 'Staff',
        updated_at: new Date().toISOString(),
      })
      .eq('id', stockId);
    if (error) throw new Error(error.message);

    await logActivity(
      'stock',
      type === 'in' ? `Restock Masuk (+${delta})` : `Stok Keluar (-${delta})`,
      `${currentItem.productName} | Catatan: ${note || '-'} | Sisa Ready: ${stockReady} ${currentItem.unit}`
    );
  };

  const deleteStockItem = async (stockId: string) => {
    ensureAuthenticated();
    const item = stocks.find((s) => s.id === stockId);

    deletedStockIdsRef.current.add(stockId);
    setStocks((prev) => prev.filter((s) => s.id !== stockId));

    const { error } = await supabase.from('stocks').delete().eq('id', stockId);
    if (error) {
      deletedStockIdsRef.current.delete(stockId);
      if (item) {
        setStocks((prev) =>
          [...prev, item].sort((a, b) =>
            String(a.productName || '').localeCompare(String(b.productName || ''), 'id', {
              sensitivity: 'base',
            })
          )
        );
      }
      throw new Error(error.message);
    }

    await logActivity(
      'stock',
      `Item Stok Dihapus`,
      `${item?.productName || stockId} dihapus dari master inventaris`
    );
  };

  const syncRealStocksCatalog = async () => {
    ensureAuthenticated();
    const today = new Date().toISOString().split('T')[0];

    for (const existing of stocks) {
      const lowerName = String(existing.productName || '').trim().toLowerCase();
      const upperSku = String(existing.sku || '').trim().toUpperCase();
      if (LEGACY_RENAMED_NAMES.has(lowerName) || LEGACY_RENAMED_SKUS.has(upperSku)) {
        const matchesNewCatalogId = NATURINDO_CATALOG.some(
          (cat) => `stk-${cat.sku.toLowerCase().replace(/[^a-z0-9]/g, '-')}` === existing.id
        );
        if (!matchesNewCatalogId) {
          await supabase.from('stocks').delete().eq('id', existing.id);
        }
      }
    }

    const rowsToUpsert = NATURINDO_CATALOG.map((item) => {
      const stockId = `stk-${item.sku.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      const existingItem = stocks.find((s) => s.id === stockId);

      const stockIn = item.defaultStock;
      const stockOut = existingItem ? Number(existingItem.stockOut) || 0 : 0;
      const stockReady = Math.max(0, stockIn - stockOut);

      return {
        id: stockId,
        workspace_id: workspaceId,
        sku: item.sku,
        product_name: item.name,
        category: item.category,
        stock_in: stockIn,
        stock_out: stockOut,
        stock_ready: stockReady,
        min_threshold: item.defaultMinThreshold,
        exp_tercepat: existingItem?.expTercepat || '2026-11',
        exp_terlama: existingItem?.expTerlama || '2028-05',
        unit: 'Botol',
        last_restock_date: existingItem?.lastRestockDate || today,
        author_id: user!.uid,
        updated_by_name: user!.displayName || 'Admin Sentra',
        updated_at: new Date().toISOString(),
      };
    });

    const { error } = await supabase.from('stocks').upsert(rowsToUpsert);
    if (error) throw new Error(error.message);

    await fetchAllData();
    await logActivity(
      'stock',
      'Rapihkan 48 Stok Real Naturindo (A-Z)',
      'Seluruh 48 produk berhasil dirapihkan.'
    );
  };

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

