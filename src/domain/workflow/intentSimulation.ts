import { parsePlan } from "../workflowEditor";
import type { Entity } from "../../data/types";
import { qualityPrice } from "../quality";
import { seedAvailability } from "../seedAvailability";
import { seasonAt, yearAt } from "./date";
import { hasCycle, stringArray } from "./graph";
import { autoAmount, autoDate, resolveIntent } from "./intent";
import type {
  Amount,
  PlanEvent,
  SimulationResult,
  StockRow,
  WorkflowNode,
  WorkflowPlan,
  NodeProjection,
  WorkInProgress,
} from "./types";

type Crop = {
  seeds: string[];
  item: string;
  growth: number;
  regrow: number;
  yield: number;
  seasons: string[];
};
type Recipe = {
  inputs: Amount[];
  item: string;
  yield: number;
  duration: number;
  capacity: number;
};
type Job = WorkInProgress & {
  kind: "plant" | "process";
  slots: number;
  regrow: number;
  lastDay: number;
  holding?: boolean;
};
const positive = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const priceValid = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;
const group = (rows: Amount[]): Amount[] => {
  const map = new Map<string, number>();
  for (const a of rows)
    map.set(a.itemId, (map.get(a.itemId) ?? 0) + a.quantity);
  return [...map].map(([itemId, quantity]) => ({ itemId, quantity }));
};

/** No ownership limits: resources are outputs; stock conservation and causal cash ordering are invariants. */
export function simulateIntentPlan(
  plan: WorkflowPlan,
  entities: Entity[],
): SimulationResult {
  try {plan=parsePlan(JSON.stringify(plan));} catch(error) {
    return {days:[],events:[],issues:[error instanceof Error?error.message:'计划格式无效'],income:0,spending:0,cash:0,pendingRevenue:0,stock:[],inProgress:[],demandProgress:Object.create(null)};
  }
  const resolved = resolveIntent(plan, entities),
    nodes = resolved.nodes;
  const periodEnd = plan.startDay + plan.days - 1;
  const result: SimulationResult = {
    days: [],
    events: [],
    issues: [],
    income: 0,
    spending: 0,
    cash: 0,
    pendingRevenue: 0,
    stock: [],
    inProgress: [],
    demandProgress: Object.create(null),
    intent: {
      resolvedNodes: nodes,
      nodes: Object.create(null),
      edgeTransfers: Object.create(null),
      edgeSchedule: Object.create(null),
      land: 0,
      startupFunds: 0,
      finalIncome: 0,
      finalSpending: 0,
      finalDelta: 0,
      finishDay: periodEnd,
      periodEnd,
      complete: true,
    },
  };
  const summary = result.intent!;
  if (hasCycle(nodes, plan.edges)) {
    result.issues.push("流程包含循环或失效连线，请修复后计算。");
    return result;
  }
  const catalog = new Map(entities.map((e) => [e.id, e])),
    byNode = new Map(nodes.map((n) => [n.id, n]));
  const supplies = new Map(nodes.map((n) => [n.id, new Map<string, number>()]));
  const inboxes = new Map(nodes.map((n) => [n.id, new Map<string, number>()]));
  const allocated = new Map(
    nodes.map((n) => [n.id, new Map<string, number>()]),
  );
  const outgoing = new Map(
    nodes.map((n) => [n.id, plan.edges.filter((e) => e.source === n.id)]),
  );
  const incoming = new Map(
    nodes.map((n) => [n.id, plan.edges.filter((e) => e.target === n.id)]),
  );
  const crops = new Map<string, Crop>(),
    recipes = new Map<string, Recipe>();
  const jobs: Job[] = [],
    receipts: Array<{
      day: number;
      nodeId: string;
      itemId: string;
      quantity: number;
      amount: number;
    }> = [];
  const disabled = new Set<string>(),
    seen = new Set<string>(),
    started = new Map<string, number>(),
    scale = new Map<string, number>(),
    initialized = new Set<string>();
  let day = plan.startDay,
    cash = 0,
    income = 0,
    spending = 0,
    minCash = 0,
    periodCaptured = false;
  const name = (id: string) => catalog.get(id)?.name.zh_hans ?? id;
  const projection = (n: WorkflowNode) => summary.nodes[n.id];
  const emit = (
    n: WorkflowNode,
    kind: PlanEvent["kind"],
    message: string,
    extra: Partial<PlanEvent> = {},
  ) => result.events.push({ day, nodeId: n.id, kind, message, ...extra });
  const notice = (
    n: WorkflowNode,
    message: string,
    status: NodeProjection["status"] = "waiting",
  ) => {
    const p = projection(n);
    if (!p.notices.includes(message)) p.notices.push(message);
    if (p.status !== "blocked" && p.status !== "draft") p.status = status;
  };
  const block = (
    n: WorkflowNode,
    message: string,
    status: NodeProjection["status"] = "blocked",
  ) => {
    notice(n, message, status);
    projection(n).status = status;
    disabled.add(n.id);
  };
  const warn = (n: WorkflowNode, message: string) => {
    notice(n, message, "blocked");
    const key = n.id + message;
    if (!seen.has(key)) {
      seen.add(key);
      result.issues.push(`${n.label}：${message}`);
      emit(n, "warning", message);
    }
  };
  const put = (buffer: Map<string, number>, itemId: string, quantity: number) =>
    buffer.set(itemId, (buffer.get(itemId) ?? 0) + quantity);
  const get = (n: WorkflowNode, id: string) => inboxes.get(n.id)!.get(id) ?? 0;
  const use = (n: WorkflowNode, id: string, q: number) =>
    inboxes.get(n.id)!.set(id, get(n, id) - q);
  const mark = (n: WorkflowNode, quantity: number, finishDay = day) => {
    const p = projection(n);
    p.firstDay ??= day;
    p.finishDay = Math.max(p.finishDay ?? day, finishDay);
    p.quantity += quantity;
    p.status = "scheduled";
  };
  const updateLand = () => {
    const land = jobs
      .filter((j) => j.kind === "plant")
      .reduce((s, j) => s + j.slots, 0);
    summary.land = Math.max(summary.land, land);
    return land;
  };
  const account = (delta: number) => {
    cash += delta;
    minCash = Math.min(minCash, cash);
  };
  const purchase = (
    n: WorkflowNode,
    itemId: string,
    quantity: number,
    replant = false,
  ) => {
    const item = catalog.get(itemId),
      price = item?.buy_price;
    if (!priceValid(price)) {
      warn(n, `${name(itemId)} 的买价未知，购买尚未计入。`);
      return false;
    }
    const availability = seedAvailability(
      { ...item!, seed_item_ids: [itemId] },
      entities,
      yearAt(day),
      seasonAt(day),
    );
    if (!availability.available) {
      warn(n, `${name(itemId)} 在当日没有已知商店供应。`);
      return false;
    }
    if (availability.conditions.length)
      notice(n, `购买条件需确认：${availability.conditions.join("；")}`);
    const amount = quantity * price;
    spending += amount;
    account(-amount);
    emit(
      n,
      "purchase",
      `${replant ? "续种补买" : "买入"} ${name(itemId)} ×${quantity} · ${amount}`,
      { itemId, quantity, amount, reason: replant ? "replant" : "initial" },
    );
    return true;
  };
  for (const n of nodes) {
    summary.nodes[n.id] = {
      status: "waiting",
      notices: [],
      quantity: 0,
      outputQuantity: 0,
      machines: 0,
      land: 0,
      reserved: 0,
      delivered: false,
    };
  }
  for (const n of nodes) {
    for (const message of resolved.notices[n.id]) block(n, message);
    if(n.needsConfirmation) block(n, '尚未确认取得这些物品；在库存节点确认准备完毕后才计入计划。', 'draft');
    if (
      ["purchase", "inventory", "sale", "consume"].includes(n.kind) &&
      !catalog.has(n.itemId ?? "")
    )
      block(n, "连接一个已选物品的节点，或手动选择物品。", "draft");
    if (n.kind === "plant") {
      const c = catalog.get(n.cropId ?? ""),
        outputs = stringArray(c?.harvest_item_ids),
        seeds = stringArray(c?.seed_item_ids),
        seasons = stringArray(c?.seasons);
      if (!c) {
        block(n, "连接种子来源以推算作物，或手动选择作物。", "draft");
        continue;
      }
      if (
        !positive(c.growth_days) ||
        !positive(c.harvest_quantity) ||
        outputs.length !== 1 ||
        !catalog.has(outputs[0]) ||
        !seeds.length ||
        !seasons.length ||
        (c.regrow_days != null &&
          c.regrow_days !== 0 &&
          !positive(c.regrow_days))
      ) {
        block(n, "生长时间、产量、种子或季节数据不完整。");
        continue;
      }
      crops.set(n.id, {
        seeds,
        item: outputs[0],
        growth: c.growth_days,
        regrow: Number(c.regrow_days ?? 0),
        yield: c.harvest_quantity,
        seasons,
      });
    }
    if (n.kind === "process") {
      const r = catalog.get(n.recipeId ?? ""),
        inputs = r?.inputs as
          { item_id: string; quantity: number }[] | undefined,
        output = r?.output as { item_id: string; quantity: number } | undefined;
      if (!r) {
        block(
          n,
          resolved.choices[n.id].length > 1
            ? `有 ${resolved.choices[n.id].length} 种兼容配方，请选择加工方式。`
            : "连接原料后选择加工配方。",
          "draft",
        );
        continue;
      }
      if (
        !Array.isArray(inputs) ||
        !inputs.length ||
        inputs.some((a) => !catalog.has(a.item_id) || !positive(a.quantity)) ||
        !output ||
        !catalog.has(output.item_id) ||
        !positive(output.quantity) ||
        !priceValid(r.duration_minutes)
      ) {
        block(n, "配方投入、产出或加工时间数据不完整。");
        continue;
      }
      const machineIds = stringArray(r.machine_ids);
      const machineId = n.machineId ?? machineIds[0];
      projection(n).machineId = machineId;
      if (!machineId || !machineIds.includes(machineId)) {
        block(n, "所选机器不支持当前配方，请更改机器型号。");
        continue;
      }
      const machine = entities.find(e => e.kind === "machines" && e.id === machineId);
      if (!positive(machine?.capacity)) {
        block(n, "这台设备的游戏容量数据尚未核实，暂不能安排加工。");
        continue;
      }
      projection(n).machineCapacity = machine.capacity;
      recipes.set(n.id, {
        inputs: group(
          inputs.map((a) => ({ itemId: a.item_id, quantity: a.quantity })),
        ),
        item: output.item_id,
        yield: output.quantity,
        duration: Math.max(1, Math.ceil(r.duration_minutes / 1440)),
        capacity: machine.capacity,
      });
      projection(n).duration = recipes.get(n.id)!.duration;
    }
    if (n.kind === "reserve" || n.kind === "delivery") {
      const req = group(n.requirements ?? []);
      n.requirements = req;
      result.demandProgress[n.id] = req.map((a) => ({ ...a, quantity: 0 }));
      if (!req.length) {
        block(n, "添加要留存的物品与数量。", "draft");
        continue;
      }
      if (!incoming.get(n.id)!.length)
        notice(n, "尚未安排来源，连接产物后自动留货。");
    }
  }
  const inputAmounts = (n: WorkflowNode): Amount[] => {
    if (n.kind === "plant")
      return (crops.get(n.id)?.seeds ?? []).map((itemId) => ({
        itemId,
        quantity: 1,
      }));
    if (n.kind === "process") return recipes.get(n.id)?.inputs ?? [];
    if (n.kind === "reserve" || n.kind === "delivery")
      return n.requirements ?? [];
    return n.itemId ? [{ itemId: n.itemId, quantity: 1 }] : [];
  };
  const heldAndUsed = (n: WorkflowNode, item: string) =>
    allocated.get(n.id)!.get(item) ?? 0;
  const desired = (n: WorkflowNode, item: string) => {
    if (disabled.has(n.id)) return 0;
    const a = inputAmounts(n).find((a) => a.itemId === item);
    if (!a) return 0;
    if (n.kind === "reserve" || n.kind === "delivery")
      return Math.max(0, a.quantity - heldAndUsed(n, item));
    if (n.kind === "plant") {
      if (started.has(n.id) && !n.repeat) return 0;
      // Alternative seed ids share one planting target.
      const held = (crops.get(n.id)?.seeds ?? []).reduce(
        (s, id) => s + get(n, id),
        0,
      );
      if (n.repeat && scale.has(n.id))
        return Math.max(0, scale.get(n.id)! - held);
      if (!autoAmount(n))
        return Math.max(0, n.quantity - held - (started.get(n.id) ?? 0));
    }
    return autoAmount(n)
      ? Infinity
      : Math.max(0, n.quantity * a.quantity - heldAndUsed(n, item));
  };
  const rank = (n: WorkflowNode) =>
    n.kind === "reserve" || n.kind === "delivery" ? 0 : !autoAmount(n) ? 1 : 2;
  const distribute = () => {
    for (const source of nodes) {
      const buffer = supplies.get(source.id)!;
      for (const [itemId, available] of buffer) {
        if (!available) continue;
        const edges = outgoing
          .get(source.id)!
          .filter((e) => desired(byNode.get(e.target)!, itemId) > 0)
          .sort(
            (a, b) =>
              rank(byNode.get(a.target)!) - rank(byNode.get(b.target)!) ||
              byNode.get(a.target)!.priority - byNode.get(b.target)!.priority,
          );
        let left = available;
        for (const edge of edges) {
          const n = byNode.get(edge.target)!;
          if (
            rank(n) === 2 &&
            edges.some(
              (e) =>
                e.target !== n.id &&
                rank(byNode.get(e.target)!) === 2 &&
                byNode.get(e.target)!.priority === n.priority,
            )
          ) {
            notice(
              n,
              `「${source.label}」的${name(itemId)}有多个“剩余全部”去向：设置固定数量或不同分配顺序。`,
              "blocked",
            );
            continue;
          }
          const quantity = Math.min(left, desired(n, itemId));
          if (quantity <= 0) continue;
          put(inboxes.get(n.id)!, itemId, quantity);
          put(allocated.get(n.id)!, itemId, quantity);
          summary.edgeTransfers[edge.id] = group([
            ...(summary.edgeTransfers[edge.id] ?? []),
            { itemId, quantity },
          ]);
          (summary.edgeSchedule[edge.id] ??= []).push({
            day,
            itemId,
            quantity,
          });
          left -= quantity;
          if (!left) break;
        }
        buffer.set(itemId, left);
      }
    }
  };
  const stock = (): StockRow[] =>
    nodes.flatMap((n) => {
      const reserved =
        (n.kind === "reserve" || n.kind === "delivery") &&
        day >= (autoDate(n) ? plan.startDay : n.startDay);
      return [
        ...[...supplies.get(n.id)!]
          .filter(([, q]) => q > 0)
          .map(([itemId, quantity]) => ({
            nodeId: n.id,
            itemId,
            quantity,
            reserved: false,
            state: "usable" as const,
          })),
        ...[...inboxes.get(n.id)!]
          .filter(([, q]) => q > 0)
          .map(([itemId, quantity]) => ({
            nodeId: n.id,
            itemId,
            quantity,
            reserved,
            state: reserved ? ("reserved" as const) : ("waiting" as const),
          })),
      ];
    });
  const work = (): WorkInProgress[] =>
    jobs
      .filter((j) => !j.holding)
      .map(({ nodeId, finishDay, itemId, quantity, kind }) => ({
        nodeId,
        finishDay,
        itemId,
        quantity,
        kind,
      }));
  const startJob = (
    n: WorkflowNode,
    kind: "plant" | "process",
    quantity: number,
    duration: number,
    existing = false,
  ) => {
    const c = crops.get(n.id),
      r = recipes.get(n.id),
      itemId = kind === "plant" ? c!.item : r!.item,
      yieldCount = kind === "plant" ? c!.yield : r!.yield;
    const finishDay = day + duration,
      lastDay = n.seasonProtection ? Math.max(periodEnd, finishDay) : Math.ceil(day / 28) * 28;
    jobs.push({
      nodeId: n.id,
      kind,
      finishDay,
      itemId,
      quantity: quantity * yieldCount,
      slots: quantity,
      regrow: c?.regrow ?? 0,
      lastDay,
    });
    mark(n, quantity, finishDay);
    started.set(n.id, (started.get(n.id) ?? 0) + quantity);
    if (kind === "plant") {
      scale.set(n.id, quantity);
      projection(n).land = Math.max(projection(n).land, quantity);
      updateLand();
    } else {
      const busy = jobs
        .filter((j) => j.nodeId === n.id)
        .reduce((s, j) => s + j.slots, 0);
      projection(n).machines = Math.max(
        projection(n).machines,
        Math.ceil(busy / r!.capacity),
      );
      const raw = r!.inputs.map((a) => {
        const e = catalog.get(a.itemId);
        return qualityPrice(
          e?.sell_price as number,
          !!e?.quality_eligible,
          plan.quality,
        )?.value;
      });
      const output = catalog.get(itemId),
        value = qualityPrice(
          output?.sell_price as number,
          !!output?.quality_eligible,
          plan.quality,
        )?.value;
      if (raw.every(priceValid))
        projection(n).rawValue =
          (projection(n).rawValue ?? 0) +
          raw.reduce((s, v, i) => s + v! * r!.inputs[i].quantity, 0) * quantity;
      if (priceValid(value))
        projection(n).processedValue =
          (projection(n).processedValue ?? 0) + value * quantity * yieldCount;
    }
    if (!existing)
      emit(
        n,
        kind,
        kind === "plant"
          ? `播种 ${quantity} 格 · ${duration} 天后收获`
          : `投料 ${r!.inputs.map((a) => `${name(a.itemId)} ×${a.quantity * quantity}`).join(" + ")} · ${quantity} 批`,
        { itemId: kind === "plant" ? c!.seeds[0] : itemId, quantity },
      );
  };
  // Daily frontiers: all roots arrive first, allocations precede consuming nodes, jobs always finish on a later day.
  let iterations = 0;
  while (iterations++ < 20000) {
    const eventStart = result.events.length,
      incomeBefore = income,
      spendingBefore = spending;
    for (let i = receipts.length - 1; i >= 0; i--)
      if (receipts[i].day <= day) {
        const r = receipts.splice(i, 1)[0];
        income += r.amount;
        account(r.amount);
        emit(byNode.get(r.nodeId)!, "receipt", `出货款到账 ${r.amount}`, r);
      }
    for (let i = jobs.length - 1; i >= 0; i--)
      if (jobs[i].finishDay <= day) {
        const j = jobs.splice(i, 1)[0],
          n = byNode.get(j.nodeId)!;
        if (j.holding) continue;
        put(supplies.get(n.id)!, j.itemId, j.quantity);
        projection(n).outputQuantity += j.quantity;
        emit(
          n,
          j.kind === "plant" ? "harvest" : "complete",
          `${j.kind === "plant" ? "收获" : "加工完成"} ${name(j.itemId)} ×${j.quantity}`,
          { itemId: j.itemId, quantity: j.quantity },
        );
        if (j.kind === "plant" && j.regrow) {
          if (day + j.regrow <= j.lastDay) {
            jobs.push({ ...j, finishDay: day + j.regrow });
            projection(n).finishDay = day + j.regrow;
          } else jobs.push({ ...j, finishDay: j.lastDay + 1, holding: true });
        }
      }
    for (const n of nodes) {
      if (disabled.has(n.id)) continue;
      const earliest = autoDate(n)
        ? plan.startDay
        : Math.max(plan.startDay, n.startDay);
      if (
        n.remainingDays !== undefined &&
        !initialized.has(n.id) &&
        ["plant", "process"].includes(n.kind)
      ) {
        if (day !== plan.startDay) continue;
        const c = crops.get(n.id);
        if (
          c && !n.seasonProtection &&
          (!c.seasons.includes(seasonAt(day)) ||
            day + n.remainingDays > Math.ceil(day / 28) * 28)
        ) {
          block(n, "已有作物无法在本季完成收获。");
          continue;
        }
        initialized.add(n.id);
        if (n.kind === "process")
          for (const input of recipes.get(n.id)!.inputs)
            put(
              allocated.get(n.id)!,
              input.itemId,
              input.quantity * n.quantity,
            );
        startJob(
          n,
          n.kind as "plant" | "process",
          n.quantity,
          n.remainingDays,
          true,
        );
        continue;
      }
      if (day < earliest) continue;
      if (
        n.kind === "purchase" &&
        day <= Math.min(periodEnd, n.endDay ?? periodEnd) &&
        (n.repeat || day === earliest)
      ) {
        if (purchase(n, n.itemId!, n.quantity)) {
          put(supplies.get(n.id)!, n.itemId!, n.quantity);
          mark(n, n.quantity);
          projection(n).outputQuantity += n.quantity;
        }
      }
      if (n.kind === "inventory" && day <= periodEnd && day === earliest) {
        put(supplies.get(n.id)!, n.itemId!, n.quantity);
        mark(n, n.quantity);
        projection(n).outputQuantity += n.quantity;
        emit(n, "inventory", `已有 ${name(n.itemId!)} ×${n.quantity}`, {
          itemId: n.itemId,
          quantity: n.quantity,
        });
      }
    }
    // Zero remaining days means available at the beginning of this day.
    for (let i = jobs.length - 1; i >= 0; i--)
      if (jobs[i].finishDay === day && !jobs[i].holding) {
        const j = jobs.splice(i, 1)[0],
          n = byNode.get(j.nodeId)!;
        put(supplies.get(n.id)!, j.itemId, j.quantity);
        projection(n).outputQuantity += j.quantity;
        emit(
          n,
          j.kind === "plant" ? "harvest" : "complete",
          `已有生产完成 ${name(j.itemId)} ×${j.quantity}`,
          { itemId: j.itemId, quantity: j.quantity },
        );
        if (j.kind === "plant" && j.regrow && day + j.regrow <= j.lastDay)
          jobs.push({ ...j, finishDay: day + j.regrow });
      }
    distribute();
    for (const n of nodes) {
      if (
        disabled.has(n.id) ||
        day <
          (autoDate(n) ? plan.startDay : Math.max(n.startDay, plan.startDay))
      )
        continue;
      if (n.kind === "plant") {
        const c = crops.get(n.id)!;
        if (
          jobs.some((j) => j.nodeId === n.id) ||
          (started.has(n.id) && !n.repeat)
        )
          continue;
        if (day > Math.min(periodEnd, n.endDay ?? periodEnd)) continue;
        const lastDay = Math.min(
          n.seasonProtection ? Infinity : Math.ceil(day / 28) * 28,
          started.has(n.id)
            ? Math.min(periodEnd, n.endDay ?? periodEnd)
            : Infinity,
        );
        if ((!n.seasonProtection && !c.seasons.includes(seasonAt(day))) || day + c.growth > lastDay) {
          if (!started.has(n.id) && c.seeds.some((id) => get(n, id) > 0))
            notice(n, "种植季节不符，或本季已不足以完成首次收获。", "blocked");
          continue;
        }
        const available = c.seeds.reduce((s, id) => s + get(n, id), 0);
        const count =
          scale.get(n.id) ?? (autoAmount(n) ? available : n.quantity);
        if (!count) continue;
        const deficit = Math.max(0, count - available);
        if (deficit) {
          if (!n.autoBuy) continue;
          const seed =
            c.seeds.find(
              (id) =>
                seedAvailability(
                  { ...catalog.get(id)!, seed_item_ids: [id] },
                  entities,
                  yearAt(day),
                  seasonAt(day),
                ).available,
            ) ?? c.seeds[0];
          if (!purchase(n, seed, deficit, started.has(n.id))) continue;
          put(inboxes.get(n.id)!, seed, deficit);
        }
        let left = count;
        for (const id of c.seeds) {
          const used = Math.min(left, get(n, id));
          use(n, id, used);
          left -= used;
        }
        startJob(n, "plant", count, c.growth);
      }
      if (n.kind === "process") {
        const r = recipes.get(n.id)!;
        let batches = Math.min(
          ...r.inputs.map((a) => Math.floor(get(n, a.itemId) / a.quantity)),
        );
        if (!autoAmount(n))
          batches = Math.min(
            batches,
            Math.max(0, n.quantity - (started.get(n.id) ?? 0)),
          );
        if (n.machineCount !== undefined) {
          const occupied = jobs
            .filter((j) => j.nodeId === n.id)
            .reduce((s, j) => s + j.slots, 0);
          batches = Math.min(
            batches,
            Math.max(0, n.machineCount * r.capacity - occupied),
          );
        }
        if (batches > 0) {
          for (const a of r.inputs) use(n, a.itemId, a.quantity * batches);
          startJob(n, "process", batches, r.duration);
        }
      }
      if (n.kind === "sale" || n.kind === "consume") {
        const itemId = n.itemId!,
          count = get(n, itemId);
        if (!count) continue;
        if (n.kind === "sale") {
          const item = catalog.get(itemId),
            price = qualityPrice(
              item?.sell_price as number,
              !!item?.quality_eligible,
              plan.quality,
            );
          if (!price || !priceValid(price.value)) {
            warn(n, `${name(itemId)} 的卖价未知，已保留库存。`);
            continue;
          }
          const amount = price.value * count;
          use(n, itemId, count);
          mark(n, count);
          emit(
            n,
            "sale",
            `出售 ${name(itemId)} ×${count} · ${plan.settlementDays ? `${plan.settlementDays} 天后到账` : "当日到账"}`,
            { itemId, quantity: count, amount },
          );
          if (plan.settlementDays) {
            receipts.push({
              day: day + plan.settlementDays,
              nodeId: n.id,
              itemId,
              quantity: count,
              amount,
            });
            projection(n).finishDay = day + plan.settlementDays;
          } else {
            income += amount;
            account(amount);
            emit(n, "receipt", `出货款到账 ${amount}`, {
              itemId,
              quantity: count,
              amount,
            });
          }
        } else {
          use(n, itemId, count);
          mark(n, count);
          emit(n, "consume", `消耗 ${name(itemId)} ×${count}`, {
            itemId,
            quantity: count,
          });
        }
      }
      if (n.kind === "reserve" || n.kind === "delivery") {
        const progress = result.demandProgress[n.id];
        if (!projection(n).delivered)
          for (const a of n.requirements ?? []) {
            const previous = progress.find((p) => p.itemId === a.itemId)!;
            const quantity = get(n, a.itemId) - previous.quantity;
            if (quantity > 0) {
              previous.quantity += quantity;
              projection(n).reserved += quantity;
              mark(n, quantity);
              emit(n, "reserve", `留存 ${name(a.itemId)} ×${quantity}`, {
                itemId: a.itemId,
                quantity,
              });
            }
          }
        if (
          (n.requirements ?? []).every(
            (a) =>
              (progress.find((p) => p.itemId === a.itemId)?.quantity ?? 0) >=
              a.quantity,
          )
        )
          projection(n).readyDay ??= day;
      }
      if (
        n.kind === "delivery" &&
        n.dueDay !== undefined &&
        !projection(n).delivered &&
        day >= n.dueDay
      ) {
        const ready = (n.requirements ?? []).every(
          (a) => get(n, a.itemId) >= a.quantity,
        );
        if (day === n.dueDay && ready) {
          inboxes.get(n.id)!.clear();
          projection(n).delivered = true;
          projection(n).reserved = 0;
          emit(
            n,
            "delivery",
            `交付 ${(n.requirements ?? []).map((a) => `${name(a.itemId)} ×${a.quantity}`).join("、")}，从留货中扣除。`,
            {
              quantity: (n.requirements ?? []).reduce(
                (s, a) => s + a.quantity,
                0,
              ),
            },
          );
        } else if (day === n.dueDay)
          warn(n, "到交付日期仍未备齐，继续留货；调整交付日期后可重新安排。");
      }
    }
    const pending = receipts.reduce((s, r) => s + r.amount, 0),
      snapshot = stock();
    result.days.push({
      day,
      cash,
      income: income - incomeBefore,
      spending: spending - spendingBefore,
      pendingRevenue: pending,
      events: result.events.slice(eventStart),
      stock: snapshot,
      inProgress: work(),
      land: updateLand(),
    });
    if (day === periodEnd) {
      result.income = income;
      result.spending = spending;
      result.cash = cash;
      result.pendingRevenue = pending;
      result.stock = snapshot;
      result.inProgress = work();
      periodCaptured = true;
    }
    if (day < periodEnd) {
      day++;
      continue;
    }
    const dates = [
      ...jobs.map((j) => j.finishDay),
      ...receipts.map((r) => r.day),
      ...nodes.flatMap((n) => {
        if (disabled.has(n.id) || !inboxes.get(n.id)!.size) return [];
        return [!autoDate(n) ? n.startDay : 0, n.dueDay ?? 0];
      }),
    ].filter((d) => d > day);
    if (!dates.length) break;
    day = Math.min(...dates);
    if (day > 11200) {
      summary.complete = false;
      result.issues.push("后续安排超过第 100 年，剩余在制品与待到账款保留。");
      break;
    }
  }
  if (iterations >= 20000) {
    summary.complete = false;
    result.issues.push("后续事件过多，推演已停止；请缩短重复范围。");
  }
  if (!periodCaptured) {
    result.income = income;
    result.spending = spending;
    result.cash = cash;
    result.stock = stock();
    result.inProgress = work();
  }
  summary.startupFunds = Math.max(0, -minCash);
  summary.finalIncome = income;
  summary.finalSpending = spending;
  summary.finalDelta = cash;
  summary.finishDay = result.days.at(-1)?.day ?? periodEnd;
  for (const n of nodes) {
    const p = projection(n);
    if (disabled.has(n.id)) continue;
    if (n.kind === "plant" && n.repeat && p.firstDay !== undefined) {
      const c = crops.get(n.id)!,
        lastPlant = result.events
          .filter((e) => e.nodeId === n.id && e.kind === "plant")
          .at(-1)?.day;
      if (!c.regrow && lastPlant !== undefined) {
        const limit = Math.min(
          periodEnd,
          n.endDay ?? periodEnd,
          Math.ceil(lastPlant / 28) * 28,
        );
        const stop =
          lastPlant + c.growth * 2 > limit
            ? "余下时间不足以再完成一轮，已停止续种。"
            : !n.autoBuy
              ? "种子不足以保持首轮规模，下一轮未安排。"
              : undefined;
        if (stop) p.notices.push(`最后播种为第 ${lastPlant} 天。${stop}`);
      }
    }
    if (
      ["purchase", "inventory", "plant"].includes(n.kind) &&
      !autoDate(n) &&
      n.startDay > periodEnd
    )
      p.notices.push("开始日期在计划的新增安排范围之外，请延长计划天数。");
    const waiting = [...inboxes.get(n.id)!].filter(([, q]) => q > 0);
    if (n.kind === "process" && waiting.length) {
      const r = recipes.get(n.id)!;
      const missing = r.inputs
        .filter((a) => get(n, a.itemId) < a.quantity)
        .map((a) => `${name(a.itemId)} 还缺 ${a.quantity - get(n, a.itemId)}`);
      notice(
        n,
        missing.length
          ? `余料尚不够一批：${missing.join("，")}。`
          : "仍有原料等待加工。",
      );
    }
    if (n.kind === "reserve" || n.kind === "delivery") {
      const missing = (n.requirements ?? [])
        .map((a, i) => ({
          ...a,
          quantity: Math.max(
            0,
            a.quantity - (result.demandProgress[n.id]?.[i]?.quantity ?? 0),
          ),
        }))
        .filter((a) => a.quantity);
      if (missing.length)
        notice(
          n,
          `还需 ${missing.map((a) => `${name(a.itemId)} ×${a.quantity}`).join("、")}。`,
        );
    }
    if (!p.firstDay && p.notices.length === 0)
      notice(
        n,
        incoming.get(n.id)!.length ? "等待上游产物。" : "尚未连接物品来源。",
      );
    if (p.firstDay !== undefined && p.status === "scheduled" && !waiting.length)
      p.status = "done";
    if (
      ["reserve", "delivery"].includes(n.kind) &&
      n.requirements?.every(
        (a, i) =>
          (result.demandProgress[n.id]?.[i]?.quantity ?? 0) >= a.quantity,
      )
    )
      p.status = "done";
    const left = [...supplies.get(n.id)!].filter(([, q]) => q > 0);
    if (left.length)
      notice(
        n,
        `未安排去向：${left.map(([id, q]) => `${name(id)} ×${q}`).join("、")}。`,
      );
  }
  return result;
}
