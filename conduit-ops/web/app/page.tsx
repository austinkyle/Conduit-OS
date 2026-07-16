'use client';
import { useCallback, useEffect, useState } from 'react';
import AlertsList from '../components/AlertsList';
import PurchaseOrderPanel from '../components/PurchaseOrderPanel';
import SkuDepletionChart from '../components/SkuDepletionChart';
import StatsCards from '../components/StatsCards';
import SupplierList from '../components/SupplierList';
import { apiFetch, currentRole, TOKEN_CHANGED_EVENT } from '../lib/api';
import type { AlertsResponse, DemoRole, InventoryAlert, PurchaseOrder, PurchaseOrdersResponse, StatsResponse, Supplier, SuppliersResponse } from '../types';

const emptyStats: StatsResponse = { openPurchaseOrders: 0, activeAlerts: 0, avgConfidence: 0, totalForecastedReorderValue: 0 };

export default function Home() {
  const [alerts, setAlerts] = useState<InventoryAlert[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stats, setStats] = useState<StatsResponse>(emptyStats);
  const [role, setRole] = useState<DemoRole>('Admin');
  const [error, setError] = useState('');

  const fetchOverview = useCallback(async () => {
    try {
      const [alertsRes, suppliersRes, poRes, statsRes] = await Promise.all([
        apiFetch<AlertsResponse>('/api/v1/erp/inventory/alerts'),
        apiFetch<SuppliersResponse>('/api/v1/erp/suppliers'),
        apiFetch<PurchaseOrdersResponse>('/api/v1/erp/purchase-orders'),
        apiFetch<StatsResponse>('/api/v1/erp/stats'),
      ]);
      setAlerts(alertsRes.alerts); setSuppliers(suppliersRes.suppliers); setPurchaseOrders(poRes.purchaseOrders); setStats(statsRes); setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load dashboard'); }
  }, []);

  useEffect(() => { setRole(currentRole()); fetchOverview(); const onTokenChange = () => { setRole(currentRole()); fetchOverview(); }; window.addEventListener(TOKEN_CHANGED_EVENT, onTokenChange); return () => window.removeEventListener(TOKEN_CHANGED_EVENT, onTokenChange); }, [fetchOverview]);
  useEffect(() => { const timer = window.setInterval(fetchOverview, 5000); return () => window.clearInterval(timer); }, [fetchOverview]);

  async function transitionPo(id: string, status: 'Sent' | 'Received' | 'Closed') {
    try { await apiFetch(`/api/v1/erp/purchase-orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await fetchOverview(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not update purchase order'); }
  }

  const selectedAlert = alerts.find((alert) => alert.productId === selectedId) ?? null;

  return <main className="mx-auto max-w-[1600px] space-y-6 px-4 py-8 sm:px-6 lg:px-8">
    <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">ERP Operations</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-white">Supply Chain Command Center</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Track SKU-level stockout risk, review auto-drafted purchase orders, and manage supplier relationships from one dashboard.</p></div>
    {error && <p role="alert" className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</p>}
    <StatsCards stats={stats} />
    <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
      <AlertsList alerts={alerts} selectedId={selectedId} onSelect={setSelectedId} />
      <div className="flex flex-1 flex-col gap-4">
        <SkuDepletionChart alert={selectedAlert} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <PurchaseOrderPanel purchaseOrders={purchaseOrders} role={role} onTransition={transitionPo} />
          <SupplierList suppliers={suppliers} />
        </div>
      </div>
    </div>
  </main>;
}
