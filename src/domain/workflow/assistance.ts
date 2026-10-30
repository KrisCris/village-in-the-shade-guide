import type { Entity } from "../../data/types";
import { newNode, parsePlan, uid } from "../workflowEditor";
import { seedAvailability } from "../seedAvailability";
import { qualityPrice } from "../quality";
import { autoAmount, autoDate, resolveIntent } from "./intent";
import { canConnect, outputItems, stringArray } from "./graph";
import { formatDay, seasonAt, yearAt } from "./date";
import { bearingLabel } from "./catalog";
import type { NodeKind, SimulationResult, WorkflowNode, WorkflowPlan } from "./types";
import { tr } from '../../i18n/active';

export type AssistanceAction = {
  key: string;
  label: string;
  detail: string;
  kind: NodeKind;
  sourceId: string;
  targetId?: string;
  insertBefore?: string;
  create?: Partial<WorkflowNode>;
  valueDelta?: number;
};
export type IngredientNeed = {
  itemId: string; name: string; perBatch: number; received: number;
  shortage: number; connected: boolean; actions: AssistanceAction[];
};
export type WorkflowAssistance = { next: AssistanceAction[]; inputs: IngredientNeed[] };

/** Explicit recipe edits can invalidate an equipment choice, but never its count. */
export function updateWorkflowNode(previous: WorkflowNode, next: WorkflowNode, entities: Entity[]): WorkflowNode {
  if (previous.recipeId !== next.recipeId && next.machineId && next.recipeId) {
    const recipe = entities.find(e => e.kind === "processes" && e.id === next.recipeId);
    if (recipe && !stringArray(recipe.machine_ids).includes(next.machineId))
      return { ...next, machineId: undefined };
  }
  return next;
}

/** Advice is read-only. No purchase, allocation or graph change occurs until an action is chosen. */
export function getWorkflowAssistance(plan: WorkflowPlan, entities: Entity[], nodeId: string, result?: SimulationResult): WorkflowAssistance {
  const nodes = resolveIntent(plan, entities).nodes;
  const n = nodes.find(n => n.id === nodeId);
  const assistance: WorkflowAssistance = { next: [], inputs: [] };
  if (!n) return assistance;
  const name = (id: string) => entities.find(e => e.id === id)?.name.zh_hans ?? id;
  const outputs = outputItems(n, entities);
  const outgoing = plan.edges.filter(e => e.source === n.id);
  const ordinary = outgoing.map(e => nodes.find(n => n.id === e.target)!)
    .filter(n => !["reserve", "delivery"].includes(n.kind));
  const soleSale = ordinary.length === 1 ? plan.nodes.find(n => n.id === ordinary[0].id) : undefined;
  const insertBefore = soleSale?.kind === "sale" && !soleSale.itemId && autoAmount(soleSale) && autoDate(soleSale)
    && plan.edges.filter(e => e.target === soleSale.id).length === 1 ? soleSale.id : undefined;
  const canExtend = ordinary.length === 0 || !!insertBefore;
  const suffix = insertBefore ? tr(' · 接在现有出售前') : tr(' · 自动数量与日期');
  if (outputs.length && canExtend) {
    for (const entity of entities) {
      if (entity.kind === "crops" && stringArray(entity.seed_item_ids).some(id => outputs.includes(id))) {
        assistance.next.push({ key: `plant:${entity.id}`, kind: "plant", sourceId: n.id, insertBefore,
          label: tr('种植 {name}', { name: entity.name.zh_hans }), detail: `${tr('生长 {days} 天', { days: entity.growth_days ?? tr('未知') })}${entity.perennial ? ` · ${bearingLabel(entity.perennial)}` : ""}${suffix}`, create: { cropId: entity.id } });
      }
      if (entity.kind === "processes") {
        const knownMachine = entities.some(machine => machine.kind === "machines"
          && stringArray(entity.machine_ids).includes(machine.id)
          && typeof machine.capacity === "number" && Number.isSafeInteger(machine.capacity) && machine.capacity > 0);
        if (!knownMachine || typeof entity.duration_minutes !== "number" || !Number.isFinite(entity.duration_minutes) || entity.duration_minutes < 0) continue;
        const inputs = entity.inputs as { item_id: string; quantity: number }[] | undefined;
        if (!Array.isArray(inputs) || inputs.some(a => !Number.isSafeInteger(a.quantity) || a.quantity <= 0) || !inputs.some(a => outputs.includes(a.item_id))) continue;
        const output = entity.output as { item_id?: string; quantity?: number } | undefined;
        if (!output?.item_id || !Number.isSafeInteger(output.quantity) || output.quantity! <= 0) continue;
        const days = typeof entity.duration_minutes === "number" ? Math.max(1, Math.ceil(entity.duration_minutes / 1440)) : tr('未知');
        const salePrice = (id: string) => {
          const item = entities.find(e => e.kind === "items" && e.id === id);
          return qualityPrice(item?.sell_price as number, !!item?.quality_eligible, plan.quality)?.value;
        };
        const rawPrices = inputs.map(a => salePrice(a.item_id)), outputPrice = salePrice(output.item_id);
        const valueDelta = outputPrice !== undefined && typeof output.quantity === "number" && rawPrices.every(p => p !== undefined)
          ? outputPrice * output.quantity - inputs.reduce((sum, a, i) => sum + rawPrices[i]! * a.quantity, 0) : undefined;
        const valueNote = valueDelta === undefined ? tr(' · 产值差额待核实') : tr(' · 较原料直接出售 {sign}{delta}/批', { sign: valueDelta >= 0 ? "+" : "", delta: valueDelta });
        assistance.next.push({ key: `process:${entity.id}`, kind: "process", sourceId: n.id, insertBefore,
          label: tr('加工 {name}', { name: entity.name.zh_hans }), detail: tr('{inputs} → {name} ×{count} · {days} 天{note}{suffix}', { inputs: inputs.map(a => `${name(a.item_id)} ×${a.quantity}`).join(" + "), name: name(output.item_id), count: output.quantity ?? "?", days, note: valueNote, suffix }), valueDelta,
          create: { recipeId: entity.id } });
      }
    }
    if (!ordinary.length && outputs.length === 1) {
      const item = entities.find(e => e.kind === "items" && e.id === outputs[0]);
      if (typeof item?.sell_price === "number" && Number.isFinite(item.sell_price) && item.sell_price >= 0)
        assistance.next.unshift({ key: `sale:${item.id}`, kind: "sale", sourceId: n.id,
          label: tr('出售 {name}', { name: item.name.zh_hans }), detail: tr('出货日期与数量跟随上游，留货先分配'), create: {} });
    }
  }
  // Show known value gains before losses; this is not a whole-plan profit ranking.
  const processes = assistance.next.filter(a => a.kind === "process").sort((a, b) =>
    a.valueDelta === undefined ? (b.valueDelta === undefined ? 0 : 1)
      : b.valueDelta === undefined ? -1 : b.valueDelta - a.valueDelta);
  assistance.next = [...assistance.next.filter(a => a.kind !== "process"), ...processes];
  for (const target of nodes) {
    if (!["reserve", "delivery"].includes(target.kind) || !canConnect(nodes, plan.edges, n.id, target.id, entities)) continue;
    const matching = (target.requirements ?? []).filter(a => outputs.includes(a.itemId));
    assistance.next.unshift({ key: `target:${target.id}`, kind: target.kind, sourceId: n.id, targetId: target.id,
      label: tr('留给 {label}', { label: target.label }), detail: matching.map(a => `${name(a.itemId)} ×${a.quantity}`).join(tr('、')) + tr(' · 连接后优先留货') });
  }
  // Existing in-progress batches have already consumed their ingredients in the game.
  if (n.kind !== "process" || n.remainingDays !== undefined) return assistance;
  const recipe = entities.find(e => e.kind === "processes" && e.id === n.recipeId);
  const raw = recipe?.inputs as { item_id: string; quantity: number }[] | undefined;
  if (!Array.isArray(raw) || raw.some(a => !Number.isSafeInteger(a.quantity) || a.quantity <= 0)) return assistance;
  const requirements = new Map<string, number>();
  raw.forEach(a => requirements.set(a.item_id, (requirements.get(a.item_id) ?? 0) + a.quantity));
  const incoming = plan.edges.filter(e => e.target === n.id);
  const received = (id: string) => incoming.reduce((sum, edge) => sum + (result?.intent?.edgeTransfers[edge.id] ?? [])
    .filter(a => a.itemId === id).reduce((s, a) => s + a.quantity, 0), 0);
  const batches = autoAmount(n) ? Math.max(0, ...[...requirements].map(([id, q]) => Math.floor(received(id) / q))) : n.quantity;
  const arrivals = incoming.flatMap(edge => result?.intent?.edgeSchedule[edge.id]?.map(a => a.day) ?? []);
  const day = Math.max(plan.startDay, autoDate(n) ? plan.startDay : n.startDay, arrivals.length ? Math.min(...arrivals) : plan.startDay);
  for (const [itemId, perBatch] of requirements) {
    const connected = incoming.some(edge => outputItems(nodes.find(n => n.id === edge.source)!, entities).includes(itemId));
    const shortage = Math.max(0, batches * perBatch - received(itemId));
    if (connected && !shortage) continue;
    const need: IngredientNeed = { itemId, name: name(itemId), perBatch, received: received(itemId), shortage, connected, actions: [] };
    for (const source of nodes) {
      if (!outputItems(source, entities).includes(itemId) || !canConnect(nodes, plan.edges, source.id, n.id, entities)) continue;
      need.actions.push({ key: `source:${source.id}`, kind: source.kind, sourceId: source.id, targetId: n.id,
        label: tr('连接 {label}', { label: source.label }), detail: tr('使用计划中已有来源；实际分配量仍由上游与留货顺序决定') });
    }
    const quantity = shortage || perBatch;
    if (quantity <= 10000) {
      const item = entities.find(e => e.kind === "items" && e.id === itemId);
      const availability = item ? seedAvailability({ ...item, seed_item_ids: [itemId] }, entities, yearAt(day), seasonAt(day)) : undefined;
      if (typeof item?.buy_price === "number" && Number.isFinite(item.buy_price) && item.buy_price >= 0 && availability?.available)
        need.actions.push({ key: `buy:${itemId}`, kind: "purchase", sourceId: n.id,
          label: tr('买入 {name} ×{quantity}', { name: name(itemId), quantity }), detail: tr('{date} · 支出 {amount}{conditions}', { date: formatDay(day), amount: quantity * item.buy_price, conditions: availability.conditions.length ? " · " + availability.conditions.join(tr('；')) : "" }),
          create: { itemId, quantity, startDay: day } });
      need.actions.push({ key: `stock:${itemId}`, kind: "inventory", sourceId: n.id,
        label: tr('使用已有 {name} ×{quantity}', { name: name(itemId), quantity }), detail: tr('{day} 可用 · 不计历史购买成本', { day: formatDay(day) }), create: { itemId, quantity, startDay: day } });
    }
    assistance.inputs.push(need);
  }
  return assistance;
}

export function applyWorkflowAssistance(plan: WorkflowPlan, entities: Entity[], nodeId: string, key: string, result?: SimulationResult) {
  const advice = getWorkflowAssistance(plan, entities, nodeId, result);
  const action = [...advice.next, ...advice.inputs.flatMap(i => i.actions)].find(a => a.key === key);
  if (!action) throw new Error(tr('这项建议已不适用于当前流程，请重新选择。'));
  let nodes = [...plan.nodes], edges = [...plan.edges];
  let focusId = action.targetId ?? nodeId;
  if (action.targetId) {
    edges.push({ id: uid(), source: action.sourceId, target: action.targetId });
  } else {
    const source = nodes.find(n => n.id === action.sourceId)!;
    const upstream = action.kind === "purchase" || action.kind === "inventory";
    const position = { x: source.position.x + (upstream ? -340 : 340), y: source.position.y };
    while (nodes.some(n => Math.abs(n.position.x - position.x) < 300 && Math.abs(n.position.y - position.y) < 250)) position.y += 270;
    const added = { ...newNode(action.kind, source.startDay), ...action.create, position };
    // A seed with one crop needs no sticky manual crop choice; future seed edits can propagate.
    if (added.kind === "plant" && advice.next.filter(a => a.kind === "plant").length === 1) delete added.cropId;
    nodes.push(added);
    edges.push({ id: uid(), source: upstream ? added.id : source.id, target: upstream ? source.id : added.id });
    if (action.insertBefore) {
      edges = edges.filter(e => !(e.source === source.id && e.target === action.insertBefore));
      edges.push({ id: uid(), source: added.id, target: action.insertBefore });
    }
    focusId = upstream ? source.id : added.id;
  }
  const next = parsePlan(JSON.stringify({ ...plan, nodes, edges }));
  return { plan: next, focusId, message: tr('{label}：已更新节点与连线，可一次撤销。', { label: action.label }) };
}
