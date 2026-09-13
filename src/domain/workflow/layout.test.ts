import { describe, it, expect } from "vitest";
import { layoutWorkflow, traceSelection } from "./layout";
import { node, plan } from "./test-helpers";

describe("workflow arrangement and focus", () => {
  it("packs many separate delivery chains into multiple rows and columns without overlap", () => {
    const nodes = [],
      pairs: string[][] = [];
    for (let i = 0; i < 24; i++) {
      nodes.push(node(`d${i}`, "delivery"));
      for (let j = 0; j < 3; j++) {
        nodes.push(node(`b${i}-${j}`, "purchase"), node(`p${i}-${j}`, "plant"));
        pairs.push([`b${i}-${j}`, `p${i}-${j}`], [`p${i}-${j}`, `d${i}`]);
      }
    }
    const graph = plan(nodes, pairs);
    const arranged = layoutWorkflow(graph);
    expect(arranged.groupCount).toBe(24);
    const positions = new Map(arranged.nodes.map((n) => [n.id, n.position]));
    for (const e of graph.edges)
      expect(positions.get(e.source)!.x).toBeLessThan(
        positions.get(e.target)!.x,
      );
    for (let i = 0; i < arranged.nodes.length; i++)
      for (let j = i + 1; j < arranged.nodes.length; j++) {
        const a = arranged.nodes[i].position,
          b = arranged.nodes[j].position;
        expect(
          a.x + 264 <= b.x ||
            b.x + 264 <= a.x ||
            a.y + 260 <= b.y ||
            b.y + 260 <= a.y,
        ).toBe(true);
      }
    const roots = arranged.nodes.filter((n) => n.id.startsWith("b"));
    expect(new Set(roots.map((n) => n.position.x)).size).toBeGreaterThan(1);
    expect(Math.max(...arranged.nodes.map((n) => n.position.y))).toBeLessThan(
      7000,
    );
    expect(layoutWorkflow({ ...graph, nodes: arranged.nodes }).nodes).toEqual(
      arranged.nodes,
    );
    expect(
      graph.nodes.every((n) => n.position.x === 0 && n.position.y === 0),
    ).toBe(true);
  });
  it("uses actual card heights and keeps isolated nodes separate from connected chains", () => {
    const graph = plan(
      [
        node("a", "inventory"),
        node("b", "inventory"),
        node("d", "delivery"),
        node("alone", "sale"),
      ],
      [
        ["a", "d"],
        ["b", "d"],
      ],
    );
    const sizes = new Map([
      ["a", { width: 264, height: 440 }],
      ["b", { width: 264, height: 320 }],
    ]);
    const result = layoutWorkflow(graph, sizes);
    const a = result.nodes[0].position,
      b = result.nodes[1].position;
    expect(Math.abs(a.y - b.y)).toBeGreaterThanOrEqual(a.y < b.y ? 440 : 320);
    expect(result.groupCount).toBe(2);
  });
  it("traces complete ancestors and descendants without unrelated sibling branches", () => {
    const graph = plan(
      ["seed", "plant", "process", "sale", "other", "salt"].map((id) =>
        node(id, "inventory"),
      ),
      [
        ["seed", "plant"],
        ["plant", "process"],
        ["process", "sale"],
        ["plant", "other"],
        ["salt", "process"],
      ],
    );
    const result = traceSelection(graph, ["process"]);
    expect([...result.nodes].sort()).toEqual([
      "plant",
      "process",
      "sale",
      "salt",
      "seed",
    ]);
    expect(result.edges.has("3")).toBe(false);
    expect(result.edges.size).toBe(4);
    expect(traceSelection(graph, []).active).toBe(false);
    expect(traceSelection(graph, ["other", "process"]).nodes.size).toBe(6);
  });
  it("handles an empty plan and terminates on a defensive cyclic input", () => {
    expect(layoutWorkflow(plan([])).nodes).toEqual([]);
    const graph = plan(
      [node("a", "inventory"), node("b", "sale")],
      [
        ["a", "b"],
        ["b", "a"],
      ],
    );
    expect(layoutWorkflow(graph).nodes).toHaveLength(2);
    expect(traceSelection(graph, ["a"]).edges.size).toBe(2);
  });
});
