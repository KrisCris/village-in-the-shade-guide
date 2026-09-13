import { describe, expect, it } from "vitest";
import { entity, entities as fixture, node, plan } from "./test-helpers";
import { getWorkflowAssistance, applyWorkflowAssistance, updateWorkflowNode } from "./assistance";
import { resolveIntent } from "./intent";
import { simulatePlan } from "./simulate";
import { newNode, parsePlan } from "../workflowEditor";
import type { WorkflowPlan } from "./types";

const data = fixture.map(e => e.kind === "machines" ? { ...e, capacity: 1 } : e);
const p = (nodes: WorkflowPlan["nodes"], edges: string[][] = []) => plan(nodes, edges, {
  planningMode: "intent", initialCash: 0, plots: [], machines: [],
});
const stock = (id = "pork", quantity = 7) => node(id, "inventory", { itemId: id, quantity, amountMode: "manual" });
const process = () => node("work", "process", { recipeId: "recipe", amountMode: "auto", dateMode: "auto" });
const options = (q: WorkflowPlan, id: string) => getWorkflowAssistance(q, data, id, simulatePlan(q, data));

describe("workflow assistance", () => {
  it("offers only steps compatible with the resolved output, and creates one connected automatic node", () => {
    const q = p([stock("seed")]);
    expect(options(q, "seed").next.map(a => a.key)).toContain("plant:crop");
    expect(options(q, "seed").next.map(a => a.key)).not.toContain("process:recipe");
    const added = applyWorkflowAssistance(q, data, "seed", "plant:crop");
    expect(added.plan.nodes.at(-1)).toMatchObject({ kind: "plant", repeat: false, amountMode: "auto", dateMode: "auto" });
    expect(added.plan.nodes.at(-1)?.cropId).toBeUndefined();
    expect(resolveIntent(added.plan, data).nodes.at(-1)?.cropId).toBe("crop");
    expect(added.plan.edges).toHaveLength(1);
    expect(q.nodes).toHaveLength(1);
    expect(() => applyWorkflowAssistance(added.plan, data, "seed", "plant:crop")).toThrow();
  });
  it("inserts processing before a sole automatic sale and preserves reserve edges", () => {
    const q = p([stock(), node("sale", "sale", { amountMode: "auto", dateMode: "auto" }), node("keep", "reserve", { requirements: [{ itemId: "pork", quantity: 2 }] })], [["pork", "sale"], ["pork", "keep"]]);
    expect(options(q, "pork").next.find(a => a.key === "process:recipe")?.detail).toContain("出售前");
    const added = applyWorkflowAssistance(q, data, "pork", "process:recipe");
    expect(added.plan.edges.map(e => [e.source, e.target])).toEqual(expect.arrayContaining([["pork", "keep"], ["pork", added.focusId], [added.focusId, "sale"]]));
    expect(added.plan.edges.some(e => e.source === "pork" && e.target === "sale")).toBe(false);
    expect(resolveIntent(added.plan, data).nodes.find(n => n.id === "sale")?.itemId).toBe("bacon");
  });
  it("does not rewrite explicit, dated or multiple-source sales or create competing remainder branches", () => {
    for (const sale of [
      node("sale", "sale", { itemId: "pork", amountMode: "auto", dateMode: "auto" }),
      node("sale", "sale", { quantity: 2, amountMode: "manual", dateMode: "auto" }),
      node("sale", "sale", { amountMode: "auto", dateMode: "manual" }),
    ]) expect(options(p([stock(), sale], [["pork", "sale"]]), "pork").next.find(a => a.key === "process:recipe")).toBeUndefined();
    const q = p([stock(), stock("salt"), node("sale", "sale", { amountMode: "auto", dateMode: "auto" })], [["pork", "sale"], ["salt", "sale"]]);
    expect(options(q, "pork").next.find(a => a.key === "process:recipe")).toBeUndefined();
  });
  it("measures auxiliary shortages in recipe inputs and creates only an explicitly requested purchase", () => {
    const q = p([stock(), stock("salt", 2), process()], [["pork", "work"], ["salt", "work"]]);
    const result = simulatePlan(q, data);
    const need = getWorkflowAssistance(q, data, "work", result).inputs.find(i => i.itemId === "salt")!;
    expect(need).toMatchObject({ received: 2, shortage: 5, perBatch: 1 });
    const buy = need.actions.find(a => a.key === "buy:salt")!;
    expect(buy.label).toContain("5");
    const added = applyWorkflowAssistance(q, data, "work", buy.key, result);
    expect(added.plan.nodes.at(-1)).toMatchObject({ kind: "purchase", quantity: 5, itemId: "salt", repeat: false });
    expect(simulatePlan(added.plan, data).intent?.nodes.work.outputQuantity).toBe(14);
  });
  it("finds existing ingredient sources without duplicate edges or cycles", () => {
    const q = p([stock(), stock("salt"), process()], [["pork", "work"]]);
    const need = options(q, "work").inputs.find(i => i.itemId === "salt")!;
    expect(need.actions.some(a => a.key === "source:salt")).toBe(true);
    const added = applyWorkflowAssistance(q, data, "work", "source:salt", simulatePlan(q, data));
    expect(added.plan.nodes).toHaveLength(3);
    expect(() => applyWorkflowAssistance(added.plan, data, "work", "source:salt")).toThrow();
    const cyclic = p([process(), node("downstream", "process", { recipeId: "salt-recipe" })], [["work", "downstream"]]);
    const d = [...data, entity("salt-recipe", "processes", { inputs: [{ item_id: "bacon", quantity: 1 }], output: { item_id: "salt", quantity: 1 } })];
    expect(getWorkflowAssistance(cyclic, d, "work").inputs.flatMap(i => i.actions).some(a => a.key === "source:downstream")).toBe(false);
  });
  it("does not invent a shop purchase or silently wire unrelated reserve goals", () => {
    const q = p([stock(), process(), node("keep", "reserve", { requirements: [{ itemId: "pork", quantity: 1 }] }), node("other", "reserve", { requirements: [{ itemId: "seed", quantity: 1 }] })]);
    const a = getWorkflowAssistance(q, data.filter(e => e.id !== "salt-offer"), "work");
    expect(a.inputs.flatMap(i => i.actions).some(a => a.key === "buy:salt")).toBe(false);
    expect(options(q, "pork").next.map(a => a.key)).toContain("target:keep");
    expect(options(q, "pork").next.map(a => a.key)).not.toContain("target:other");
  });
  it("enforces plan limits atomically", () => {
    const q = p([stock("seed"), ...Array.from({ length: 199 }, (_, i) => node(`n${i}`, "inventory", { itemId: "salt" }))]);
    expect(() => applyWorkflowAssistance(q, data, "seed", "plant:crop")).toThrow();
    expect(q.nodes).toHaveLength(200);
  });
  it("automatically names new nodes while preserving custom and legacy labels", () => {
    const n = { ...newNode("inventory", 1), itemId: "pork" };
    const q = p([n]);
    expect(resolveIntent(q, data).nodes[0].label).toContain("pork");
    n.itemId = "salt";
    expect(resolveIntent(q, data).nodes[0].label).toContain("salt");
    n.label = "我的盐"; n.labelMode = "manual";
    expect(resolveIntent(q, data).nodes[0].label).toBe("我的盐");
    expect(resolveIntent(p([stock()]), data).nodes[0].label).toBe("pork");
    expect(parsePlan(JSON.stringify(q)).nodes[0].labelMode).toBe("manual");
  });
  it("clears only incompatible equipment when explicitly changing recipe", () => {
    const previous = { ...process(), machineId: "machine", machineCount: 2 };
    const d = [...data, entity("other-recipe", "processes", { machine_ids: ["other-machine"] })];
    expect(updateWorkflowNode(previous, { ...previous, recipeId: "other-recipe" }, d)).toMatchObject({ machineId: undefined, machineCount: 2 });
    expect(updateWorkflowNode(previous, { ...previous, label: "custom" }, d).machineId).toBe("machine");
  });
  it("follows a changed seed when the suggested planting has a unique crop", () => {
    const d = [...data, entity("seed2", "items"), entity("crop2", "crops", { seed_item_ids: ["seed2"], harvest_item_ids: ["pork"] })];
    const added = applyWorkflowAssistance(p([stock("seed")]), d, "seed", "plant:crop");
    added.plan.nodes[0].itemId = "seed2";
    const resolved = resolveIntent(added.plan, d).nodes.at(-1)!;
    expect(resolved.cropId).toBe("crop2");
    expect(resolved.label).toContain("crop2");
  });
  it("does not suggest recipes whose equipment or duration cannot be simulated", () => {
    const d = [...data, entity("unsupported", "processes", { inputs: [{ item_id: "pork", quantity: 1 }], output: { item_id: "bacon", quantity: 1 }, machine_ids: ["missing"], duration_minutes: 1440 })];
    expect(getWorkflowAssistance(p([stock()]), d, "pork").next.some(a => a.key === "process:unsupported")).toBe(false);
  });
  it("recomputes a later shortage after a one-time ingredient addition rather than buying silently", () => {
    const q = p([stock(), process()], [["pork", "work"]]);
    const added = applyWorkflowAssistance(q, data, "work", "stock:salt", simulatePlan(q, data));
    added.plan.nodes[0].quantity = 10;
    const need = options(added.plan, "work").inputs.find(i => i.itemId === "salt")!;
    expect(need.shortage).toBe(3);
    expect(added.plan.nodes.at(-1)?.quantity).toBe(7);
  });
  it("does not request ingredients already consumed by an existing in-progress batch", () => {
    const q = p([{ ...process(), remainingDays: 2, quantity: 7, amountMode: "manual" }]);
    expect(options(q, "work").inputs).toEqual([]);
    expect(options(q, "work").next.some(a => a.kind === "sale")).toBe(true);
  });
  it("shows actual per-batch sale value differences without treating unknown prices as zero", () => {
    const d = [...data,
      entity("gain", "processes", { inputs: [{ item_id: "pork", quantity: 2 }], output: { item_id: "bacon", quantity: 1 }, machine_ids: ["machine"], duration_minutes: 1440 }),
      entity("loss", "processes", { inputs: [{ item_id: "bacon", quantity: 1 }], output: { item_id: "pork", quantity: 1 }, machine_ids: ["machine"], duration_minutes: 1440 }),
    ];
    const actions = getWorkflowAssistance(p([stock()]), d, "pork").next;
    expect(actions.find(a => a.key === "process:gain")?.valueDelta).toBe(20);
    expect(actions.find(a => a.key === "process:recipe")?.valueDelta).toBeUndefined();
    expect(getWorkflowAssistance(p([stock("bacon")]), d, "bacon").next.find(a => a.key === "process:loss")?.valueDelta).toBe(-50);
  });
});
