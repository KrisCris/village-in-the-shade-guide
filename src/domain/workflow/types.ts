import type { Quality } from "../quality";
export type NodeKind =
  | "purchase"
  | "inventory"
  | "plant"
  | "process"
  | "reserve"
  | "delivery"
  | "consume"
  | "sale";
export type Amount = { itemId: string; quantity: number };
export type WorkflowNode = {
  id: string;
  kind: NodeKind;
  label: string;
  position: { x: number; y: number };
  quantity: number;
  startDay: number;
  repeat: boolean;
  autoBuy: boolean;
  priority: number;
  itemId?: string;
  cropId?: string;
  recipeId?: string;
  resourceId?: string;
  amountMode?: "auto" | "manual";
  dateMode?: "auto" | "manual";
  machineCount?: number;
  machineId?: string;
  endDay?: number;
  dueDay?: number;
  requirements?: Amount[];
  sourceId?: string;
  remainingDays?: number;
};
export type WorkflowEdge = { id: string; source: string; target: string };
export type PlotResource = { id: string; label: string; capacity: number };
export type MachineResource = {
  id: string;
  label: string;
  machineId: string;
  count: number;
  capacity: number;
};
export type WorkflowPlan = {
  version: 1;
  planningMode?: "intent";
  name: string;
  startDay: number;
  days: number;
  initialCash: number;
  quality: Quality;
  settlementDays: number;
  plots: PlotResource[];
  machines: MachineResource[];
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};
export type PlanEvent = {
  day: number;
  nodeId: string;
  kind:
    | "inventory"
    | "purchase"
    | "plant"
    | "harvest"
    | "process"
    | "complete"
    | "reserve"
    | "delivery"
    | "consume"
    | "sale"
    | "receipt"
    | "warning";
  message: string;
  itemId?: string;
  quantity?: number;
  amount?: number;
  reason?: "initial" | "replant";
};
export type StockRow = {
  nodeId: string;
  itemId: string;
  quantity: number;
  reserved: boolean;
  state?: "usable" | "reserved" | "waiting";
};
export type DayResult = {
  day: number;
  cash: number;
  income: number;
  spending: number;
  pendingRevenue: number;
  events: PlanEvent[];
  stock: StockRow[];
  inProgress?: WorkInProgress[];
  land?: number;
};
export type SimulationResult = {
  days: DayResult[];
  events: PlanEvent[];
  issues: string[];
  income: number;
  spending: number;
  cash: number;
  pendingRevenue: number;
  stock: StockRow[];
  inProgress: Array<{
    nodeId: string;
    finishDay: number;
    itemId: string;
    quantity: number;
  }>;
  demandProgress: Record<string, Amount[]>;
  intent?: IntentResult;
};

export type WorkInProgress = {
  nodeId: string;
  finishDay: number;
  itemId: string;
  quantity: number;
  kind?: "plant" | "process";
};
export type NodeProjection = {
  status: "draft" | "blocked" | "waiting" | "scheduled" | "done";
  notices: string[];
  firstDay?: number;
  finishDay?: number;
  quantity: number;
  outputQuantity: number;
  machines: number;
  machineId?: string;
  machineCapacity?: number;
  land: number;
  reserved: number;
  delivered: boolean;
  readyDay?: number;
  rawValue?: number;
  processedValue?: number;
  duration?: number;
};
export type IntentResult = {
  resolvedNodes: WorkflowNode[];
  nodes: Record<string, NodeProjection>;
  edgeTransfers: Record<string, Amount[]>;
  edgeSchedule: Record<string, Array<Amount & { day: number }>>;
  land: number;
  startupFunds: number;
  finalIncome: number;
  finalSpending: number;
  finalDelta: number;
  finishDay: number;
  periodEnd: number;
  complete: boolean;
};
