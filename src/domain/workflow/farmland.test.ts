import { describe, it, expect } from "vitest";
import farmland from "../../../data/sources/game-farmland.json";
import { mapCell, sourceCell, farmlandPlots, farmlandUsage } from "./farmland";
import { node, plan, entities } from "./test-helpers";
import { simulatePlan } from "./simulate";
import { parsePlan } from "../workflowEditor";
describe("game map farmland orientation", () => {
  it("reads old selections and combines maps without duplicate or nonexistent cells", () => {
    const first = farmland.shapes[0],
      second = farmland.shapes[1];
    const a = { shapeId: first.id, cells: [first.cells[0].join(",")] };
    expect(farmlandPlots(a)).toEqual([a]);
    const value = {
      plots: [
        a,
        { ...a, cells: [...a.cells, "999,999"] },
        { shapeId: second.id, cells: [second.cells[0].join(",")] },
      ],
    };
    const parsed = parsePlan(
      JSON.stringify(plan([node("a", "plant", { farmlandSelection: value })])),
    );
    expect(farmlandPlots(parsed.nodes[0].farmlandSelection)).toHaveLength(2);
    expect(farmlandPlots(value).reduce((s, p) => s + p.cells.length, 0)).toBe(
      2,
    );
  });
  const setup = (start: number, repeat = false, regrow = false) => {
    const shape = farmland.shapes[0];
    const selection = { shapeId: shape.id, cells: [shape.cells[0].join(",")] };
    const a = node("a", "plant", {
      cropId: "crop",
      quantity: 1,
      startDay: 1,
      dateMode: "manual",
      amountMode: "manual",
      repeat,
      autoBuy: true,
      farmlandSelection: selection,
    });
    const b = node("b", "plant", {
      cropId: "crop",
      seasonProtection: true,
      quantity: 1,
      startDay: start,
      dateMode: "manual",
      amountMode: "manual",
      farmlandSelection: { plots: [selection] },
    });
    const p = plan(
      [
        node("sa", "inventory", { itemId: "seed", quantity: 1, startDay: 1 }),
        node("sb", "inventory", { itemId: "seed", quantity: 1, startDay: 1 }),
        a,
        b,
      ],
      [
        ["sa", "a"],
        ["sb", "b"],
      ],
      { startDay: 1, days: 28, planningMode: "intent" },
    );
    const catalog = regrow
      ? entities.map((e) => (e.id === "crop" ? { ...e, regrow_days: 3 } : e))
      : entities;
    return {
      p,
      b,
      catalog,
      shape,
      selection,
      result: simulatePlan(p, catalog),
    };
  };
  it("warns about concurrent use but allows harvest-day reuse and excludes itself", () => {
    for (const [day, status] of [
      [2, "conflict"],
      [4, "separate"],
    ] as const) {
      const { p, b, catalog, result, shape, selection } = setup(day);
      const uses = farmlandUsage(p, b, result, catalog)
        .occupied.get(shape.id)!
        .get(selection.cells[0])!;
      expect(uses).toHaveLength(1);
      expect(uses[0]).toMatchObject({ nodeId: "a", status });
    }
  });
  it("accounts for automatic replanting and regrowing plants holding land after last harvest", () => {
    for (const [day, repeat, regrow] of [
      [4, true, false],
      [27, false, true],
    ] as const) {
      const { p, b, catalog, result, shape, selection } = setup(
        day,
        repeat,
        regrow,
      );
      expect(
        farmlandUsage(p, b, result, catalog)
          .occupied.get(shape.id)!
          .get(selection.cells[0])![0].status,
      ).toBe("conflict");
    }
  });
  it("marks unscheduled allocations as unknown and keeps map identities separate", () => {
    const { p, b, catalog, shape, selection } = setup(2);
    const use = farmlandUsage(p, b, undefined, catalog);
    expect(use.occupied.get(shape.id)!.get(selection.cells[0])![0].status).toBe(
      "unknown",
    );
    expect(use.occupied.has(farmland.shapes[1].id)).toBe(false);
  });
  it("puts the irregular field notch at bottom right, preserving its 437 cells", () => {
    const s = farmland.shapes.find((s) => s.count === 437)!;
    const cells = new Set(
      s.cells.map(([x, y]) => mapCell(x, y, s.height).join(",")),
    );
    expect(cells.size).toBe(437);
    expect(cells.has("0,0")).toBe(true);
    expect(cells.has(`${s.height - 1},0`)).toBe(true);
    expect(cells.has(`0,${s.width - 1}`)).toBe(true);
    expect(cells.has(`${s.height - 1},${s.width - 1}`)).toBe(false);
  });
  it("round trips saved selections for every extracted shape without mirroring", () => {
    for (const s of farmland.shapes)
      for (const [x, y] of s.cells) {
        const [mx, my] = mapCell(x, y, s.height);
        expect(sourceCell(mx, my, s.height)).toEqual([x, y]);
      }
  });
});
