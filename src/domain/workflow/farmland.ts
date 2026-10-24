import data from "../../../data/sources/game-farmland.json";
import type { Entity } from "../../data/types";
import type {
  FarmlandSelection,
  FarmlandPlotSelection,
  WorkflowPlan,
  WorkflowNode,
  SimulationResult,
} from "./types";

/** Rotate farming axes clockwise into the game's map-facing orientation.
 * Saved cells remain in extraction coordinates so old selections stay attached
 * to the same ground. This is a rotation, never a mirrored/recounted shape.
 */
export const mapCell = (
  x: number,
  y: number,
  height: number,
): [number, number] => [height - 1 - y, x];
export const sourceCell = (
  x: number,
  y: number,
  height: number,
): [number, number] => [y, height - 1 - x];

const validCells = new Map(
  data.shapes.map((s) => [s.id, new Set(s.cells.map((c) => c.join(",")))]),
);
// map.dat labels MAP_ID_GREENHOUSE_01_MIRROR as 温室_01(反転).
// Its normalized terrain maps onto the regular greenhouse by transposing axes.
// It is an internal orientation variant, not additional capacity in the planner.
const aliases = new Map(
  data.shapes
    .filter((s) => s.map_ids.includes("MAP_ID_GREENHOUSE_01_MIRROR"))
    .map((s) => [s.id, s.id.replace("_mirror", "")]),
);
export const farmlandShapes = data.shapes.filter((s) => !aliases.has(s.id));
// Build 25311578 renamed the openworld terrain (map_0000_ver120_*) and added
// fields, renumbering outdoor shape IDs. Saved plots from build 24969282 move
// through absolute terrain cells into the current shape that contains them.
const legacyShapes = new Map(
  data.legacy_shapes
    .filter((s) => !validCells.has(s.id))
    .map((s) => [s.id, s]),
);
function currentPlots(plot: FarmlandPlotSelection): FarmlandPlotSelection[] {
  const legacy = legacyShapes.get(plot.shapeId);
  if (!legacy) return [plot];
  const known = new Set(legacy.cells.map((c) => c.join(",")));
  const moved = new Map<string, string[]>();
  for (const cell of plot.cells) {
    if (!known.has(cell)) continue;
    const [x, y] = cell.split(",").map(Number);
    const ax = x + legacy.origin[0],
      ay = y + legacy.origin[1];
    const target = data.shapes.find(
      (s) =>
        s.map_ids.some((id) => legacy.map_ids.includes(id)) &&
        validCells.get(s.id)!.has(`${ax - s.origin[0]},${ay - s.origin[1]}`),
    );
    if (target)
      moved.set(target.id, [
        ...(moved.get(target.id) ?? []),
        `${ax - target.origin[0]},${ay - target.origin[1]}`,
      ]);
  }
  return [...moved].map(([shapeId, cells]) => ({ shapeId, cells }));
}
/** Read legacy single-map selections and canonicalize multi-map selections. */
export function farmlandPlots(
  value?: FarmlandSelection,
): FarmlandPlotSelection[] {
  const plots = new Map<string, Set<string>>();
  for (const plot of (value ? ("plots" in value ? value.plots : [value]) : []).flatMap(currentPlots)) {
    const shapeId = aliases.get(plot.shapeId) ?? plot.shapeId;
    const valid = validCells.get(shapeId);
    if (!valid) continue;
    const cells = plots.get(shapeId) ?? new Set<string>();
    for (const cell of plot.cells) {
      if (!validCells.get(plot.shapeId)?.has(cell)) continue;
      const canonical = aliases.has(plot.shapeId)
        ? cell.split(",").reverse().join(",")
        : cell;
      if (valid.has(canonical)) cells.add(canonical);
    }
    if (cells.size) plots.set(shapeId, cells);
  }
  return [...plots].map(([shapeId, cells]) => ({ shapeId, cells: [...cells] }));
}

type Span = { start: number; end: number };
export type FarmlandUse = {
  nodeId: string;
  label: string;
  status: "conflict" | "separate" | "unknown";
  spans: Span[];
};
export function farmlandUsage(
  plan: WorkflowPlan,
  node: WorkflowNode,
  result: SimulationResult | undefined,
  entities: Entity[],
) {
  const spans = (n: WorkflowNode): Span[] => {
    if (!result) return [];
    const work = result.days.flatMap((d) =>
      (d.inProgress ?? [])
        .filter(
          (j) => j.nodeId === n.id && j.kind === "plant" && j.finishDay > d.day,
        )
        .map((j) => ({ start: d.day, end: j.finishDay })),
    );
    const resolved =
      result.intent?.resolvedNodes.find((r) => r.id === n.id) ?? n;
    const crop = entities.find((e) => e.id === resolved.cropId);
    // Shrubs and fruit trees never leave their plots once planted.
    const planted = result.intent?.nodes[n.id]?.firstDay;
    if (crop?.perennial && planted !== undefined)
      return [{ start: planted, end: Infinity }];
    // Regrowing crops keep their plots after the last harvest until season end.
    if (Number(crop?.regrow_days) > 0 && work.length) {
      const last = Math.max(...work.map((s) => s.end));
      work.push({
        start: last,
        end: n.seasonProtection
          ? Math.max(last, plan.startDay + plan.days)
          : Math.ceil(last / 28) * 28 + 1,
      });
    }
    return work;
  };
  const own = spans(node);
  const occupied = new Map<string, Map<string, FarmlandUse[]>>();
  let unmapped = 0;
  for (const other of plan.nodes) {
    if (other.id === node.id || other.kind !== "plant") continue;
    const plots = farmlandPlots(other.farmlandSelection);
    if (!plots.length) {
      unmapped++;
      continue;
    }
    const otherSpans = spans(other);
    const status =
      !own.length || !otherSpans.length
        ? "unknown"
        : own.some((a) =>
              otherSpans.some((b) => a.start < b.end && b.start < a.end),
            )
          ? "conflict"
          : "separate";
    const use: FarmlandUse = {
      nodeId: other.id,
      label:
        result?.intent?.resolvedNodes.find((n) => n.id === other.id)?.label ??
        other.label,
      status,
      spans: otherSpans,
    };
    for (const plot of plots) {
      const cells =
        occupied.get(plot.shapeId) ?? new Map<string, FarmlandUse[]>();
      for (const cell of plot.cells)
        cells.set(cell, [...(cells.get(cell) ?? []), use]);
      occupied.set(plot.shapeId, cells);
    }
  }
  return { occupied, unmapped };
}
