export type DemoRole = 'Owner' | 'Admin' | 'Manager' | 'Viewer';

export interface FinancialSnapshot {
  date: string; grossRevenue: number; cogs: number; adSpend: number; shippingCosts: number;
  processingFees: number; netProfit: number; blendedMer: number | null; grossMarginPct: number | null;
}
export interface LtvCohort {
  cohortMonth: string; cohortSize: number; revenueM0: number; revenueM1: number; revenueM2: number;
  cac: number; paybackBucket: '30' | '60' | '90' | '90+' | null;
}
export interface StatsResponse {
  netProfit: number; grossMarginPct: number; blendedMer: number; blendedCac: number; snapshotDate: string | null;
}
export interface SnapshotsResponse { snapshots: FinancialSnapshot[] }
export interface CohortsResponse { cohorts: LtvCohort[] }
export interface SyncResponse { snapshot: FinancialSnapshot }

export type CopilotStatus = 'Success' | 'Rejected' | 'Error';
export interface CopilotResult {
  status: CopilotStatus; question: string; generatedSql: string | null;
  rows: Record<string, unknown>[]; rowCount: number | null; errorDetail: string | null;
}

export interface UsageByModule {
  module: 'core' | 'reply' | 'ops' | 'cfo'; taskType: string; taskCount: number;
  totalCostUsd: number; tokensIn: number; tokensOut: number;
}
export interface UsageSummaryResponse {
  byModule: UsageByModule[]; totalCostUsd: number; totalTasks: number; unreportedCount: number;
}
