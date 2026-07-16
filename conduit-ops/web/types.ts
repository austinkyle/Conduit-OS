export type DemoRole = 'Owner' | 'Admin' | 'Manager' | 'Viewer';

export interface InventoryAlert {
  productId: string; sku: string; title: string; supplierId: string | null;
  inventoryQty: number; safetyStockLimit: number; predictedDepletionDate: string | null;
  suggestedReorderQty: number; confidenceScore: number; forecastDate: string;
}
export interface Product {
  id: string; sku: string; title: string; inventory_qty: number; safety_stock_limit: number;
  unit_cost: string; supplier_id: string | null;
}
export interface Supplier {
  id: string; name: string; email: string; lead_time_days: number; moq: number;
}
export interface PurchaseOrderItem {
  productId: string; sku: string; title: string; quantity: number; unitCost: number;
}
export interface PurchaseOrder {
  id: string; supplierId: string; status: 'Draft' | 'Sent' | 'Received' | 'Closed';
  items: PurchaseOrderItem[]; totalAmount: number; trackingUrl: string | null;
  createdAt: string; updatedAt: string;
}
export interface StatsResponse {
  openPurchaseOrders: number; activeAlerts: number; avgConfidence: number; totalForecastedReorderValue: number;
}
export interface AlertsResponse { alerts: InventoryAlert[] }
export interface ProductsResponse { products: Product[] }
export interface SuppliersResponse { suppliers: Supplier[] }
export interface PurchaseOrdersResponse { purchaseOrders: PurchaseOrder[] }
