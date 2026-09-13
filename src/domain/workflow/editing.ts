import type { Entity } from "../../data/types";
import type {
  NodeKind,
  WorkflowPlan,
  WorkflowNode,
  SimulationResult,
} from "./types";
import { newNode, uid, parsePlan } from "../workflowEditor";
import { canConnectDraft, resolveIntent } from "./intent";
import { canConnect, outputItems, stringArray } from "./graph";
import { seedAvailability } from "../seedAvailability";
import { seasonAt, yearAt } from "./date";

export type AddAnchor = {
  nodeId?: string;
  side?: "input" | "output";
  edgeId?: string;
};
export function addConnectedNode(
  plan: WorkflowPlan,
  _entities: Entity[],
  kind: NodeKind,
  position: { x: number; y: number },
  anchor: AddAnchor,
) {
  if (plan.nodes.length >= 200) throw new Error("每份计划最多 200 个节点");
  const added = { ...newNode(kind, plan.startDay), position };
  let nodes = [...plan.nodes, added],
    edges = [...plan.edges];
  const edge = anchor.edgeId
    ? edges.find((e) => e.id === anchor.edgeId)
    : undefined;
  if (anchor.edgeId && !edge) throw new Error("连线已改变，请重新选择");
  const from =
    edge?.source ?? (anchor.side === "output" ? anchor.nodeId : undefined);
  const to =
    edge?.target ?? (anchor.side === "input" ? anchor.nodeId : undefined);
  if (edge) {
    edges = edges.filter((e) => e.id !== edge.id);
    // The inserted output becomes the downstream input. Dates/amounts stay as chosen.
    nodes = nodes.map((n) =>
      n.id === to && ["sale", "consume"].includes(n.kind)
        ? { ...n, itemId: undefined }
        : n,
    );
  }
  for (const [source, target] of [
    [from, added.id],
    [added.id, to],
  ]) {
    if (!source || !target) continue;
    if (!canConnectDraft(nodes, edges, source, target))
      throw new Error("这种节点不能放在这里");
    edges.push({ id: uid(), source, target });
  }
  return {
    plan: parsePlan(JSON.stringify({ ...plan, nodes, edges })),
    addedId: added.id,
  };
}

export function demandRows(
  node: WorkflowNode,
  result: SimulationResult,
  day: number,
) {
  return (node.requirements ?? []).map((a) => {
    const events = result.events
      .filter(
        (e) =>
          e.nodeId === node.id && e.kind === "reserve" && e.itemId === a.itemId,
      )
      .sort((a, b) => a.day - b.day);
    const held = events
      .filter((e) => e.day <= day)
      .reduce((s, e) => s + (e.quantity ?? 0), 0);
    const planned = events.reduce((s, e) => s + (e.quantity ?? 0), 0);
    let sum = 0,
      readyDay: number | undefined;
    for (const e of events) {
      sum += e.quantity ?? 0;
      if (sum >= a.quantity) {
        readyDay = e.day;
        break;
      }
    }
    return {
      ...a,
      held: Math.min(held, a.quantity),
      planned: Math.min(planned, a.quantity),
      shortage: Math.max(0, a.quantity - planned),
      readyDay,
    };
  });
}

/** Generate only the missing part, re-simulating once at the caller after one atomic edit. */
export function prepareDemand(
  plan: WorkflowPlan,
  entities: Entity[],
  targetId: string,
  result: SimulationResult,
  origin: { x: number; y: number },
) {
  const target = plan.nodes.find((n) => n.id === targetId);
  if (!target || !["reserve", "delivery"].includes(target.kind))
    throw new Error("请选择留货或交付节点");
  let nodes = [...plan.nodes],
    edges = [...plan.edges],
    index = 0;
  const unresolved: string[] = [];
  const catalog = new Map(entities.map((e) => [e.id, e]));
  const resolved =
    result.intent?.resolvedNodes ?? resolveIntent(plan, entities).nodes;
  const pendingInputs = (id: string, seen = new Set<string>()): boolean => {
    if (seen.has(id)) return false;
    seen.add(id);
    return (
      !!nodes.find((n) => n.id === id)?.needsConfirmation ||
      edges
        .filter((e) => e.target === id)
        .some((e) => pendingInputs(e.source, seen))
    );
  };
  const create = (
    kind: NodeKind,
    props: Partial<WorkflowNode>,
    to: string,
    depth: number,
  ) => {
    if (nodes.length >= 200)
      throw new Error("生成后将超过 200 个节点，请分批安排");
    const node = {
      ...newNode(kind, plan.startDay),
      ...props,
      position: { x: origin.x - depth * 310, y: origin.y + index++ * 110 },
    };
    nodes.push(node);
    edges.push({ id: uid(), source: node.id, target: to });
    return node;
  };
  const supply = (
    itemId: string,
    quantity: number,
    to: string,
    seen: Set<string>,
    depth: number,
  ) => {
    if (!quantity) return;
    const pending = edges.some(
      (e) =>
        e.target === to &&
        nodes.some(
          (n) =>
            n.id === e.source &&
            outputItems(
              resolved.find((r) => r.id === n.id) ?? n,
              entities,
            ).includes(itemId) &&
            pendingInputs(n.id),
        ),
    );
    if (pending) {
      unresolved.push(catalog.get(itemId)?.name.zh_hans ?? itemId);
      return;
    }
    const candidates = resolved.filter(
      (n) =>
        outputItems(n, entities).includes(itemId) &&
        canConnect(nodes, edges, n.id, to, entities),
    );
    // Only use unallocated surplus; don't silently steal another delivery's stock.
    for (const source of candidates) {
      const projection = result.intent?.nodes[source.id];
      const output = ["purchase", "inventory"].includes(source.kind)
        ? projection?.quantity
        : projection?.outputQuantity;
      const committed = plan.edges
        .filter((e) => e.source === source.id)
        .filter((e) => {
          const target = plan.nodes.find((n) => n.id === e.target);
          return !(target?.kind === "sale" && target.amountMode !== "manual");
        })
        .reduce(
          (s, e) =>
            s +
            (result.intent?.edgeTransfers[e.id] ?? [])
              .filter((a) => a.itemId === itemId)
              .reduce((a, b) => a + b.quantity, 0),
          0,
        );
      const surplus = Math.max(0, (output ?? 0) - committed);
      if (!surplus) continue;
      edges.push({ id: uid(), source: source.id, target: to });
      quantity = Math.max(0, quantity - surplus);
      if (!quantity) return;
    }
    const item = catalog.get(itemId);
    if (!item) throw new Error("需求物品已不在目录中");
    if (seen.has(itemId) || depth > 8) {
      unresolved.push(item.name.zh_hans);
      create(
        "inventory",
        {
          itemId,
          quantity,
          needsConfirmation: true,
          label: `待确认已有 ${item.name.zh_hans}`,
          labelMode: "manual",
        },
        to,
        depth,
      );
      return;
    }
    const nextSeen = new Set([...seen, itemId]);
    const crops = entities.filter(
      (e) =>
        e.kind === "crops" &&
        stringArray(e.harvest_item_ids).includes(itemId) &&
        stringArray(e.seasons).includes(seasonAt(plan.startDay)),
    );
    if (
      crops.length === 1 &&
      Number(crops[0].harvest_quantity) > 0 &&
      stringArray(crops[0].seed_item_ids).length
    ) {
      const crop = crops[0],
        count = Math.ceil(quantity / Number(crop.harvest_quantity));
      const plant = create(
        "plant",
        {
          cropId: crop.id,
          quantity: count,
          amountMode: "manual",
          autoBuy: true,
        },
        to,
        depth,
      );
      supply(
        stringArray(crop.seed_item_ids)[0],
        count,
        plant.id,
        nextSeen,
        depth + 1,
      );
      return;
    }
    const recipes = entities.filter(
      (e) =>
        e.kind === "processes" &&
        (e.output as { item_id: string })?.item_id === itemId,
    );
    if (recipes.length === 1) {
      const recipe = recipes[0],
        yieldCount = Number((recipe.output as { quantity: number }).quantity);
      const inputs = (recipe.inputs ?? []) as {
        item_id: string;
        quantity: number;
      }[];
      if (yieldCount > 0 && inputs.length) {
        const count = Math.ceil(quantity / yieldCount),
          process = create(
            "process",
            { recipeId: recipe.id, quantity: count, amountMode: "manual" },
            to,
            depth,
          );
        inputs.forEach((a) =>
          supply(
            a.item_id,
            a.quantity * count,
            process.id,
            nextSeen,
            depth + 1,
          ),
        );
        return;
      }
    }
    const availability = seedAvailability(
      { ...item, seed_item_ids: [itemId] },
      entities,
      yearAt(plan.startDay),
      seasonAt(plan.startDay),
    );
    if (
      typeof item.buy_price === "number" &&
      item.buy_price >= 0 &&
      availability.available
    )
      create("purchase", { itemId, quantity }, to, depth);
    else {
      unresolved.push(item.name.zh_hans);
      create(
        "inventory",
        {
          itemId,
          quantity,
          needsConfirmation: true,
          label: `待准备 ${item.name.zh_hans}`,
          labelMode: "manual",
        },
        to,
        depth,
      );
    }
  };
  for (const row of demandRows(target, result, plan.startDay))
    supply(row.itemId, row.shortage, targetId, new Set(), 0);
  return {
    plan: parsePlan(JSON.stringify({ ...plan, nodes, edges })),
    unresolved,
  };
}
