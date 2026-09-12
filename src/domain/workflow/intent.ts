import type { Entity } from "../../data/types";
import type { WorkflowNode, WorkflowPlan, WorkflowEdge } from "./types";
import { hasCycle, stringArray } from "./graph";
import { nodeLabels } from "../workflowEditor";

export const autoLabel = (n: WorkflowNode) =>
  n.labelMode === "auto" || (n.labelMode !== "manual" && n.label === nodeLabels[n.kind]);

export function canConnectDraft(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  source: string,
  target: string,
): boolean {
  const from = nodes.find((n) => n.id === source),
    to = nodes.find((n) => n.id === target);
  return (
    !!from &&
    !!to &&
    source !== target &&
    !["sale", "consume", "reserve", "delivery"].includes(from.kind) &&
    !["purchase", "inventory"].includes(to.kind) &&
    !edges.some((e) => e.source === source && e.target === target) &&
    !hasCycle(nodes, [...edges, { id: "candidate", source, target }])
  );
}

/** Resolve a fresh projection each time. Only explicitly chosen ids live in the saved plan. */
export function resolveIntent(plan: WorkflowPlan, entities: Entity[]) {
  const nodes = structuredClone(plan.nodes);
  const catalog = new Map(entities.map((e) => [e.id, e]));
  const outputItems = (n: WorkflowNode, _entities?: Entity[]): string[] => {
    if (n.kind === "purchase" || n.kind === "inventory")
      return n.itemId ? [n.itemId] : [];
    if (n.kind === "plant")
      return stringArray(catalog.get(n.cropId ?? "")?.harvest_item_ids);
    const out = catalog.get(n.recipeId ?? "")?.output as
      { item_id?: string } | undefined;
    return n.kind === "process" && out?.item_id ? [out.item_id] : [];
  };
  const inputItems = (n: WorkflowNode, _entities?: Entity[]): string[] => {
    if (n.kind === "plant")
      return stringArray(catalog.get(n.cropId ?? "")?.seed_item_ids);
    if (n.kind === "process")
      return (
        (catalog.get(n.recipeId ?? "")?.inputs ?? []) as { item_id: string }[]
      ).map((a) => a.item_id);
    if (n.kind === "reserve" || n.kind === "delivery")
      return (n.requirements ?? []).map((a) => a.itemId);
    return ["sale", "consume"].includes(n.kind) && n.itemId ? [n.itemId] : [];
  };
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const candidates = (n: WorkflowNode, editing = false): Entity[] => {
    const incoming = plan.edges
      .filter((e) => e.target === n.id)
      .map((e) => outputItems(byId.get(e.source)!, entities))
      .filter((a) => a.length);
    const outgoing = plan.edges
      .filter((e) => e.source === n.id)
      .filter((e) => {
        if (!editing) return true;
        const target = plan.nodes.find((n) => n.id === e.target)!;
        return !!(
          target.cropId ||
          target.recipeId ||
          target.itemId ||
          target.requirements?.length
        );
      })
      .map((e) => inputItems(byId.get(e.target)!, entities))
      .filter((a) => a.length);
    const kind =
      n.kind === "plant"
        ? "crops"
        : n.kind === "process"
          ? "processes"
          : "items";
    if (!incoming.length && !outgoing.length) return [];
    return entities.filter((e) => {
      if (e.kind !== kind) return false;
      const probe = { ...n, itemId: e.id, cropId: e.id, recipeId: e.id };
      const inputs = inputItems(probe, entities),
        outputs = outputItems(probe, entities);
      return (
        incoming.every((ids) => ids.some((id) => inputs.includes(id))) &&
        outgoing.every((ids) => ids.some((id) => outputs.includes(id)))
      );
    });
  };
  for (let pass = 0; pass < nodes.length; pass++) {
    let changed = false;
    for (const n of nodes) {
      if (["reserve", "delivery"].includes(n.kind)) continue;
      const field =
        n.kind === "plant"
          ? "cropId"
          : n.kind === "process"
            ? "recipeId"
            : "itemId";
      if (n[field]) continue;
      const choices = candidates(n);
      if (choices.length === 1) {
        n[field] = choices[0].id;
        changed = true;
      }
    }
    if (!changed) break;
  }
  const choices: Record<string, Entity[]> = Object.create(null);
  const notices: Record<string, string[]> = Object.create(null);
  for (const n of nodes) {
    choices[n.id] = candidates(n, true);
    notices[n.id] = [];
    if (autoLabel(n)) {
      const item = catalog.get(n.cropId ?? n.recipeId ?? n.itemId ?? "");
      n.label = item ? `${nodeLabels[n.kind]} ${item.name.zh_hans}` : nodeLabels[n.kind];
    }
  }
  for (const e of plan.edges) {
    const source = byId.get(e.source),
      target = byId.get(e.target);
    if (!source || !target) continue;
    const outputs = outputItems(source, entities),
      inputs = inputItems(target, entities);
    if (
      outputs.length &&
      inputs.length &&
      !outputs.some((id) => inputs.includes(id))
    )
      notices[target.id].push(
        `与「${source.label}」的物品不匹配，请调整选择或连线。`,
      );
  }
  return { nodes, choices, notices };
}
export const autoAmount = (n: WorkflowNode) =>
  n.amountMode !== "manual" || (n.kind === "sale" && n.quantity === 0);
export const autoDate = (n: WorkflowNode) => n.dateMode !== "manual";
export const cropSeeds = (crop: Entity | undefined) =>
  stringArray(crop?.seed_item_ids);
