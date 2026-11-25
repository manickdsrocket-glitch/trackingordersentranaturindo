// Lengkapi detail log lama dengan nama produk lalu filter berdasarkan pencarian
  const filteredActivities = useMemo(() => {
    const enriched = activities.map((act) => {
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
      if (act.detail.toLowerCase().includes(matchedOrder.productsSold.toLowerCase())) {
        return act;
      }

      const prefix = `${matchedOrder.storeName ? `${matchedOrder.storeName} — ` : ''}${matchedOrder.productsSold} (Qty: ${matchedOrder.quantity || 1})`;
      return {
        ...act,
        detail: `${prefix} | ${act.detail}`,
      };
    });

    const term = activitySearch.trim().toLowerCase();
    if (!term) return enriched;
    return enriched.filter(
      (act) =>
        (act.detail || '').toLowerCase().includes(term) ||
        (act.actionTitle || '').toLowerCase().includes(term) ||
        (act.actorName || '').toLowerCase().includes(term)
    );
  }, [activities, orders, activitySearch]);