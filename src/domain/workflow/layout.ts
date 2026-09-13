import type { WorkflowPlan } from "./types";

type Size = { width: number; height: number };
type Point = { x: number; y: number };
type Graph = Pick<WorkflowPlan, "nodes" | "edges">;

/** Follow upstream and downstream independently, without jumping into sibling branches. */
export function traceSelection(graph: Graph, selected: string[]) {
  const nodes = new Set(
    selected.filter((id) => graph.nodes.some((n) => n.id === id)),
  );
  const edges = new Set<string>();
  for (const direction of ["up", "down"] as const) {
    const queue = [...nodes].filter((id) => selected.includes(id));
    const seen = new Set(queue);
    for (const id of queue) {
      for (const edge of graph.edges) {
        if ((direction === "up" ? edge.target : edge.source) !== id) continue;
        edges.add(edge.id);
        const next = direction === "up" ? edge.source : edge.target;
        nodes.add(next);
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
  }
  return { nodes, edges, active: selected.length > 0 };
}

/** Layer each connected component, then pack components to match the canvas aspect. */
export function layoutWorkflow(
  graph: Graph,
  sizes = new Map<string, Size>(),
  aspect = 1.6,
) {
  const ids = new Set(graph.nodes.map((n) => n.id));
  const adjacency = new Map([...ids].map((id) => [id, [] as string[]]));
  const incoming = new Map([...ids].map((id) => [id, [] as string[]]));
  const outgoing = new Map([...ids].map((id) => [id, [] as string[]]));
  for (const e of graph.edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    adjacency.get(e.source)!.push(e.target);
    adjacency.get(e.target)!.push(e.source);
    incoming.get(e.target)!.push(e.source);
    outgoing.get(e.source)!.push(e.target);
  }
  const size = (id: string) => sizes.get(id) ?? { width: 264, height: 260 };
  const remaining = new Set(ids);
  const groups: Array<{
    ids: string[];
    width: number;
    height: number;
    positions: Map<string, Point>;
  }> = [];
  while (remaining.size) {
    const members = [remaining.values().next().value!];
    remaining.delete(members[0]);
    for (const id of members)
      for (const next of adjacency.get(id)!)
        if (remaining.delete(next)) members.push(next);
    const depths = new Map<string, number>();
    const pending = new Set(members);
    while (pending.size) {
      let advanced = false;
      for (const id of pending) {
        const parents = incoming.get(id)!;
        if (parents.some((p) => pending.has(p))) continue;
        depths.set(
          id,
          Math.max(0, ...parents.map((p) => (depths.get(p) ?? 0) + 1)),
        );
        pending.delete(id);
        advanced = true;
      }
      // Imported plans normally reject cycles; still ensure layout always terminates.
      if (!advanced) {
        for (const id of pending) depths.set(id, 0);
        break;
      }
    }
    const layers = Array.from(
      { length: Math.max(...depths.values()) + 1 },
      () => [] as string[],
    );
    members.forEach((id) => layers[depths.get(id)!].push(id));
    const order = new Map<string, number>();
    const refresh = () =>
      layers.forEach((layer) => layer.forEach((id, i) => order.set(id, i)));
    refresh();
    // Alternating barycentre sweeps put producers beside the branch they feed.
    for (let pass = 0; pass < 4; pass++) {
      const forward = pass % 2 === 0;
      for (const layer of forward ? layers : [...layers].reverse()) {
        const score = (id: string) => {
          const neighbors = (forward ? incoming : outgoing).get(id)!;
          return neighbors.length
            ? neighbors.reduce((s, n) => s + order.get(n)!, 0) /
                neighbors.length
            : order.get(id)!;
        };
        layer.sort((a, b) => score(a) - score(b));
        refresh();
      }
    }
    const heights = layers.map(
      (layer) =>
        layer.reduce((s, id) => s + size(id).height, 0) +
        (layer.length - 1) * 48,
    );
    const height = Math.max(...heights);
    const positions = new Map<string, Point>();
    let x = 0;
    layers.forEach((layer, i) => {
      let y = (height - heights[i]) / 2;
      for (const id of layer) {
        positions.set(id, { x, y });
        y += size(id).height + 48;
      }
      x += Math.max(...layer.map((id) => size(id).width)) + 110;
    });
    groups.push({ ids: members, width: x - 110, height, positions });
  }
  if (!groups.length) return { nodes: graph.nodes, groupCount: 0 };
  const gap = 140;
  const maxWidth = Math.max(...groups.map((g) => g.width));
  const totalWidth = groups.reduce((s, g) => s + g.width + gap, -gap);
  const targetAspect = Math.max(0.6, Math.min(2.4, aspect));
  let best: { score: number; positions: Map<string, Point> } | undefined;
  // Evaluate shelf widths instead of imposing one infinitely tall global column.
  for (let sample = 0; sample <= 40; sample++) {
    const limit = maxWidth + ((totalWidth - maxWidth) * sample) / 40;
    let x = 0,
      y = 0,
      rowHeight = 0,
      width = 0;
    const positions = new Map<string, Point>();
    for (const group of groups) {
      if (x && x + group.width > limit) {
        y += rowHeight + gap;
        x = 0;
        rowHeight = 0;
      }
      for (const [id, p] of group.positions)
        positions.set(id, { x: 100 + x + p.x, y: 80 + y + p.y });
      width = Math.max(width, x + group.width);
      rowHeight = Math.max(rowHeight, group.height);
      x += group.width + gap;
    }
    const height = y + rowHeight;
    const score =
      Math.max(width / targetAspect, height) ** 2 + width * height * 0.15;
    if (!best || score < best.score) best = { score, positions };
  }
  return {
    nodes: graph.nodes.map((n) => ({
      ...n,
      position: best!.positions.get(n.id)!,
    })),
    groupCount: groups.length,
  };
}
