import { describe, it, expect } from "vitest";
import { addConnectedNode, demandRows, prepareDemand } from "./editing";
import { entity, entities, node, plan } from "./test-helpers";
import { simulatePlan } from "./simulate";
import { resolveIntent } from "./intent";
import { selectableEntity } from "./catalog";
const intent = (nodes: Parameters<typeof plan>[0], pairs: string[][] = []) =>
  plan(nodes, pairs, { planningMode: "intent", startDay: 1, days: 28 });
describe("workflow editing", () => {
  it("reserves existing output before an automatic sale without duplicating production", () => {
    const p = intent(
      [
        node("stock", "inventory", { itemId: "pork", quantity: 8 }),
        node("sale", "sale", { itemId: "pork", amountMode: "auto" }),
        node("d", "delivery", {
          requirements: [{ itemId: "pork", quantity: 3 }],
        }),
      ],
      [["stock", "sale"]],
    );
    const next = prepareDemand(p, entities, "d", simulatePlan(p, entities), {
      x: 0,
      y: 0,
    });
    expect(next.plan.nodes).toHaveLength(3);
    const result = simulatePlan(next.plan, entities);
    expect(demandRows(next.plan.nodes[2], result, 28)[0].held).toBe(3);
    expect(result.intent?.nodes.sale.quantity).toBe(5);
  });
  it("inserts atomically and allows downstream sale to follow the new output", () => {
    const p = intent(
      [
        node("stock", "inventory", { itemId: "pork" }),
        node("sale", "sale", { itemId: "pork", amountMode: "auto" }),
      ],
      [["stock", "sale"]],
    );
    const added = addConnectedNode(
      p,
      entities,
      "process",
      { x: 150, y: 200 },
      { edgeId: "0" },
    );
    expect(p.edges).toHaveLength(1);
    expect(added.plan.edges).toHaveLength(2);
    expect(
      added.plan.nodes.find((n) => n.id === "sale")?.itemId,
    ).toBeUndefined();
    const r = resolveIntent(added.plan, entities);
    expect(r.nodes.find((n) => n.id === added.addedId)?.recipeId).toBe(
      "recipe",
    );
    expect(r.nodes.find((n) => n.id === "sale")?.itemId).toBe("bacon");
    expect(added.plan.nodes.at(-1)?.position).toEqual({ x: 150, y: 200 });
  });
  it("rejects terminal nodes in the middle without mutating the graph", () => {
    const p = intent(
      [node("a", "inventory", { itemId: "pork" }), node("b", "sale")],
      [["a", "b"]],
    );
    expect(() =>
      addConnectedNode(p, entities, "sale", { x: 0, y: 0 }, { edgeId: "0" }),
    ).toThrow();
    expect(p.nodes).toHaveLength(2);
  });
  it("cannot uniquely reset stock feeding a multi-input recipe", () => {
    const p = intent(
      [node("a", "inventory"), node("b", "process", { recipeId: "recipe" })],
      [["a", "b"]],
    );
    expect(resolveIntent(p, entities).nodes[0].itemId).toBeUndefined();
  });
  it("separates current holdings, future fulfillment and remaining shortage", () => {
    const n = node("d", "delivery", {
      requirements: [{ itemId: "pork", quantity: 5 }],
    });
    const p = intent(
      [
        node("a", "inventory", {
          itemId: "pork",
          quantity: 2,
          startDay: 1,
          dateMode: "manual",
        }),
        node("b", "inventory", {
          itemId: "pork",
          quantity: 2,
          startDay: 5,
          dateMode: "manual",
        }),
        n,
      ],
      [
        ["a", "d"],
        ["b", "d"],
      ],
    );
    const r = simulatePlan(p, entities);
    expect(demandRows(n, r, 1)[0]).toMatchObject({
      held: 2,
      planned: 4,
      shortage: 1,
      readyDay: undefined,
    });
  });
  it("generates a crop chain only for the gap and does not duplicate a complete plan", () => {
    const p = intent([
      node("d", "delivery", {
        requirements: [{ itemId: "crop-item", quantity: 12 }],
      }),
    ]);
    const next = prepareDemand(p, entities, "d", simulatePlan(p, entities), {
      x: 100,
      y: 100,
    });
    expect(next.plan.nodes.find((n) => n.kind === "plant")?.quantity).toBe(3);
    expect(next.plan.nodes.find((n) => n.kind === "purchase")?.quantity).toBe(
      3,
    );
    const r = simulatePlan(next.plan, entities);
    expect(r.intent?.nodes.d.readyDay).toBe(4);
    expect(
      prepareDemand(next.plan, entities, "d", r, { x: 0, y: 0 }).plan.nodes,
    ).toHaveLength(3);
  });
  it("unknown sources remain unconfirmed and repeated preparation adds no duplicate", () => {
    const p = intent([
      node("d", "delivery", {
        requirements: [{ itemId: "bacon", quantity: 4 }],
      }),
    ]);
    const next = prepareDemand(p, entities, "d", simulatePlan(p, entities), {
      x: 0,
      y: 0,
    });
    expect(next.unresolved).toContain("pork");
    const r = simulatePlan(next.plan, entities);
    expect(r.intent?.nodes.d.readyDay).toBeUndefined();
    expect(
      prepareDemand(next.plan, entities, "d", r, { x: 0, y: 0 }).plan.nodes,
    ).toHaveLength(next.plan.nodes.length);
  });
  it("keeps placeable small objects but filters wardrobe unlocks", () => {
    expect(
      selectableEntity(
        entity("hat", "items", { category_id: "ITEM_CATEGORY_ORNAMENTS" }),
      ),
    ).toBe(false);
    expect(
      selectableEntity(
        entity("vase", "items", { category_id: "ITEM_CATEGORY_ACCESSORIES" }),
      ),
    ).toBe(true);
  });
  it("season protection allows a chosen crop outside its normal season", () => {
    const data = entities.map((e) =>
      e.kind === "crops" ? { ...e, seasons: ["winter"] } : e,
    );
    const p = intent(
      [
        node("s", "inventory", { itemId: "seed", quantity: 10 }),
        node("c", "plant", { cropId: "crop", seasonProtection: true }),
      ],
      [["s", "c"]],
    );
    const r = simulatePlan(p, data);
    expect(r.intent?.nodes.c.land).toBe(10);
    expect(r.intent?.nodes.c.outputQuantity).toBe(50);
  });
});
