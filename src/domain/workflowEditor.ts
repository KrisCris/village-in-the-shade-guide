import { z } from "zod";
import type { Entity } from "../data/types";
import type {
  WorkflowPlan,
  WorkflowNode,
  WorkflowEdge,
  NodeKind,
} from "./workflow/types";

export const nodeLabels: Record<NodeKind, string> = {
  purchase: "买入",
  inventory: "已有库存",
  plant: "种植",
  process: "加工",
  reserve: "留货",
  delivery: "供奉 / 交付",
  consume: "日常消耗",
  sale: "出售",
};
export const uid = () => globalThis.crypto.randomUUID();
export function newNode(kind: NodeKind, day: number, index = 0): WorkflowNode {
  return {
    id: uid(),
    kind,
    label: nodeLabels[kind],
    labelMode: "auto",
    quantity: kind === "sale" ? 0 : 1,
    startDay: day,
    repeat: ["process", "sale"].includes(kind),
    autoBuy: kind === "plant",
    amountMode: ["purchase", "inventory"].includes(kind) ? "manual" : "auto",
    dateMode: ["purchase", "inventory"].includes(kind) ? "manual" : "auto",
    priority: ["reserve", "delivery"].includes(kind) ? 0 : 10,
    position: {
      x: 80 + (index % 3) * 290,
      y: 70 + Math.floor(index / 3) * 180,
    },
  };
}
export function createDemandNodes(
  entities: Entity[],
  day: number,
  exclude: string[] = [],
): WorkflowNode[] {
  const season = ["spring", "summer", "autumn", "winter"][
    Math.floor((day - 1) / 28) % 4
  ];
  const name = ["春", "夏", "秋", "冬"][Math.floor((day - 1) / 28) % 4];
  return entities
    .filter(
      (e) =>
        e.kind === "activities" &&
        !exclude.includes(e.id) &&
        (e.id.startsWith(`BUNDLE_ID_${season.toUpperCase()}_`) ||
          (e.id.startsWith("BUNDLE_ID_VILLAGE_HEAD_") &&
            e.name.zh_hans.startsWith(`${name}季`))),
    )
    .map((e, i) => ({
      ...newNode("delivery", day, i),
      label: e.name.zh_hans,
      labelMode: "manual" as const,
      sourceId: e.id,
      position: { x: 960 + (i % 3) * 310, y: 40 + Math.floor(i / 3) * 230 },
      requirements: (
        (e.inputs ?? []) as { item_id: string; quantity: number }[]
      ).map((a) => ({ itemId: a.item_id, quantity: a.quantity })),
    }));
}
export function createPlan(entities: Entity[]): WorkflowPlan {
  return {
    version: 1,
    planningMode: "intent",
    name: "我的农场生产计划",
    startDay: 1,
    days: 28,
    initialCash: 0,
    quality: "normal",
    settlementDays: 1,
    plots: [],
    machines: [],
    nodes: createDemandNodes(entities, 1),
    edges: [],
  };
}
export function copySelection(
  plan: Pick<WorkflowPlan, "nodes" | "edges">,
  selected: string[],
): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  const ids = new Map(selected.map((id) => [id, uid()]));
  return {
    nodes: plan.nodes
      .filter((n) => ids.has(n.id))
      .map((n) => ({
        ...structuredClone(n),
        id: ids.get(n.id)!,
        position: { x: n.position.x + 40, y: n.position.y + 40 },
      })),
    edges: plan.edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({
        id: uid(),
        source: ids.get(e.source)!,
        target: ids.get(e.target)!,
      })),
  };
}
const id = z
  .string()
  .min(1)
  .max(160)
  .refine((x) => !["__proto__", "constructor", "prototype"].includes(x));
const day = z.number().int().min(1).max(11200);
const quantity = z.number().int().min(0).max(10000);
const amount = z.object({ itemId: id, quantity: quantity.min(1) });
const node = z.object({
  id,
  kind: z.enum([
    "purchase",
    "inventory",
    "plant",
    "process",
    "reserve",
    "delivery",
    "consume",
    "sale",
  ]),
  label: z.string().max(200),
  labelMode: z.enum(["auto", "manual"]).optional(),
  position: z.object({
    x: z.number().min(-100000).max(100000),
    y: z.number().min(-100000).max(100000),
  }),
  quantity,
  startDay: day,
  repeat: z.boolean(),
  autoBuy: z.boolean(),
  priority: z.number().int().min(0).max(100),
  itemId: id.optional(),
  cropId: id.optional(),
  recipeId: id.optional(),
  resourceId: id.optional(),
  machineId: id.optional(),
  amountMode: z.enum(["auto", "manual"]).optional(),
  dateMode: z.enum(["auto", "manual"]).optional(),
  machineCount: z.number().int().min(1).max(10000).optional(),
  endDay: day.optional(),
  dueDay: day.optional(),
  requirements: z.array(amount).max(100).optional(),
  sourceId: id.optional(),
  remainingDays: z.number().int().min(0).max(112).optional(),
  needsConfirmation: z.boolean().optional(),
  seasonProtection: z.boolean().optional(),
  farmlandSelection: z.object({shapeId:z.string().max(150),cells:z.array(z.string().regex(/^\d+,\d+$/)).max(10000)}).optional(),
});
const schema = z.object({
  version: z.literal(1),
  planningMode: z.literal("intent").optional(),
  name: z.string().max(150),
  startDay: day,
  days: z.number().int().min(1).max(112),
  initialCash: z.number().min(0).max(1e12),
  quality: z.enum(["normal", "copper", "silver", "gold", "brand"]),
  settlementDays: z.number().int().min(0).max(7),
  plots: z
    .array(
      z.object({ id, label: z.string().max(120), capacity: quantity.min(1) }),
    )
    .max(50),
  machines: z
    .array(
      z.object({
        id,
        label: z.string().max(120),
        machineId: id,
        count: quantity.min(1).max(100),
        capacity: quantity.min(1).max(100),
      }),
    )
    .max(50),
  nodes: z.array(node).max(200),
  edges: z.array(z.object({ id, source: id, target: id })).max(500),
});
export function parsePlan(raw: string): WorkflowPlan {
  if (raw.length > 2_000_000) throw new Error("计划文件过大（最多 2 MB）");
  let plan: WorkflowPlan;
  try {
    plan = schema.parse(JSON.parse(raw));
  } catch {
    throw new Error(
      "计划格式无效：请导入本站导出的版本 1 计划，检查日期、数量和资源上限。",
    );
  }
  const unique = (ids: string[]) => new Set(ids).size === ids.length;
  if (
    !unique(plan.nodes.map((n) => n.id)) ||
    !unique(plan.edges.map((e) => e.id)) ||
    !unique([...plan.plots, ...plan.machines].map((r) => r.id))
  )
    throw new Error("计划包含重复 ID");
  if (plan.machines.reduce((n, m) => n + m.count * m.capacity, 0) > 500)
    throw new Error("最多同时安排 500 批加工");
  const ids = new Set(plan.nodes.map((n) => n.id));
  const pairs = new Set<string>();
  for (const e of plan.edges) {
    const key = JSON.stringify([e.source, e.target]);
    if (
      !ids.has(e.source) ||
      !ids.has(e.target) ||
      e.source === e.target ||
      pairs.has(key)
    )
      throw new Error("连线引用无效或重复");
    pairs.add(key);
  }
  const active = new Set<string>(),
    done = new Set<string>();
  const visit = (id: string) => {
    if (active.has(id))
      throw new Error("流程不能形成环路；请使用节点的重复开关");
    if (done.has(id)) return;
    active.add(id);
    for (const e of plan.edges.filter((e) => e.source === id)) visit(e.target);
    active.delete(id);
    done.add(id);
  };
  for (const n of plan.nodes) {
    visit(n.id);
    if (n.quantity === 0 && n.kind !== "sale")
      throw new Error("非出售节点的数量必须大于零");
    if (n.endDay !== undefined && n.endDay < n.startDay)
      throw new Error("结束日期不能早于开始日期");
  }
  if (!plan.planningMode) {
    plan = {
      ...plan,
      planningMode: "intent",
      nodes: plan.nodes.map((n) => {
        const machine = plan.machines.find((m) => m.id === n.resourceId);
        return {
          ...n,
          amountMode: n.kind === "sale" && n.quantity === 0 ? "auto" : "manual",
          dateMode: "manual",
          ...(n.kind === "process" && machine
            ? {
                machineCount: machine.count,
                machineId: machine.machineId,
              }
            : {}),
        };
      }),
    };
  }
  return plan;
}
