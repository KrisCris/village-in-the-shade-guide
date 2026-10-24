import { describe, expect, it } from "vitest";
import { entity, node, plan } from "./test-helpers";
import { simulatePlan } from "./simulate";
import { resolveIntent, canConnectDraft } from "./intent";
import { parsePlan, newNode } from "../workflowEditor";
import { getCatalog } from "../../data/repository";
import { workflowPayload } from "../../data/workflowPayload";
import type { SimulationResult, WorkflowNode, WorkflowPlan } from "./types";
const data = [
  entity("seed", "items", { buy_price: 10 }),
  entity("fruit", "items", { sell_price: 20 }),
  entity("jam", "items", { sell_price: 40 }),
  entity("cake", "items", { sell_price: 100 }),
  entity("sugar", "items", { sell_price: 5 }),
  entity("machine", "machines", { capacity: 1 }),
  entity("machine-upgraded", "machines", { capacity: 3 }),
  entity("crop", "crops", {
    seed_item_ids: ["seed"],
    harvest_item_ids: ["fruit"],
    growth_days: 5,
    harvest_quantity: 1,
    seasons: ["spring", "summer"],
  }),
  entity("offer", "store-offers", {
    item_id: "seed",
    seasons: ["spring", "summer"],
    required_flags: [],
  }),
  entity("jam-recipe", "processes", {
    machine_ids: ["machine", "machine-upgraded"],
    inputs: [{ item_id: "fruit", quantity: 1 }],
    output: { item_id: "jam", quantity: 1 },
    duration_minutes: 1440,
  }),
  entity("cake-recipe", "processes", {
    machine_ids: ["machine", "machine-upgraded"],
    inputs: [
      { item_id: "jam", quantity: 2 },
      { item_id: "sugar", quantity: 1 },
    ],
    output: { item_id: "cake", quantity: 1 },
    duration_minutes: 2880,
  }),
];
const n = (
  id: string,
  kind: WorkflowNode["kind"],
  fields: Partial<WorkflowNode> = {},
) =>
  node(id, kind, {
    startDay: 1,
    amountMode: "auto",
    dateMode: "auto",
    ...fields,
  });
const p = (
  nodes: WorkflowNode[],
  edges: string[][] = [],
  fields: Partial<WorkflowPlan> = {},
) =>
  plan(nodes, edges, {
    planningMode: "intent",
    startDay: 1,
    days: 28,
    initialCash: 0,
    plots: [],
    machines: [],
    ...fields,
  });
const chain = () =>
  p(
    [
      n("buy", "purchase", { itemId: "seed", quantity: 100 }),
      n("plant", "plant"),
      n("process", "process"),
      n("reserve", "reserve", {
        requirements: [{ itemId: "fruit", quantity: 10 }],
      }),
      n("sale", "sale"),
    ],
    [
      ["buy", "plant"],
      ["plant", "reserve"],
      ["plant", "process"],
      ["process", "sale"],
    ],
  );

describe("intent workflow", () => {
  it("recalculates equipment demand from the chosen model and discards legacy capacity overrides", () => {
    const original = chain();
    const q = parsePlan(JSON.stringify({ ...original, nodes: original.nodes.map(node =>
      node.kind === "process" ? { ...node, machineId: "machine-upgraded", machineCapacity: 99 } : node
    ) }));
    expect(q.nodes.find(node => node.kind === "process")).not.toHaveProperty("machineCapacity");
    const upgraded = simulatePlan(q, data);
    expect(upgraded.intent?.nodes.process).toMatchObject({ machines: 30, machineCapacity: 3 });
    q.nodes.find(node => node.kind === "process")!.machineId = "machine";
    const basic = simulatePlan(q, data);
    expect(basic.intent?.nodes.process).toMatchObject({ machines: 90, machineCapacity: 1 });
    expect(basic.intent?.finalIncome).toBe(upgraded.intent?.finalIncome);
    expect(basic.intent?.nodes.process.finishDay).toBe(upgraded.intent?.nodes.process.finishDay);
  });
  it("uses slots for complete recipe batches, including a final partial wave", () => {
    const q = p([
      n("jam", "inventory", { itemId: "jam", quantity: 14 }),
      n("sugar", "inventory", { itemId: "sugar", quantity: 7 }),
      n("process", "process", { recipeId: "cake-recipe", machineId: "machine-upgraded", machineCount: 1 }),
      n("sale", "sale"),
    ], [["jam", "process"], ["sugar", "process"], ["process", "sale"]]);
    const d = data.map(e => e.id === "cake-recipe" ? { ...e, output: { item_id: "cake", quantity: 2 } } : e);
    const upgraded = simulatePlan(q, d);
    expect(upgraded.events.filter(e => e.kind === "process").map(e => [e.day, e.quantity])).toEqual([[1, 3], [3, 3], [5, 1]]);
    expect(upgraded.intent?.nodes.process).toMatchObject({ finishDay: 7, outputQuantity: 14, machines: 1 });
    q.nodes.find(node => node.kind === "process")!.machineId = "machine";
    const basic = simulatePlan(q, d);
    expect(basic.events.filter(e => e.kind === "process")).toHaveLength(7);
    expect(basic.intent?.nodes.process).toMatchObject({ finishDay: 15, outputQuantity: 14, machines: 1 });
    expect(basic.intent?.finalIncome).toBe(upgraded.intent?.finalIncome);
  });
  it("does not guess capacity for an unknown or incompatible machine", () => {
    for (const capacity of [undefined, 0, -1, 1.5]) {
      const r = simulatePlan(chain(), data.map(e => e.id === "machine" ? { ...e, capacity } : e));
      expect(r.intent?.nodes.process.status).toBe("blocked");
      expect(r.intent?.nodes.process.notices.join("")).toContain("容量数据尚未核实");
      expect(r.events.some(e => e.kind === "process")).toBe(false);
    }
    const q = chain();
    q.nodes.find(node => node.kind === "process")!.machineId = "unsupported";
    const r = simulatePlan(q, [...data, entity("unsupported", "machines", { capacity: 3 })]);
    expect(r.intent?.nodes.process.notices.join("")).toContain("不支持当前配方");
    expect(r.events.some(e => e.kind === "process")).toBe(false);
  });
  it("migrates legacy equipment model and count without copying its old capacity", () => {
    const q = plan([node("process", "process", { recipeId: "jam-recipe", resourceId: "machine-resource" })], [], {
      machines: [{ id: "machine-resource", machineId: "machine-upgraded", label: "旧机器", count: 2, capacity: 10 }],
    });
    const migrated = parsePlan(JSON.stringify(q));
    expect(migrated.nodes[0]).toMatchObject({ machineId: "machine-upgraded", machineCount: 2 });
    expect(migrated.nodes[0]).not.toHaveProperty("machineCapacity");
  });
  it("derives 100 plots, reserves 10, processes 90 and books receipts only when paid", () => {
    const r = simulatePlan(chain(), data);
    expect(r.issues).toEqual([]);
    expect(r.events.find((e) => e.kind === "plant")).toMatchObject({
      day: 1,
      quantity: 100,
    });
    expect(r.events.find((e) => e.kind === "harvest")).toMatchObject({
      day: 6,
      quantity: 100,
    });
    expect(r.events.find((e) => e.kind === "process")).toMatchObject({
      day: 6,
      quantity: 90,
    });
    expect(r.events.find((e) => e.kind === "sale")).toMatchObject({
      day: 7,
      quantity: 90,
    });
    expect(r.days.find((d) => d.day === 7)).toMatchObject({
      cash: -1000,
      pendingRevenue: 3600,
    });
    expect(r.days.find((d) => d.day === 8)).toMatchObject({
      cash: 2600,
      pendingRevenue: 0,
    });
    expect(r.intent).toMatchObject({
      land: 100,
      startupFunds: 1000,
      finalDelta: 2600,
    });
    expect(r.intent?.nodes.process.machines).toBe(90);
    expect(r.stock.find((s) => s.reserved)).toMatchObject({
      itemId: "fruit",
      quantity: 10,
    });
  });
  it("waits for every ingredient and chains processing without a manually entered start date", () => {
    const q = chain();
    q.nodes = q.nodes.filter((n) => n.id !== "reserve");
    q.edges = q.edges.filter(
      (e) => e.target !== "reserve" && e.source !== "process",
    );
    q.nodes.push(
      n("sugar", "inventory", {
        itemId: "sugar",
        quantity: 50,
        startDay: 10,
        dateMode: "manual",
      }),
      n("cake", "process", { recipeId: "cake-recipe" }),
    );
    q.edges.push(
      { id: "pc", source: "process", target: "cake" },
      { id: "sc", source: "sugar", target: "cake" },
      { id: "cs", source: "cake", target: "sale" },
    );
    const r = simulatePlan(q, data);
    expect(
      r.events.find((e) => e.nodeId === "cake" && e.kind === "process"),
    ).toMatchObject({ day: 10, quantity: 50 });
    expect(r.events.find((e) => e.kind === "sale")).toMatchObject({
      day: 12,
      quantity: 50,
      itemId: "cake",
    });
    expect(r.days[7].stock.find((s) => s.nodeId === "cake")).toMatchObject({
      itemId: "jam",
      quantity: 100,
      state: "waiting",
    });
  });
  it("queues locally, carries future receipts, and uses batch capacity for machine requirements", () => {
    const q = chain();
    q.days = 7;
    q.nodes.find((n) => n.id === "process")!.machineCount = 1;
    q.nodes.find((n) => n.id === "process")!.machineId = "machine-upgraded";
    const r = simulatePlan(q, data);
    expect(r.intent?.nodes.process.machines).toBe(1);
    expect(r.events.filter((e) => e.kind === "process")).toHaveLength(30);
    expect(r.events.filter((e) => e.kind === "complete").at(-1)?.day).toBe(36);
    expect(r.income).toBe(0);
    expect(r.pendingRevenue).toBe(120);
    expect(r.intent?.finalIncome).toBe(3600);
    expect(r.intent?.finalDelta).toBe(2600);
    expect(r.inProgress).toHaveLength(1);
  });
  it("buys deficits on each replant day, reuses land, and stops without an impossible final purchase", () => {
    const q = p(
      [
        n("buy", "purchase", { itemId: "seed", quantity: 100 }),
        n("plant", "plant", { repeat: true, autoBuy: true }),
      ],
      [["buy", "plant"]],
    );
    const r = simulatePlan(q, data);
    expect(
      r.events.filter((e) => e.kind === "purchase").map((e) => e.day),
    ).toEqual([1, 6, 11, 16, 21]);
    expect(
      r.events.filter((e) => e.kind === "plant").map((e) => e.day),
    ).toEqual([1, 6, 11, 16, 21]);
    expect(r.intent?.land).toBe(100);
    expect(r.issues).toEqual([]);
    q.nodes[1].autoBuy = false;
    expect(
      simulatePlan(q, data).events.filter((e) => e.kind === "plant"),
    ).toHaveLength(1);
  });
  it("distinguishes natural regrowth and computes simultaneous land rather than cumulative plantings", () => {
    const d = data.map((e) => (e.id === "crop" ? { ...e, regrow_days: 3 } : e));
    const q = p(
      [
        n("buy", "purchase", { itemId: "seed", quantity: 100 }),
        n("plant", "plant", { repeat: true, autoBuy: true }),
        n("buy2", "purchase", {
          itemId: "seed",
          quantity: 40,
          startDay: 4,
          dateMode: "manual",
        }),
        n("plant2", "plant"),
      ],
      [
        ["buy", "plant"],
        ["buy2", "plant2"],
      ],
    );
    const r = simulatePlan(q, d);
    expect(r.intent?.land).toBe(140);
    expect(r.events.filter((e) => e.kind === "purchase")).toHaveLength(2);
    expect(
      r.events
        .filter((e) => e.nodeId === "plant" && e.kind === "harvest")
        .map((e) => e.day),
    ).toEqual([6, 9, 12, 15, 18, 21, 24, 27]);
  });
  it("does not let two remainder consumers race by id; fixed allocations are protected before a later start", () => {
    const q = p(
      [
        n("stock", "inventory", { itemId: "fruit", quantity: 100 }),
        n("a", "sale"),
        n("b", "sale"),
      ],
      [
        ["stock", "a"],
        ["stock", "b"],
      ],
    );
    let r = simulatePlan(q, data);
    expect(r.income).toBe(0);
    expect(r.intent?.nodes.a.notices.join("")).toContain("多个");
    q.nodes[1] = {
      ...q.nodes[1],
      amountMode: "manual",
      quantity: 30,
      dateMode: "manual",
      startDay: 5,
    };
    r = simulatePlan(q, data);
    expect(
      r.events.find((e) => e.nodeId === "b" && e.kind === "sale"),
    ).toMatchObject({ day: 1, quantity: 70 });
    expect(
      r.events.find((e) => e.nodeId === "a" && e.kind === "sale"),
    ).toMatchObject({ day: 5, quantity: 30 });
  });
  it("keeps drafts local and distinguishes reservation from delivery", () => {
    const q = chain();
    q.nodes.push(
      n("draft", "process"),
      n("disconnected", "delivery", {
        requirements: [{ itemId: "fruit", quantity: 2 }],
      }),
    );
    q.nodes.find((n) => n.id === "reserve")!.kind = "delivery";
    q.nodes.find((n) => n.id === "reserve")!.dueDay = 9;
    const r = simulatePlan(q, data);
    expect(r.income).toBe(3600);
    expect(r.intent?.nodes.draft.status).toBe("draft");
    expect(r.intent?.nodes.disconnected.notices.join("")).toContain(
      "尚未安排来源",
    );
    expect(r.intent?.nodes.reserve.delivered).toBe(true);
    expect(
      r.days.find((d) => d.day === 8)?.stock.filter((s) => s.reserved),
    ).toHaveLength(1);
    expect(
      r.days.find((d) => d.day === 9)?.stock.filter((s) => s.reserved),
    ).toHaveLength(0);
  });
  it("does not finance a purchase with its own same-day sale", () => {
    const q = p(
      [
        n("buy", "purchase", { itemId: "seed", quantity: 100 }),
        n("sale", "sale"),
      ],
      [["buy", "sale"]],
      { settlementDays: 0 },
    );
    const d = data.map((e) => (e.id === "seed" ? { ...e, sell_price: 20 } : e));
    const r = simulatePlan(q, d);
    expect(r.cash).toBe(1000);
    expect(r.intent?.startupFunds).toBe(1000);
  });
  it("infers in both directions without persisting derived choices and preserves manual conflicts", () => {
    const q = chain();
    const resolved = resolveIntent(q, data);
    expect(resolved.nodes.find((n) => n.id === "plant")?.cropId).toBe("crop");
    expect(resolved.nodes.find((n) => n.id === "process")?.recipeId).toBe(
      "jam-recipe",
    );
    expect(q.nodes.find((n) => n.id === "plant")?.cropId).toBeUndefined();
    q.nodes[0].itemId = undefined;
    q.nodes[1].cropId = "crop";
    expect(resolveIntent(q, data).nodes[0].itemId).toBe("seed");
    q.nodes.find((n) => n.id === "process")!.recipeId = "jam-recipe";
    q.nodes.find((n) => n.id === "sale")!.itemId = "cake";
    expect(resolveIntent(q, data).notices.sale.join("")).toContain("不匹配");
    expect(
      canConnectDraft([n("a", "purchase"), n("b", "plant")], [], "a", "b"),
    ).toBe(true);
  });
  it("offers ambiguous recipes and migrates older explicit choices once", () => {
    const q = chain();
    const d = [
      ...data,
      entity("juice-recipe", "processes", {
        inputs: [{ item_id: "fruit", quantity: 1 }],
        output: { item_id: "cake", quantity: 1 },
        duration_minutes: 1440,
      }),
    ];
    expect(resolveIntent(q, d).choices.process).toHaveLength(2);
    expect(
      resolveIntent(q, d).nodes.find((n) => n.id === "process")?.recipeId,
    ).toBeUndefined();
    const old = plan([
      node("p", "process", {
        recipeId: "recipe",
        resourceId: "machine-resource",
      }),
    ]);
    const migrated = parsePlan(JSON.stringify(old));
    expect(migrated).toMatchObject({
      planningMode: "intent",
      nodes: [{ amountMode: "manual", dateMode: "manual", machineCount: 1 }],
    });
    expect(parsePlan(JSON.stringify(migrated))).toEqual(migrated);
    expect(newNode("plant", 1)).toMatchObject({
      repeat: false,
      autoBuy: true,
      amountMode: "auto",
      dateMode: "auto",
    });
  });
  it("respects not-before dates while protecting future reserves from remainder sales", () => {
    const q = p(
      [
        n("stock", "inventory", { itemId: "fruit", quantity: 100 }),
        n("reserve", "reserve", {
          requirements: [{ itemId: "fruit", quantity: 10 }],
          dateMode: "manual",
          startDay: 8,
        }),
        n("sale", "sale"),
      ],
      [
        ["stock", "reserve"],
        ["stock", "sale"],
      ],
    );
    const r = simulatePlan(q, data);
    expect(r.events.find((e) => e.kind === "reserve")).toMatchObject({
      day: 8,
      quantity: 10,
    });
    expect(r.events.find((e) => e.kind === "sale")).toMatchObject({
      day: 1,
      quantity: 90,
    });
    expect(r.days[0].stock.find((s) => s.nodeId === "reserve")).toMatchObject({
      state: "waiting",
      reserved: false,
    });
    expect(r.intent?.nodes.reserve.readyDay).toBe(8);
  });
  it("handles pre-existing work on Day 1 despite a later manual start and does not take fresh inputs twice", () => {
    const q = p(
      [
        n("stock", "inventory", { itemId: "fruit", quantity: 10 }),
        n("process", "process", {
          recipeId: "jam-recipe",
          remainingDays: 0,
          quantity: 10,
          amountMode: "manual",
          dateMode: "manual",
          startDay: 8,
        }),
        n("sale", "sale"),
      ],
      [
        ["stock", "process"],
        ["process", "sale"],
      ],
    );
    const r = simulatePlan(q, data);
    expect(r.events.find((e) => e.kind === "complete")).toMatchObject({
      day: 1,
      quantity: 10,
    });
    expect(r.events.filter((e) => e.kind === "process")).toHaveLength(0);
    expect(r.stock.find((s) => s.nodeId === "stock")).toMatchObject({
      quantity: 10,
    });
    expect(r.income).toBe(400);
  });
  it("keeps recipe alternatives available when downstream items are automatic", () => {
    const q = chain();
    q.nodes.find((n) => n.id === "process")!.recipeId = "jam-recipe";
    const alternatives = [
      ...data,
      entity("juice", "processes", {
        inputs: [{ item_id: "fruit", quantity: 1 }],
        output: { item_id: "cake", quantity: 1 },
        duration_minutes: 1440,
      }),
    ];
    expect(
      resolveIntent(q, alternatives).choices.process.map((e) => e.id),
    ).toContain("juice");
    q.nodes.find((n) => n.id === "process")!.recipeId = "juice";
    expect(
      resolveIntent(q, alternatives).nodes.find((n) => n.id === "sale")?.itemId,
    ).toBe("cake");
  });
  it("records each transfer day and does not start a repeat that cannot finish in the chosen range", () => {
    const q = chain();
    q.days = 7;
    q.nodes.find((n) => n.id === "plant")!.repeat = true;
    q.nodes.find((n) => n.id === "plant")!.autoBuy = true;
    const r = simulatePlan(q, data);
    expect(r.events.filter((e) => e.kind === "purchase")).toHaveLength(1);
    const edge = q.edges.find((e) => e.target === "process")!;
    expect(r.intent?.edgeSchedule[edge.id]).toEqual([
      { day: 6, itemId: "fruit", quantity: 90 },
    ]);
    expect(r.intent?.nodes.plant.notices.join("")).toContain("停止续种");
  });
  it("can run two independent nodes without sharing machines, and measures peak concurrent batches", () => {
    const q = p(
      [
        n("a", "inventory", { itemId: "fruit", quantity: 50 }),
        n("b", "inventory", {
          itemId: "fruit",
          quantity: 50,
          startDay: 2,
          dateMode: "manual",
        }),
        n("process", "process", { recipeId: "jam-recipe", machineId: "machine-upgraded" }),
        n("stock2", "inventory", { itemId: "fruit", quantity: 20 }),
        n("process2", "process", { recipeId: "jam-recipe", machineCount: 1 }),
      ],
      [
        ["a", "process"],
        ["b", "process"],
        ["stock2", "process2"],
      ],
    );
    const d = data.map((e) =>
      e.id === "jam-recipe" ? { ...e, duration_minutes: 2880 } : e,
    );
    const r = simulatePlan(q, d);
    expect(r.intent?.nodes.process.machines).toBe(34);
    expect(
      r.events
        .filter((e) => e.nodeId === "process" && e.kind === "process")
        .map((e) => e.day),
    ).toEqual([1, 2]);
    expect(r.intent?.nodes.process2.machines).toBe(1);
    expect(r.intent?.nodes.process2.outputQuantity).toBe(20);
  });
  it("preserves total material across varied machine counts and reserve amounts", () => {
    for (const count of [1, 3, 100])
      for (const reserve of [1, 10, 99]) {
        const q = chain();
        q.nodes.find((n) => n.id === "process")!.machineCount = count;
        q.nodes.find((n) => n.id === "reserve")!.requirements![0].quantity =
          reserve;
        const r = simulatePlan(q, data);
        const sold = r.events
          .filter((e) => e.kind === "sale")
          .reduce((s, e) => s + (e.quantity ?? 0), 0);
        expect(sold + reserve).toBe(100);
        expect(r.intent?.finalIncome).toBe(sold * 40);
        expect(
          r.days.every((d) =>
            d.stock.every(
              (s) => Number.isInteger(s.quantity) && s.quantity > 0,
            ),
          ),
        ).toBe(true);
      }
  });
});

describe("shrubs and fruit trees", () => {
  const game = workflowPayload(getCatalog());
  const grow = (
    cropId: string,
    fields: Partial<WorkflowNode> = {},
    range: Partial<WorkflowPlan> = {},
  ) =>
    simulatePlan(
      p(
        [
          n("plant", "plant", {
            cropId,
            quantity: 1,
            amountMode: "manual",
            autoBuy: true,
            // Ignored: a perennial is never replanted.
            repeat: true,
            ...fields,
          }),
        ],
        [],
        range,
      ),
      game,
    );
  const picks = (r: SimulationResult, itemId: string) =>
    r.events
      .filter((e) => e.kind === "harvest" && e.itemId === itemId)
      .map((e) => [e.day, e.quantity]);
  const every = (first: number, step: number, count: number, quantity: number) =>
    Array.from({ length: count }, (_, i) => [first + step * i, quantity]);
  it("buys mulberry saplings once and picks leaves and berries only in summer", () => {
    const r = grow("CROPS_ID_MULBERRY", { quantity: 2 }, { days: 112 });
    expect(
      r.events
        .filter((e) => e.kind === "purchase")
        .map((e) => [e.day, e.itemId, e.quantity, e.amount, e.reason]),
    ).toEqual([[1, "ITEM_ID_SEED_MULBERRY", 2, 4000, "initial"]]);
    expect(r.events.filter((e) => e.kind === "plant").map((e) => e.day)).toEqual([1]);
    // Grown on spring day 11, it is first picked on summer day 1 (day 29), then every 2 days.
    expect(picks(r, "ITEM_ID_CROPS_MULBERRY_LEAF")).toEqual(every(29, 2, 14, 4));
    expect(picks(r, "ITEM_ID_CROPS_MULBERRY")).toEqual(every(29, 2, 14, 4));
    expect(r.spending).toBe(4000);
    expect(r.intent?.nodes.plant.outputQuantity).toBe(14 * 8);
    // The bushes keep their 2 tiles through autumn and winter.
    expect(r.days.at(-1)).toMatchObject({ day: 112, land: 2 });
    expect(r.issues).toEqual([]);
  });
  it("picks mulberry bushes that are already grown from the first summer day", () => {
    const r = simulatePlan(
      p(
        [
          n("plant", "plant", {
            cropId: "CROPS_ID_MULBERRY",
            quantity: 3,
            amountMode: "manual",
            remainingDays: 0,
          }),
          n("sale", "sale", { itemId: "ITEM_ID_CROPS_MULBERRY" }),
        ],
        [["plant", "sale"]],
        { startDay: 29, days: 28 },
      ),
      game,
    );
    expect(r.events.filter((e) => e.kind === "purchase")).toEqual([]);
    expect(picks(r, "ITEM_ID_CROPS_MULBERRY_LEAF")).toEqual(every(29, 2, 14, 6));
    // The berries go to their own sale; the leaves stay unassigned.
    expect(r.events.filter((e) => e.kind === "sale").map((e) => e.quantity)).toEqual(Array(14).fill(6));
    expect(r.intent?.nodes.plant.notices.join()).toContain("桑叶 ×84");
  });
  it("waits through winter and picks tea from the first day of spring", () => {
    const r = grow("CROPS_ID_TEA_TREE", {}, { startDay: 85, days: 56 });
    expect(r.events.filter((e) => e.kind === "purchase")).toHaveLength(1);
    expect(picks(r, "ITEM_ID_CROPS_TEA_TREE")).toEqual(every(113, 2, 14, 2));
    expect(r.days.find((d) => d.day === 100)?.inProgress).toEqual([
      { nodeId: "plant", finishDay: 113, itemId: "ITEM_ID_CROPS_TEA_TREE", quantity: 2, kind: "plant" },
    ]);
  });
  it("picks tea once grown when planted in spring and says when a plan has no tea season", () => {
    expect(picks(grow("CROPS_ID_TEA_TREE"), "ITEM_ID_CROPS_TEA_TREE")).toEqual(every(11, 2, 9, 2));
    const summer = grow("CROPS_ID_TEA_TREE", {}, { startDay: 29, days: 28 });
    expect(picks(summer, "ITEM_ID_CROPS_TEA_TREE")).toEqual([]);
    expect(summer.intent?.nodes.plant.notices).toContain(
      "春季结果，本计划内收不到。延长计划天数即可计入。",
    );
  });
  it("shakes an apple tree every 3 days through autumn and on its last day", () => {
    // Planted on summer day 17, the tree is grown on autumn day 1 (day 57).
    const r = grow(
      "CROPS_ID_APPLE_TREE",
      { startDay: 45, dateMode: "manual" },
      { startDay: 29, days: 84 },
    );
    expect(picks(r, "ITEM_ID_CROPS_APPLE")).toEqual([...every(59, 3, 9, 3), [84, 1]]);
    expect(r.spending).toBe(3000);
    expect(r.events.filter((e) => e.kind === "plant")).toHaveLength(1);
    // Grown mid-autumn, it bears from that day: 16 fruit.
    const late = grow(
      "CROPS_ID_APPLE_TREE",
      { startDay: 57, dateMode: "manual" },
      { startDay: 57, days: 28 },
    );
    expect(picks(late, "ITEM_ID_CROPS_APPLE")).toEqual([...every(71, 3, 5, 3), [84, 1]]);
  });
  it("keeps a greenhouse banana tree bearing straight across the season boundary", () => {
    const r = grow("CROPS_ID_BANANA_TREE", {}, { days: 56 });
    expect(picks(r, "ITEM_ID_CROPS_BANANA")).toEqual([...every(15, 3, 14, 3), [56, 2]]);
  });
  it("lets a perennial take its saplings once and leaves later ones unplanted", () => {
    const r = simulatePlan(
      p(
        [
          n("buy", "purchase", { itemId: "ITEM_ID_SEED_TEA", quantity: 2 }),
          n("plant", "plant", { cropId: "CROPS_ID_TEA_TREE", repeat: true }),
          n("buy2", "purchase", {
            itemId: "ITEM_ID_SEED_TEA",
            quantity: 3,
            startDay: 20,
            dateMode: "manual",
          }),
        ],
        [
          ["buy", "plant"],
          ["buy2", "plant"],
        ],
      ),
      game,
    );
    expect(r.events.filter((e) => e.kind === "plant").map((e) => [e.day, e.quantity])).toEqual([[1, 2]]);
    expect(r.intent?.nodes.buy2.notices.join()).toContain("茶树苗 ×3");
  });
});
