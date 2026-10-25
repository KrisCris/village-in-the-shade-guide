import { describe, it, expect } from "vitest";
import farmland from "../../../data/sources/game-farmland.json";
import {
  mapCell,
  sourceCell,
  farmlandPlots,
  farmlandUsage,
  farmlandShapes,
} from "./farmland";
import { node, plan, entities } from "./test-helpers";
import { simulatePlan } from "./simulate";
import { parsePlan } from "../workflowEditor";
describe("game map farmland orientation", () => {
  it("folds internal mirrored greenhouse terrain into the regular map without losing cells", () => {
    expect(farmlandShapes.some((s) => s.id.includes("_mirror"))).toBe(false);
    for (const mirror of farmland.shapes.filter((s) =>
      s.id.includes("_mirror"),
    )) {
      const selection = {
        shapeId: mirror.id,
        cells: mirror.cells.map((c) => c.join(",")),
      };
      const plots = farmlandPlots(selection);
      expect(plots[0].shapeId).toBe(mirror.id.replace("_mirror", ""));
      expect(plots[0].cells).toHaveLength(mirror.count);
    }
  });
  it("merges duplicate greenhouse selections and migrates map-derived quantities once", () => {
    const regular = farmland.shapes.find(
      (s) => s.count === 100 && !s.id.includes("_mirror"),
    )!;
    const mirror = farmland.shapes.find(
      (s) => s.count === 100 && s.id.includes("_mirror"),
    )!;
    const selection = {
      plots: [regular, mirror].map((s) => ({
        shapeId: s.id,
        cells: s.cells.map((c) => c.join(",")),
      })),
    };
    const parsed = parsePlan(
      JSON.stringify(
        plan([
          node("p", "plant", {
            quantity: 200,
            amountMode: "manual",
            farmlandSelection: selection,
          }),
        ]),
      ),
    );
    expect(parsed.nodes[0].quantity).toBe(100);
    expect(farmlandPlots(parsed.nodes[0].farmlandSelection)).toHaveLength(1);
    expect(parsePlan(JSON.stringify(parsed))).toEqual(parsed);
  });
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
  const setup = (start: number, repeat = false, regrow = false, perennial = false) => {
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
    const catalog = entities.map((e) =>
      e.id !== "crop"
        ? e
        : regrow
          ? { ...e, regrow_days: 3 }
          : perennial
            ? { ...e, perennial: { kind: "shrub" as const, bearing_seasons: ["summer"], rebear_points: 200, rebear_days: 2 } }
            : e,
    );
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
  it("keeps a perennial's plot taken after planting, even with no harvest in the plan", () => {
    const { p, b, catalog, result, shape, selection } = setup(20, false, false, true);
    expect(result.events.some((e) => e.nodeId === "a" && e.kind === "harvest")).toBe(false);
    expect(
      farmlandUsage(p, b, result, catalog).occupied.get(shape.id)!.get(selection.cells[0])![0],
    ).toMatchObject({ nodeId: "a", status: "conflict", spans: [{ start: 1, end: Infinity }] });
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
  it("moves build 24969282 outdoor selections onto the renumbered ver120 terrain", () => {
    const outdoor = farmland.legacy_shapes.filter(
      (s) => !farmland.shapes.some((c) => c.id === s.id),
    );
    expect(outdoor.length).toBeGreaterThan(0);
    for (const old of outdoor) {
      const plots = farmlandPlots({
        shapeId: old.id,
        cells: old.cells.map((c) => c.join(",")),
      });
      // Every old cell is still farmable, so none may be dropped or duplicated.
      expect(plots.reduce((n, p) => n + p.cells.length, 0)).toBe(old.cells.length);
      for (const plot of plots) {
        const shape = farmland.shapes.find((s) => s.id === plot.shapeId)!;
        expect(shape.map_ids.some((id) => old.map_ids.includes(id))).toBe(true);
        const absolute = new Set(old.cells.map(([x, y]) => `${x + old.origin[0]},${y + old.origin[1]}`));
        for (const cell of plot.cells) {
          const [x, y] = cell.split(",").map(Number);
          expect(absolute.has(`${x + shape.origin[0]},${y + shape.origin[1]}`)).toBe(true);
        }
      }
    }
    expect(farmlandPlots({ shapeId: outdoor[0].id, cells: ["-9,-9"] })).toEqual([]);
  });
  it("round trips saved selections for every extracted shape without mirroring", () => {
    for (const s of farmland.shapes)
      for (const [x, y] of s.cells) {
        const [mx, my] = mapCell(x, y, s.height);
        expect(sourceCell(mx, my, s.height)).toEqual([x, y]);
      }
  });
});
