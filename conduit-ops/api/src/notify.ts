export interface CoreEvent {
  ledgerId: string;
  tenantId: string;
  topic: string;
  orderId?: string;
}
