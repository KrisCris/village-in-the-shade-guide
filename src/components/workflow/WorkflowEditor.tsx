import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  type NodeChange,
  type Connection,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./workflow.css";
import type { Entity } from "../../data/types";
import type {
  NodeKind,
  WorkflowNode,
  WorkflowPlan,
  WorkflowEdge,
} from "../../domain/workflow/types";
import {
  createPlan,
  createDemandNodes,
  copySelection,
  newNode,
  nodeLabels,
  parsePlan,
  uid,
} from "../../domain/workflowEditor";
import { simulatePlan } from "../../domain/workflow/simulate";
import { canConnect } from "../../domain/workflow/graph";
import {
  canConnectDraft,
  resolveIntent,
  autoAmount,
} from "../../domain/workflow/intent";
import { formatDay, seasonAt } from "../../domain/workflow/date";
import { withBase } from "../../lib/sitePath";
import NodeInspector from "./NodeInspector";
import PlanResources from "./PlanResources";
import { type FlowNode } from "./WorkflowCard";
import WorkflowCanvas from "./WorkflowCanvas";
import WorkflowTimeline from "./WorkflowTimeline";
import WorkflowIcon from "./WorkflowIcon";
import WorkflowPanel from "./WorkflowPanel";
import { EntityPicker } from "./fields";

const STORAGE = "village-production-plan-v1";
function load(entities: Entity[]) {
  try {
    const saved = localStorage.getItem(STORAGE);
    const plan = saved ? parsePlan(saved) : createPlan(entities);
    const migrated = !!saved && !JSON.parse(saved).planningMode;
    if (migrated && !localStorage.getItem(`${STORAGE}-before-intent`)) {
      try {
        localStorage.setItem(`${STORAGE}-before-intent`, saved!);
      } catch {
        /* Existing import remains usable when backup storage is full. */
      }
    }
    return {
      plan,
      error: "",
      migrationNotice: migrated
        ? "旧方案已升级，保留手动日期、数量及机器设置。可在节点中恢复自动跟随上游；"
        : "",
    };
  } catch {
    return {
      plan: createPlan(entities),
      error:
        "已保存的计划无法读取。原记录暂未覆盖；可导入备份，或编辑当前新计划。",
    };
  }
}
export default function WorkflowEditor({ entities }: { entities: Entity[] }) {
  const [initial] = useState(() => load(entities));
  const [plan, setPlan] = useState(initial.plan);
  const [hasLegacyBackup] = useState(() => {
    try {
      return !!localStorage.getItem(`${STORAGE}-before-intent`);
    } catch {
      return false;
    }
  });
  const [notice, setNotice] = useState(
    initial.error || initial.migrationNotice || "",
  );
  const [saveBlocked, setSaveBlocked] = useState(!!initial.error);
  const [saveStatus, setSaveStatus] = useState("");
  const [past, setPast] = useState<WorkflowPlan[]>([]),
    [future, setFuture] = useState<WorkflowPlan[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedEdges, setSelectedEdges] = useState<string[]>([]);
  const [day, setDay] = useState(plan.startDay);
  const [source, setSource] = useState(""),
    [target, setTarget] = useState("");
  const [cropChoice, setCropChoice] = useState("");
  const [panel, setPanel] = useState<
    "nodes" | "resources" | "connections" | "help" | null
  >(() => (window.innerWidth > 700 ? "nodes" : null));
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(340);
  const [mode, setMode] = useState<"hand" | "select">("hand");
  const [zoom, setZoom] = useState(1);
  const [nodeQuery, setNodeQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const app = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const clipboard = useRef<Pick<WorkflowPlan, "nodes" | "edges"> | null>(null);
  const [hasClipboard, setHasClipboard] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const flow = useRef<ReactFlowInstance<FlowNode> | null>(null);
  const previousCount = useRef(plan.nodes.length);
  const frameNodes = (next: WorkflowNode[]) => {
    const production = next.filter((n) => !n.sourceId);
    flow.current?.fitView({
      nodes: (production.length ? production : next).map((n) => ({ id: n.id })),
      padding: 0.2,
      maxZoom: 1,
      duration: 200,
    });
  };
  useEffect(() => {
    const removed = plan.nodes.length < previousCount.current;
    previousCount.current = plan.nodes.length;
    if (!removed || !plan.nodes.length) return;
    const timer = setTimeout(() => {
      const bounds = canvas.current?.getBoundingClientRect();
      if (!bounds) return;
      const visible = [
        ...(canvas.current?.querySelectorAll(".react-flow__node") ?? []),
      ].some((el) => {
        const r = el.getBoundingClientRect(),
          x = r.x + r.width / 2,
          y = r.y + r.height / 2;
        return (
          x > bounds.left + 65 &&
          x < bounds.right - 30 &&
          y > bounds.top + 30 &&
          y < bounds.bottom - 65
        );
      });
      if (!visible) frameNodes(plan.nodes);
    }, 100);
    return () => clearTimeout(timer);
  }, [plan.nodes]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let previous = { width: element.clientWidth, height: element.clientHeight };
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (flow.current && previous.width && previous.height) {
        const viewport = flow.current.getViewport();
        flow.current.setViewport({
          ...viewport,
          x: viewport.x + (width - previous.width) / 2,
          y: viewport.y + (height - previous.height) / 2,
        });
      }
      previous = { width, height };
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!notice || saveBlocked) return;
    const timer = setTimeout(() => setNotice(""), 8000);
    return () => clearTimeout(timer);
  }, [notice, saveBlocked]);
  const byId = useMemo(
    () =>
      new Map(entities.filter((e) => e.kind === "items").map((e) => [e.id, e])),
    [entities],
  );
  const itemName = (id: string) => byId.get(id)?.name.zh_hans ?? id;
  // Moving/selecting cards must not run the farm simulation again.
  const computationKey = JSON.stringify({
    ...plan,
    nodes: plan.nodes.map(({ position, ...n }) => n),
  });
  const result = useMemo(
    () => simulatePlan(plan, entities),
    [computationKey, entities],
  );
  const change = useCallback(
    (next: WorkflowPlan) => {
      try {
        next = parsePlan(JSON.stringify(next));
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "计划设置无效");
        return;
      }
      setPast((p) => [...p.slice(-49), plan]);
      setFuture([]);
      setPlan(next);
      setSaveBlocked(false);
    },
    [plan],
  );
  useEffect(() => {
    if (saveBlocked) return;
    setSaveStatus("保存中…");
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE, JSON.stringify(plan));
        setSaveStatus("已保存在此浏览器");
      } catch {
        setSaveStatus("保存失败，请导出备份");
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [plan, saveBlocked]);
  useEffect(() => {
    if (
      !Number.isFinite(day) ||
      day < plan.startDay ||
      day > (result.intent?.finishDay ?? plan.startDay + plan.days - 1)
    )
      setDay(plan.startDay);
  }, [plan.startDay, plan.days, day, result.intent?.finishDay]);
  const undo = () => {
    if (!past.length) return;
    setFuture((f) => [plan, ...f]);
    setPlan(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
    setSelected([]);
  };
  const redo = () => {
    if (!future.length) return;
    setPast((p) => [...p, plan]);
    setPlan(future[0]);
    setFuture((f) => f.slice(1));
    setSelected([]);
  };
  const remove = (ids = selected) => {
    change({
      ...plan,
      nodes: plan.nodes.filter((n) => !ids.includes(n.id)),
      edges: plan.edges.filter(
        (e) =>
          !ids.includes(e.source) &&
          !ids.includes(e.target) &&
          !selectedEdges.includes(e.id),
      ),
    });
    setSelected([]);
    setSelectedEdges([]);
  };
  const copy = () => {
    if (!selected.length) return;
    clipboard.current = {
      nodes: plan.nodes
        .filter((n) => selected.includes(n.id))
        .map((n) => structuredClone(n)),
      edges: plan.edges
        .filter(
          (e) => selected.includes(e.source) && selected.includes(e.target),
        )
        .map((e) => ({ ...e })),
    };
    setHasClipboard(true);
    setNotice(`已复制 ${selected.length} 个节点及内部连线，可粘贴后修改日期。`);
  };
  const paste = () => {
    if (!clipboard.current) return;
    const fragment = copySelection(
      clipboard.current,
      clipboard.current.nodes.map((n) => n.id),
    );
    if (
      plan.nodes.length + fragment.nodes.length > 200 ||
      plan.edges.length + fragment.edges.length > 500
    ) {
      setNotice("每份计划最多 200 个节点。");
      return;
    }
    change({
      ...plan,
      nodes: [...plan.nodes, ...fragment.nodes],
      edges: [...plan.edges, ...fragment.edges],
    });
    clipboard.current = fragment;
    setSelected(fragment.nodes.map((n) => n.id));
  };
  const keyboard = (e: KeyboardEvent) => {
    if (
      (e.target as HTMLElement).closest(
        "input,textarea,select,[contenteditable=true]",
      )
    )
      return;
    if (e.key === "Escape") {
      setPanel(null);
      setInspectorOpen(false);
      setFocused(false);
    }
    if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "h")
      setMode("hand");
    if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "v")
      setMode("select");
    const mod = e.ctrlKey || e.metaKey;
    if (mod && ["c", "v", "z", "y", "a"].includes(e.key.toLowerCase())) {
      e.preventDefault();
      switch (e.key.toLowerCase()) {
        case "c":
          copy();
          break;
        case "v":
          paste();
          break;
        case "z":
          e.shiftKey ? redo() : undo();
          break;
        case "y":
          redo();
          break;
        case "a":
          setSelected(plan.nodes.map((n) => n.id));
          break;
      }
    } else if (
      ["Delete", "Backspace"].includes(e.key) &&
      (selected.length || selectedEdges.length)
    ) {
      e.preventDefault();
      remove();
    }
  };
  const connect = (c: Pick<Connection, "source" | "target">) => {
    if (!c.source || !c.target) return;
    if (plan.edges.length >= 500) {
      setNotice("每份计划最多 500 条连线。");
      return;
    }
    if (!canConnectDraft(plan.nodes, plan.edges, c.source, c.target)) {
      setNotice("无法连接：请检查节点方向、重复连线或循环。");
      return;
    }
    change({
      ...plan,
      edges: [...plan.edges, { id: uid(), source: c.source, target: c.target }],
    });
    setNotice("连线已添加，结果已更新。");
  };
  const visiblePosition = () => {
    const rect = canvas.current?.getBoundingClientRect();
    return rect && flow.current
      ? flow.current.screenToFlowPosition({
          x: rect.left + rect.width * 0.43,
          y: rect.top + rect.height * 0.35,
        })
      : { x: 80, y: 80 };
  };
  const frameSelection = (targets: WorkflowNode[], reservePanel = false) => {
    const element = canvas.current,
      instance = flow.current;
    if (!element || !instance || !targets.length) return;
    const left = 90,
      right = reservePanel && window.innerWidth > 800 ? panelWidth + 40 : 50,
      top = 35,
      bottom = 70;
    const x = Math.min(...targets.map((n) => n.position.x)),
      y = Math.min(...targets.map((n) => n.position.y));
    const width =
      Math.max(
        ...targets.map(
          (n) =>
            n.position.x + (instance.getNode(n.id)?.measured?.width ?? 264),
        ),
      ) - x;
    const height =
      Math.max(
        ...targets.map(
          (n) =>
            n.position.y + (instance.getNode(n.id)?.measured?.height ?? 240),
        ),
      ) - y;
    const availableWidth = element.clientWidth - left - right,
      availableHeight = element.clientHeight - top - bottom;
    const zoom = Math.max(
      0.2,
      Math.min(
        1,
        availableWidth / Math.max(1, width),
        availableHeight / Math.max(1, height),
      ),
    );
    instance.setViewport(
      {
        x: left + (availableWidth - width * zoom) / 2 - x * zoom,
        y: top + (availableHeight - height * zoom) / 2 - y * zoom,
        zoom,
      },
      { duration: 200 },
    );
  };
  const add = (kind: NodeKind, droppedPosition?: { x: number; y: number }) => {
    const position = droppedPosition ?? visiblePosition();
    if (!droppedPosition) {
      for (let i = 0; i < plan.nodes.length; i++) {
        if (
          !plan.nodes.some(
            (n) =>
              Math.abs(n.position.x - position.x) < 280 &&
              Math.abs(n.position.y - position.y) < 220,
          )
        )
          break;
        position.y += 240;
      }
    }
    if (plan.nodes.length >= 200) {
      setNotice("每份计划最多 200 个节点。");
      return;
    }
    const n = { ...newNode(kind, day, plan.nodes.length), position };
    change({ ...plan, nodes: [...plan.nodes, n] });
    setSelected([n.id]);
    setTimeout(() => frameSelection([n], true), 100);
    setInspectorOpen(true);
    setPanel(null);
  };
  const linkDemands = (
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    demands: WorkflowNode[],
  ) => {
    const next = [...edges];
    for (const d of demands)
      for (const n of nodes) {
        if (next.length >= 500) break;
        if (canConnect(nodes, next, n.id, d.id, entities))
          next.push({ id: uid(), source: n.id, target: d.id });
      }
    return next;
  };
  const generateDemands = () => {
    const demands = createDemandNodes(
      entities,
      day,
      plan.nodes.flatMap((n) => (n.sourceId ? [n.sourceId] : [])),
    );
    const nodes = [...plan.nodes, ...demands].slice(0, 200);
    change({
      ...plan,
      nodes,
      edges: linkDemands(
        nodes,
        plan.edges,
        demands.filter((d) => nodes.includes(d)),
      ),
    });
    setNotice(
      `已添加 ${Math.min(demands.length, 200 - plan.nodes.length)} 组${formatDay(day)}所在季节的留货需求。没有设置官方未知的截止日期。`,
    );
  };
  const starter = () => {
    const crop = entities.find(
      (e) => e.kind === "crops" && e.id === cropChoice,
    );
    if (!crop) return;
    if (plan.nodes.length > 197) {
      setNotice("节点数量已达上限。");
      return;
    }
    const seedId = (crop.seed_item_ids as string[] | undefined)?.[0],
      itemId = (crop.harvest_item_ids as string[] | undefined)?.[0];
    if (!seedId || !itemId) return;
    const quantity = 100;
    const origin = visiblePosition();
    const y = Math.min(origin.y, ...plan.nodes.map((n) => n.position.y - 290));
    const buy = {
      ...newNode("purchase", day),
      label: `购买${byId.get(seedId)?.name.zh_hans ?? "种子"}`,
      itemId: seedId,
      quantity,
      position: { x: origin.x - 330, y },
    };
    const plant = {
      ...newNode("plant", day),
      label: `种植${crop.name.zh_hans}`,
      cropId: crop.id,
      quantity,
      position: { x: origin.x, y },
    };
    const sale = {
      ...newNode("sale", day),
      label: "出售产物",
      position: { x: origin.x + 330, y },
    };
    const nodes = [...plan.nodes, buy, plant, sale],
      edges = [
        ...plan.edges,
        { id: uid(), source: buy.id, target: plant.id },
        { id: uid(), source: plant.id, target: sale.id },
      ];
    change({
      ...plan,
      nodes,
      edges: linkDemands(
        nodes,
        edges,
        nodes.filter((n) => ["reserve", "delivery"].includes(n.kind)),
      ),
    });
    setSelected([plant.id]);
    setNotice("");
    setPanel(null);
    setInspectorOpen(true);
    setTimeout(() => frameSelection([buy, plant, sale], true), 100);
  };
  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    const selection = changes.filter((c) => c.type === "select");
    if (selection.length)
      setSelected((current) => {
        const ids = new Set(current);
        for (const c of selection)
          if (c.type === "select")
            c.selected ? ids.add(c.id) : ids.delete(c.id);
        return [...ids];
      });
  }, []);
  const commitPositions = (dragged: FlowNode[]) => {
    const positions = new Map(dragged.map((n) => [n.id, n.position]));
    if (
      !plan.nodes.some((n) => {
        const p = positions.get(n.id);
        return p && (p.x !== n.position.x || p.y !== n.position.y);
      })
    )
      return;
    change({
      ...plan,
      nodes: plan.nodes.map((n) =>
        positions.has(n.id) ? { ...n, position: positions.get(n.id)! } : n,
      ),
    });
  };
  const focus = (id: string) => {
    setSelected([id]);
    setInspectorOpen(true);
    setPanel(null);
    const target = plan.nodes.find((n) => n.id === id);
    if (target) frameSelection([target], true);
  };
  const nodes: FlowNode[] = useMemo(
    () =>
      plan.nodes.map((stored) => {
        const n = {
          ...stored,
          ...result.intent?.resolvedNodes.find((n) => n.id === stored.id),
          position: stored.position,
        };
        const projection = result.intent?.nodes[n.id];
        const entity = entities.find(
          (e) =>
            e.kind === (n.kind === "plant" ? "crops" : "processes") &&
            e.id === (n.cropId ?? n.recipeId),
        );
        const events = result.events.filter(
          (e) => e.nodeId === n.id && e.day === day,
        );
        const problems = events.filter((e) => e.kind === "warning").length;
        const subtitle = ["reserve", "delivery"].includes(n.kind)
          ? (n.requirements ?? [])
              .slice(0, 3)
              .map((a) => `${itemName(a.itemId)} ×${a.quantity}`)
              .join(" · ") +
            (n.requirements && n.requirements.length > 3
              ? ` 等 ${n.requirements.length} 项`
              : "")
          : `${entity?.name.zh_hans ?? (n.itemId ? itemName(n.itemId) : "连接后自动识别")} · ${projection?.quantity ? `${projection.quantity}${n.kind === "plant" ? " 格" : n.kind === "process" ? " 批" : " 个"}` : autoAmount(n) ? "跟随上游" : `${n.quantity} 个`}`;
        const completed = result.demandProgress[n.id]
          ? (result.days.find((d) => d.day === day)?.stock ?? []).filter(
              (s) => s.nodeId === n.id && s.reserved,
            )
          : undefined;
        const icon =
          entity?.icon_path ??
          (n.itemId ? byId.get(n.itemId)?.icon_path : undefined);
        return {
          id: n.id,
          type: "operation",
          position: n.position,
          selected: selected.includes(n.id),
          data: {
            node: n,
            projection,
            subtitle,
            icon: icon ? withBase(icon) : undefined,
            problems,
            today: events.length
              ? `${((day - 1) % 28) + 1} 日 · ${
                  problems
                    ? `${problems} 项缺口`
                    : events
                        .map(
                          (e) =>
                            ({
                              inventory: "库存",
                              purchase: "买入",
                              plant: "播种",
                              harvest: "收获",
                              process: "投料",
                              complete: "完成",
                              reserve: "留货",
                              delivery: "交付",
                              consume: "消耗",
                              sale: "出货",
                              receipt: "到账",
                              warning: "缺口",
                            })[e.kind],
                        )
                        .filter((v, i, a) => a.indexOf(v) === i)
                        .join(" / ")
                }`
              : "",
            progress: completed
              ? `当日已备 ${completed.reduce((s, a) => s + a.quantity, 0)} / ${(n.requirements ?? []).reduce((s, a) => s + a.quantity, 0)} 个`
              : undefined,
          },
        };
      }),
    [plan.nodes, entities, result, day, selected, byId],
  );
  const edges = useMemo(
    () =>
      plan.edges.map((e) => ({
        ...e,
        selected: selectedEdges.includes(e.id),
        type: "smoothstep",
        label:
          (result.intent?.edgeTransfers[e.id]
            ?.map((a) => `${itemName(a.itemId)} ×${a.quantity}`)
            .join(" · ") ?? "等待分配") +
          (result.intent?.edgeSchedule[e.id]?.length
            ? ` · ${formatDay(result.intent.edgeSchedule[e.id][0].day)}${result.intent.edgeSchedule[e.id].at(-1)!.day !== result.intent.edgeSchedule[e.id][0].day ? " 起" : ""}`
            : ""),
        labelStyle: { fill: "var(--ink-muted)", fontSize: 11 },
        labelBgStyle: { fill: "var(--paper-raised)", fillOpacity: 0.95 },
        labelBgPadding: [6, 4] as [number, number],
        labelBgBorderRadius: 5,
        style: { stroke: "var(--wf-edge)", strokeWidth: 1.7 },
      })),
    [plan.edges, selectedEdges, result, byId],
  );
  const arrange = () => {
    const incoming = new Map(
      plan.nodes.map((n) => [
        n.id,
        plan.edges.filter((e) => e.target === n.id).map((e) => e.source),
      ]),
    );
    const depth = new Map<string, number>();
    const pending = new Set(plan.nodes.map((n) => n.id));
    while (pending.size) {
      let advanced = false;
      for (const id of pending) {
        const parents = incoming.get(id) ?? [];
        if (parents.some((p) => pending.has(p))) continue;
        depth.set(
          id,
          parents.length
            ? Math.max(...parents.map((p) => (depth.get(p) ?? 0) + 1))
            : 0,
        );
        pending.delete(id);
        advanced = true;
      }
      if (!advanced) break;
    }
    const connected = new Set(plan.edges.flatMap((e) => [e.source, e.target]));
    const rows = new Map<number, number>();
    const positions = new Map<string, { x: number; y: number }>();
    for (const n of plan.nodes.filter((n) => connected.has(n.id))) {
      const col = depth.get(n.id) ?? 0,
        row = rows.get(col) ?? 0;
      rows.set(col, row + 1);
      positions.set(n.id, { x: 100 + col * 360, y: 80 + row * 250 });
    }
    const base = connected.size ? Math.max(...rows.values()) * 250 + 140 : 80;
    plan.nodes
      .filter((n) => !connected.has(n.id))
      .forEach((n, i) =>
        positions.set(n.id, {
          x: 100 + (i % 3) * 320,
          y: base + Math.floor(i / 3) * 230,
        }),
      );
    change({
      ...plan,
      nodes: plan.nodes.map((n) => ({ ...n, position: positions.get(n.id)! })),
    });
    setTimeout(
      () => flow.current?.fitView({ padding: 0.18, maxZoom: 1, duration: 250 }),
      100,
    );
    setNotice("已按连线顺序整理节点，可撤销恢复原位置。");
  };
  const download = () => {
    const blob = new Blob([JSON.stringify(plan, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `农场计划-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const current =
    selected.length === 1
      ? plan.nodes.find((n) => n.id === selected[0])
      : undefined;
  const inference = useMemo(
    () => resolveIntent(plan, entities),
    [computationKey, entities],
  );
  const comparison = useMemo(() => {
    if (current?.kind !== "process" || current.machineCount === undefined)
      return undefined;
    const fast = simulatePlan(
      {
        ...plan,
        nodes: plan.nodes.map((n) =>
          n.id === current.id ? { ...n, machineCount: undefined } : n,
        ),
      },
      entities,
    );
    return {
      delay: Math.max(
        0,
        (result.intent?.nodes[current.id]?.finishDay ?? 0) -
          (fast.intent?.nodes[current.id]?.finishDay ?? 0),
      ),
      incomeDifference: result.income - fast.income,
      machines: fast.intent?.nodes[current.id]?.machines ?? 0,
    };
  }, [current?.id, computationKey, entities, result]);
  const descriptions: Record<NodeKind, string> = {
    purchase: "购买种子与原料",
    inventory: "使用手头已有物品",
    plant: "播种、收获与自动续种",
    process: "原料投入与多级加工",
    reserve: "为后续用途保留物品",
    delivery: "供奉、村长与任务交付",
    consume: "料理、送礼与日常使用",
    sale: "出货并计算到账收入",
  };
  const togglePanel = (next: typeof panel) => {
    setPanel(panel === next ? null : next);
    setInspectorOpen(false);
  };
  const crops = entities.filter(
    (e) =>
      e.kind === "crops" &&
      Number(e.growth_days) > 0 &&
      Number(e.harvest_quantity) > 0 &&
      ((e.seasons ?? []) as string[]).includes(seasonAt(day)),
  );
  return (
    <div
      ref={app}
      className={`wf-app ${focused ? "wf-focused" : ""}`}
      tabIndex={0}
      onKeyDown={keyboard}
      aria-label="农场工作流编辑器"
    >
      <header className="wf-heading">
        <div className="wf-identity">
          <span className="wf-brand-mark">
            <WorkflowIcon name="plant" size={24} />
          </span>
          <div>
            <div className="wf-breadcrumb">
              <a href={withBase("/planner/")}>收益规划</a>
              <span>/</span>
              <h1>生产工作流</h1>
            </div>
            <input
              className="wf-plan-name"
              aria-label="计划名称"
              value={plan.name}
              maxLength={150}
              onChange={(e) => change({ ...plan, name: e.target.value })}
            />
          </div>
        </div>
        <small className="wf-save" role="status">
          <WorkflowIcon name="check" size={13} />
          {saveStatus}
        </small>
        <div className="wf-heading-actions">
          <button
            aria-label="计划设置"
            onClick={() => togglePanel("resources")}
            aria-pressed={panel === "resources"}
          >
            <WorkflowIcon name="settings" />
            <span>计划设置</span>
          </button>
          <button
            className="wf-icon-button"
            title={focused ? "退出专注模式（Esc）" : "专注模式"}
            aria-label={focused ? "退出专注模式" : "专注模式"}
            aria-pressed={focused}
            onClick={() => setFocused(!focused)}
          >
            <WorkflowIcon name="expand" />
          </button>
          <details className="wf-file-menu">
            <summary title="计划文件" aria-label="计划文件">
              <WorkflowIcon name="more" />
            </summary>
            <div>
              <button
                onClick={() => {
                  const next = createPlan(entities);
                  change(next);
                  setTimeout(() => frameNodes(next.nodes), 100);
                  setSelected([]);
                  setInspectorOpen(false);
                  setPanel("nodes");
                  setNotice("已新建计划，可撤销返回上一份。");
                }}
              >
                <WorkflowIcon name="plus" />
                新建计划
              </button>
              {hasLegacyBackup && (
                <button
                  onClick={() => {
                    const raw = localStorage.getItem(
                      `${STORAGE}-before-intent`,
                    );
                    if (!raw) return;
                    const url = URL.createObjectURL(
                      new Blob([raw], { type: "application/json" }),
                    );
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "农场计划-升级前备份.json";
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                >
                  导出升级前备份
                </button>
              )}
              <button onClick={download}>
                <WorkflowIcon name="download" />
                导出计划
              </button>
              <button onClick={() => file.current?.click()}>
                <WorkflowIcon name="upload" />
                导入计划
              </button>
            </div>
          </details>
        </div>
        <input
          type="file"
          hidden
          ref={file}
          accept=".json,application/json"
          onChange={async (e) => {
            const picked = e.target.files?.[0];
            e.target.value = "";
            if (!picked) return;
            try {
              if (picked.size > 2_000_000)
                throw new Error("计划文件不能超过 2 MB");
              const next = parsePlan(await picked.text());
              change(next);
              setTimeout(() => frameNodes(next.nodes), 100);
              setSelected([]);
              setPanel(null);
              setInspectorOpen(false);
              setNotice("计划已导入。");
            } catch (error) {
              setNotice(error instanceof Error ? error.message : "导入失败");
            }
          }}
        />
      </header>
      <div className="wf-context-bar">
        <button className="wf-period" onClick={() => togglePanel("resources")}>
          <WorkflowIcon name="calendar" size={15} />
          {formatDay(plan.startDay)} 起 · {plan.days} 天
          <WorkflowIcon name="chevron" size={12} />
        </button>
        <span
          className="wf-resource-summary"
          title="按同时占用推算的需求，机器购置费用另计"
        >
          需要 {result.intent?.land ?? 0} 格土地<span>·</span>
          {Object.values(result.intent?.nodes ?? {}).reduce(
            (sum, p) => sum + p.machines,
            0,
          )}{" "}
          台机器
        </span>
        <div className="wf-cash-summary">
          <span title="支出发生时不依赖尚未到账的收入">
            启动资金{" "}
            <b>{(result.intent?.startupFunds ?? 0).toLocaleString()}</b>
          </span>
          <span title="本期实际到账减去购买支出">
            本期收支{" "}
            <b>
              {result.cash >= 0 ? "+" : ""}
              {result.cash.toLocaleString()}
            </b>
          </span>
          <span title="包含期末之后的加工与到账">
            最终收支{" "}
            <b>
              {(result.intent?.finalDelta ?? result.cash) >= 0 ? "+" : ""}
              {(result.intent?.finalDelta ?? result.cash).toLocaleString()}
            </b>
          </span>
        </div>
      </div>
      <div className="wf-stage">
        <div ref={canvas} className="wf-canvas">
          <WorkflowCanvas
            nodes={nodes}
            edges={edges}
            mode={mode}
            flow={flow}
            onSelect={onNodesChange}
            onEdgesSelect={setSelectedEdges}
            onCommit={commitPositions}
            onConnect={connect}
            isValid={(c) =>
              canConnectDraft(plan.nodes, plan.edges, c.source, c.target)
            }
            onInspect={() => {
              setInspectorOpen(true);
              setPanel(null);
            }}
            onDropNode={add}
            onZoom={setZoom}
          />
        </div>
        <nav className="wf-rail" aria-label="工作流工具">
          <button
            className={panel === "nodes" ? "active" : ""}
            aria-label="添加节点"
            title="添加节点"
            aria-pressed={panel === "nodes"}
            onClick={() => togglePanel("nodes")}
          >
            <WorkflowIcon name="plus" size={22} />
            <span>节点</span>
          </button>
          <button
            className={mode === "hand" ? "active" : ""}
            aria-label="平移画布"
            title="平移画布（H / 按住空格）"
            aria-pressed={mode === "hand"}
            onClick={() => setMode("hand")}
          >
            <WorkflowIcon name="hand" />
            <span>平移</span>
          </button>
          <button
            className={mode === "select" ? "active" : ""}
            aria-label="框选节点"
            title="框选节点（V / 按住 Shift）"
            aria-pressed={mode === "select"}
            onClick={() => setMode("select")}
          >
            <WorkflowIcon name="select" />
            <span>框选</span>
          </button>
          <hr />
          <button
            aria-label="连线管理"
            title="连线管理"
            aria-pressed={panel === "connections"}
            onClick={() => togglePanel("connections")}
          >
            <WorkflowIcon name="link" />
          </button>
          <button
            aria-label="操作帮助"
            title="操作帮助与计算范围"
            aria-pressed={panel === "help"}
            onClick={() => togglePanel("help")}
          >
            <WorkflowIcon name="help" />
          </button>
        </nav>
        {panel === "nodes" && (
          <aside className="wf-library wf-floating" aria-label="节点库">
            <div className="wf-floating-header">
              <strong>添加节点</strong>
              <button
                className="wf-icon-button"
                aria-label="关闭节点库"
                onClick={() => setPanel(null)}
              >
                <WorkflowIcon name="close" size={16} />
              </button>
            </div>
            <div className="wf-library-content">
              <div className="wf-starter">
                <div className="wf-starter-title">
                  <WorkflowIcon name="plant" size={17} />
                  <strong>从一条种植流程开始</strong>
                </div>
                <p>买种 → 种植 → 出售，一次连好。</p>
                <div className="wf-crop-picks">
                  {crops.slice(0, 4).map((c) => (
                    <button
                      key={c.id}
                      title={`${c.name.zh_hans} · ${c.growth_days} 天生长`}
                      aria-label={`选择${c.name.zh_hans}`}
                      aria-pressed={cropChoice === c.id}
                      onClick={() => setCropChoice(c.id)}
                    >
                      {c.icon_path && (
                        <img
                          src={withBase(c.icon_path)}
                          alt=""
                          width={28}
                          height={28}
                        />
                      )}
                      <span>{c.name.zh_hans}</span>
                    </button>
                  ))}
                </div>
                <EntityPicker
                  label="快速添加的作物"
                  entities={crops}
                  value={cropChoice}
                  onChange={setCropChoice}
                />
                <button
                  className="wf-primary"
                  disabled={!cropChoice}
                  onClick={starter}
                >
                  <WorkflowIcon name="plus" size={16} />
                  添加种植流程
                </button>
              </div>
              <div className="wf-library-search">
                <WorkflowIcon name="search" size={16} />
                <input
                  aria-label="搜索节点类型"
                  placeholder="搜索节点类型…"
                  value={nodeQuery}
                  onChange={(e) => setNodeQuery(e.target.value)}
                />
              </div>
              <p className="wf-library-caption">点击添加，或拖入画布</p>
              <div className="wf-node-catalog">
                {(Object.keys(nodeLabels) as NodeKind[])
                  .filter((kind) =>
                    (nodeLabels[kind] + descriptions[kind]).includes(nodeQuery),
                  )
                  .map((kind) => (
                    <button
                      className={`kind-${kind}`}
                      key={kind}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          "application/village-node",
                          kind,
                        );
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => add(kind)}
                    >
                      <span className="wf-type-icon">
                        <WorkflowIcon name={kind} size={19} />
                      </span>
                      <span>
                        <b>{nodeLabels[kind]}</b>
                        <small>{descriptions[kind]}</small>
                      </span>
                      <WorkflowIcon name="plus" size={13} />
                    </button>
                  ))}
              </div>
              <button className="wf-demand-button" onClick={generateDemands}>
                <WorkflowIcon name="delivery" size={16} />
                补充当季留货节点
              </button>
              <p className="wf-note">
                供奉与交付需求已自动带入，可连接产物，也可删除暂时不做的项目。
              </p>
            </div>
          </aside>
        )}
        {(panel === "resources" ||
          panel === "connections" ||
          panel === "help" ||
          (inspectorOpen && current)) && (
          <WorkflowPanel
            width={panelWidth}
            onWidth={setPanelWidth}
            onClose={() => {
              setInspectorOpen(false);
              setPanel(null);
            }}
            icon={
              panel === "resources"
                ? "settings"
                : panel === "connections"
                  ? "link"
                  : panel === "help"
                    ? "help"
                    : (current?.kind ?? "settings")
            }
            title={
              panel === "resources"
                ? "计划设置"
                : panel === "connections"
                  ? "连线管理"
                  : panel === "help"
                    ? "操作指南"
                    : "节点设置"
            }
          >
            {panel === "resources" ? (
              <PlanResources
                plan={plan}
                entities={entities}
                onChange={change}
              />
            ) : panel === "connections" ? (
              <>
                {" "}
                <details className="wf-connections" open>
                  <summary>
                    连线管理（也可用下拉框连接） · {plan.edges.length} 条
                  </summary>
                  <div className="wf-link-form">
                    <label>
                      来源
                      <select
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                      >
                        <option value="">选择来源</option>
                        {plan.nodes.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <span>→</span>
                    <label>
                      去向
                      <select
                        value={target}
                        onChange={(e) => setTarget(e.target.value)}
                      >
                        <option value="">选择去向</option>
                        {plan.nodes.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      disabled={!source || !target}
                      onClick={() => connect({ source, target })}
                    >
                      连接
                    </button>
                  </div>
                  <ul>
                    {plan.edges.map((e) => (
                      <li key={e.id}>
                        {plan.nodes.find((n) => n.id === e.source)?.label} →{" "}
                        {plan.nodes.find((n) => n.id === e.target)?.label}
                        {!!result.intent?.edgeSchedule[e.id]?.length && (
                          <details>
                            <summary>
                              {result.intent.edgeSchedule[e.id].length}{" "}
                              批分配明细
                            </summary>
                            <ul>
                              {result.intent.edgeSchedule[e.id].map((a, i) => (
                                <li key={i}>
                                  {formatDay(a.day)} · {itemName(a.itemId)} ×
                                  {a.quantity}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                        <button
                          aria-label="删除此连线"
                          onClick={() =>
                            change({
                              ...plan,
                              edges: plan.edges.filter((v) => v.id !== e.id),
                            })
                          }
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              </>
            ) : panel === "help" ? (
              <>
                <div className="wf-shortcuts">
                  <h3>把农场安排在一张画布上</h3>
                  <p>
                    拖动节点移动位置，从右侧圆点拖到另一个节点的左侧圆点连接产物。
                  </p>
                  <dl>
                    <dt>移动画布</dt>
                    <dd>左键拖动空白处 · H</dd>
                    <dt>框选节点</dt>
                    <dd>框选工具 · Shift 拖动</dd>
                    <dt>临时平移</dt>
                    <dd>按住空格拖动</dd>
                    <dt>复制 / 粘贴</dt>
                    <dd>Ctrl / ⌘ + C / V</dd>
                    <dt>撤销 / 重做</dt>
                    <dd>Ctrl / ⌘ + Z / Shift Z</dd>
                    <dt>查看每日安排</dt>
                    <dd>底部选择日期，展开生产日程</dd>
                  </dl>
                  <p>
                    选中种植节点可勾选自动续种、缺种补买。每次购买和播种都会出现在日程上。
                  </p>
                </div>
                <details className="wf-assumptions" open>
                  <summary>计算假设与范围</summary>
                  <p>
                    每天统一操作一次。播种日加生长天数为收获日；加工按 24
                    小时向上取整，最早次日收取。实际游戏日界、出货到账时间和机器并行容量尚需玩家核对，到账天数在计划设置中调整，机器台数与并行容量在加工节点中调整。
                  </p>
                  <p>
                    适种季节和商店供应使用现有资料。额外解锁、天气、肥料、体力、价格整数舍入及混合品质继承未完整模拟。统一品质是当前计划的估算假设。未知生长、产量、配方或价格不会被当成零。
                  </p>
                  <p>
                    已有库存不重复扣买入成本。自动补买产生真实购买事件和现金支出；无期限的供奉与交付仅作为备货目标。此版本不会自动推荐最优方案，保存的计划结构可用于后续推荐。
                  </p>
                </details>
              </>
            ) : (
              current && (
                <NodeInspector
                  key={current.id}
                  node={current}
                  resolved={inference.nodes.find((n) => n.id === current.id)}
                  projection={result.intent?.nodes[current.id]}
                  choices={inference.choices[current.id]}
                  comparison={comparison}
                  plan={plan}
                  entities={entities}
                  onChange={(n) =>
                    change({
                      ...plan,
                      nodes: plan.nodes.map((v) => (v.id === n.id ? n : v)),
                    })
                  }
                  onDelete={() => remove([current.id])}
                />
              )
            )}
          </WorkflowPanel>
        )}
        <div className="wf-canvas-footer">
          <div className="wf-view-tools">
            <button
              className="wf-icon-button"
              aria-label="缩小画布"
              title="缩小"
              onClick={() => flow.current?.zoomOut({ duration: 150 })}
            >
              <WorkflowIcon name="minus" size={16} />
            </button>
            <button
              className="wf-zoom-value"
              aria-label="重置为百分之百缩放"
              title="重置为 100%"
              onClick={() => flow.current?.zoomTo(1, { duration: 150 })}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              className="wf-icon-button"
              aria-label="放大画布"
              title="放大"
              onClick={() => flow.current?.zoomIn({ duration: 150 })}
            >
              <WorkflowIcon name="plus" size={16} />
            </button>
            <i />
            <button
              className="wf-icon-button"
              aria-label="适应全部节点"
              title="适应全部节点"
              onClick={() =>
                flow.current?.fitView({
                  padding: 0.2,
                  maxZoom: 1,
                  duration: 250,
                })
              }
            >
              <WorkflowIcon name="fit" size={17} />
            </button>
            <button
              className="wf-icon-button"
              aria-label="整理节点布局"
              title="按连线顺序整理布局（可撤销）"
              onClick={arrange}
            >
              <WorkflowIcon name="layout" size={17} />
            </button>
          </div>
          <span className="wf-pan-hint">
            {mode === "hand"
              ? "拖动空白处平移 · Shift 框选"
              : "拖动空白处框选 · 空格平移"}
          </span>
        </div>
        <div className="wf-history-tools">
          {selected.length > 0 && (
            <>
              <span>已选 {selected.length}</span>
              <button
                className="wf-icon-button"
                aria-label="复制选中节点"
                title="复制（Ctrl / ⌘ + C）"
                onClick={copy}
              >
                <WorkflowIcon name="copy" size={16} />
              </button>
            </>
          )}
          <button
            className="wf-icon-button"
            aria-label="粘贴节点"
            title="粘贴（Ctrl / ⌘ + V）"
            disabled={!hasClipboard}
            onClick={paste}
          >
            <WorkflowIcon name="paste" size={16} />
          </button>
          {(selected.length > 0 || selectedEdges.length > 0) && (
            <button
              className="wf-icon-button wf-danger"
              aria-label="删除选中"
              title="删除选中"
              onClick={() => remove()}
            >
              <WorkflowIcon name="trash" size={16} />
            </button>
          )}
          <i />
          <button
            className="wf-icon-button"
            aria-label="撤销"
            title="撤销（Ctrl / ⌘ + Z）"
            disabled={!past.length}
            onClick={undo}
          >
            <WorkflowIcon name="undo" size={16} />
          </button>
          <button
            className="wf-icon-button"
            aria-label="重做"
            title="重做（Ctrl / ⌘ + Shift + Z）"
            disabled={!future.length}
            onClick={redo}
          >
            <WorkflowIcon name="redo" size={16} />
          </button>
        </div>
        {notice && (
          <div className="wf-toast" role="status">
            <span>{notice}</span>
            <button
              className="wf-icon-button"
              aria-label="关闭提示"
              onClick={() => setNotice("")}
            >
              <WorkflowIcon name="close" size={14} />
            </button>
          </div>
        )}
      </div>
      <WorkflowTimeline
        result={result}
        plan={plan}
        entities={entities}
        day={day}
        onDay={setDay}
        onNode={focus}
      />
    </div>
  );
}
