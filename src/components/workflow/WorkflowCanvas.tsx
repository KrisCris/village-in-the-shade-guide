import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  applyNodeChanges,
  Background,
  MiniMap,
  ReactFlow,
  SelectionMode,
  type Connection,
  type Edge,
  type NodeChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import WorkflowCard, { type FlowNode } from "./WorkflowCard";
import type { NodeKind } from "../../domain/workflow/types";

const nodeTypes = { operation: WorkflowCard };
const multiKeys = ["Control", "Meta", "Shift"];
type Props = {
  nodes: FlowNode[];
  edges: Edge[];
  mode: "hand" | "select";
  flow: RefObject<ReactFlowInstance<FlowNode> | null>;
  onSelect: (changes: NodeChange<FlowNode>[]) => void;
  onEdgesSelect: (ids: string[]) => void;
  onCommit: (nodes: FlowNode[]) => void;
  onConnect: (c: Pick<Connection, "source" | "target">) => void;
  isValid: (c: Connection | Edge) => boolean;
  onInspect: (id: string) => void;
  onDropNode: (kind: NodeKind, position: { x: number; y: number }) => void;
  onZoom: (zoom: number) => void;
};

/** Pointer movement belongs to the canvas. A complete gesture is one plan edit. */
export default memo(function WorkflowCanvas({
  nodes,
  edges,
  mode,
  flow,
  onSelect,
  onEdgesSelect,
  onCommit,
  onConnect,
  isValid,
  onInspect,
  onDropNode,
  onZoom,
}: Props) {
  const [liveNodes, setLiveNodes] = useState(nodes);
  const [fitOptions] = useState(() => ({
    maxZoom: 1,
    padding: 0.18,
    nodes: nodes.some((n) => !n.data.node.sourceId)
      ? nodes.filter((n) => !n.data.node.sourceId).map((n) => ({ id: n.id }))
      : undefined,
  }));
  const live = useRef(nodes);
  useEffect(() => {
    const previous = new Map(live.current.map((n) => [n.id, n]));
    const next = nodes.map((n) => {
      const old = previous.get(n.id);
      return old
        ? { ...old, ...n, position: old.dragging ? old.position : n.position }
        : n;
    });
    live.current = next;
    setLiveNodes(next);
  }, [nodes]);
  const onChanges = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      const next = applyNodeChanges(changes, live.current);
      live.current = next;
      setLiveNodes(next);
      if (changes.some((c) => c.type === "select")) onSelect(changes);
      // One final position change covers mouse, touch, group drags and arrow keys.
      const finished = new Set(
        changes
          .filter((c) => c.type === "position" && !c.dragging)
          .map((c) => ("id" in c ? c.id : "")),
      );
      if (finished.size) onCommit(next.filter((n) => finished.has(n.id)));
    },
    [onSelect, onCommit],
  );
  return (
    <ReactFlow<FlowNode>
      nodes={liveNodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onInit={(instance) => {
        flow.current = instance;
        onZoom(instance.getZoom());
      }}
      onNodesChange={onChanges}
      onEdgesChange={(changes) => {
        if (!changes.some((c) => c.type === "select")) return;
        const ids = new Set(edges.filter((e) => e.selected).map((e) => e.id));
        for (const c of changes)
          if (c.type === "select")
            c.selected ? ids.add(c.id) : ids.delete(c.id);
        onEdgesSelect([...ids]);
      }}
      onNodeClick={(_, node) => onInspect(node.id)}
      onConnect={onConnect}
      isValidConnection={isValid}
      selectionOnDrag={mode === "select"}
      selectionMode={SelectionMode.Partial}
      panOnDrag={mode === "hand" ? true : [1, 2]}
      panActivationKeyCode="Space"
      selectionKeyCode="Shift"
      multiSelectionKeyCode={multiKeys}
      deleteKeyCode={null}
      fitView
      fitViewOptions={fitOptions}
      minZoom={0.2}
      maxZoom={2}
      onMoveEnd={(_, viewport) => onZoom(viewport.zoom)}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        e.preventDefault();
        const kind = e.dataTransfer.getData(
          "application/village-node",
        ) as NodeKind;
        if (
          [
            "purchase",
            "inventory",
            "plant",
            "process",
            "reserve",
            "delivery",
            "consume",
            "sale",
          ].includes(kind)
        ) {
          const position = flow.current?.screenToFlowPosition({
            x: e.clientX,
            y: e.clientY,
          });
          if (position)
            onDropNode(kind, { x: position.x - 132, y: position.y - 40 });
        }
      }}
      aria-label="生产流程画布"
    >
      <Background color="var(--wf-grid)" gap={24} size={1} />
      <MiniMap
        pannable
        zoomable
        nodeColor="var(--green)"
        maskColor="var(--wf-map-mask)"
      />
    </ReactFlow>
  );
});
