import { describe, it, expect } from "vitest";
import farmland from "../../../data/sources/game-farmland.json";
import { mapCell, sourceCell } from "./farmland";
describe("game map farmland orientation", () => {
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
