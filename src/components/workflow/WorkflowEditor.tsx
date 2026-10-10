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
import { layoutWorkflow, traceSelection } from "../../domain/workflow/layout";
import {
  getWorkflowAssistance,
  applyWorkflowAssistance,
  updateWorkflowNode,
} from "../../domain/workflow/assistance";
import { canConnect } from "../../domain/workflow/graph";
import {
  canConnectDraft,
  resolveIntent,
  autoAmount,
} from "../../domain/workflow/intent";
import { formatDay } from "../../domain/workflow/date";
import { withBase } from "../../lib/sitePath";
import NodeInspector from "./NodeInspector";
import PlanResources from "./PlanResources";
import { type FlowNode } from "./WorkflowCard";
import WorkflowCanvas from "./WorkflowCanvas";
import WorkflowTimeline from "./WorkflowTimeline";
import WorkflowIcon from "./WorkflowIcon";
import WorkflowPanel from "./WorkflowPanel";
import { EntityPicker } from "./fields";
import {
  addConnectedNode,
  prepareDemand,
  type AddAnchor,
} from "../../domain/workflow/editing";
import { pageHref, tr } from '../../i18n/active';

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
        ? tr('旧方案已升级，保留手动日期、数量及机器设置。可在节点中恢复自动跟随上游；')
        : "",
    };
  } catch {
    return {
      plan: createPlan(entities),
      error:
        tr('已保存的计划无法读取。原记录暂未覆盖；可导入备份，或编辑当前新计划。'),
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
        setNotice(error instanceof Error ? error.message : tr('计划设置无效'));
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
    setSaveStatus(tr('保存中…'));
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE, JSON.stringify(plan));
        setSaveStatus(tr('已保存在此浏览器'));
      } catch {
        setSaveStatus(tr('保存失败，请导出备份'));
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
    setNotice(tr('已复制 {count} 个节点及内部连线，可粘贴后修改日期。', { count: selected.length }));
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
      setNotice(tr('每份计划最多 200 个节点。'));
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
      setNotice(tr('每份计划最多 500 条连线。'));
      return;
    }
    if (!canConnectDraft(plan.nodes, plan.edges, c.source, c.target)) {
      setNotice(tr('无法连接：请检查节点方向、重复连线或循环。'));
      return;
    }
    change({
      ...plan,
      edges: [...plan.edges, { id: uid(), source: c.source, target: c.target }],
    });
    setNotice(tr('连线已添加，结果已更新。'));
  };
  const visiblePosition = (occupied = plan.nodes) => {
    const rect = canvas.current?.getBoundingClientRect();
    const instance = flow.current;
    if (!rect || !instance) return { x: 80, y: 80 };
    const scale = instance.getZoom(),
      w = 280 * scale,
      h = 260 * scale;
    const left = rect.left + 80,
      top = rect.top + 25;
    const right = Math.max(
      left,
      rect.right - (window.innerWidth > 800 ? panelWidth + 40 : 30) - w,
    );
    const bottom = Math.max(top, rect.bottom - 70 - h);
    const candidates: Array<{ x: number; y: number; score: number }> = [];
    for (let y = top; y <= bottom + 1; y += Math.max(50, h / 2))
      for (let x = left; x <= right + 1; x += Math.max(50, w / 2)) {
        const position = instance.screenToFlowPosition({ x, y });
        const overlaps = occupied.reduce(
          (s, n) =>
            s +
            Math.max(
              0,
              Math.min(position.x + 280, n.position.x + 280) -
                Math.max(position.x, n.position.x),
            ) *
              Math.max(
                0,
                Math.min(
                  position.y + 260,
                  n.position.y +
                    (instance.getNode(n.id)?.measured?.height ?? 260),
                ) - Math.max(position.y, n.position.y),
              ),
          0,
        );
        candidates.push({
          ...position,
          score:
            overlaps * 10000 +
            Math.hypot(x - (left + right) / 2, y - (top + bottom) / 2),
        });
      }
    const best = candidates.sort((a, b) => a.score - b.score)[0];
    return best
      ? { x: best.x, y: best.y }
      : instance.screenToFlowPosition({ x: left, y: top });
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
    if (plan.nodes.length >= 200) {
      setNotice(tr('每份计划最多 200 个节点。'));
      return;
    }
    const n = { ...newNode(kind, day, plan.nodes.length), position };
    change({ ...plan, nodes: [...plan.nodes, n] });
    setSelected([n.id]);
    setInspectorOpen(true);
    setPanel(null);
  };
  const [addMenu, setAddMenu] = useState<AddAnchor | null>(null);
  const insertNode = (kind: NodeKind) => {
    if (!addMenu) return;
    try {
      const added = addConnectedNode(
        plan,
        entities,
        kind,
        visiblePosition(),
        addMenu,
      );
      change(added.plan);
      setSelected([added.addedId]);
      setInspectorOpen(true);
      setPanel(null);
      setAddMenu(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : tr('无法新增节点'));
    }
  };
  const prepare = () => {
    if (!current) return;
    try {
      const prepared = prepareDemand(
        plan,
        entities,
        current.id,
        result,
        visiblePosition(),
      );
      const occupied = [...plan.nodes];
      prepared.plan.nodes = prepared.plan.nodes.map((n) => {
        if (plan.nodes.some((old) => old.id === n.id)) return n;
        const placed = { ...n, position: visiblePosition(occupied) };
        occupied.push(placed);
        return placed;
      });
      change(prepared.plan);
      setNotice(
        prepared.unresolved.length
          ? tr('已生成可推算的前置流程；{items} 仍需确认来源，尚未计入可交付数量。', { items: [...new Set(prepared.unresolved)].join("、") })
          : tr('已按剩余缺口生成前置流程，可一次撤销。'),
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : tr('无法准备前置流程'));
    }
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
      tr('已添加 {min} 组{day}所在季节的留货需求。没有设置官方未知的截止日期。', { min: Math.min(demands.length, 200 - plan.nodes.length), day: formatDay(day) }),
    );
  };
  const starter = () => {
    const crop = entities.find(
      (e) => e.kind === "crops" && e.id === cropChoice,
    );
    if (!crop) return;
    if (plan.nodes.length > 197) {
      setNotice(tr('节点数量已达上限。'));
      return;
    }
    const seedId = (crop.seed_item_ids as string[] | undefined)?.[0],
      itemId = (crop.harvest_item_ids as string[] | undefined)?.[0];
    if (!seedId || !itemId) return;
    const quantity = 100;
    const origin = visiblePosition();
    const buy = {
      ...newNode("purchase", day),
      label: tr('购买{name}', { name: byId.get(seedId)?.name.zh_hans ?? tr('种子') }),
      itemId: seedId,
      quantity,
      position: origin,
    };
    const plant = {
      ...newNode("plant", day),
      label: tr('种植{name}', { name: crop.name.zh_hans }),
      cropId: crop.id,
      quantity,
      position: visiblePosition([...plan.nodes, buy]),
    };
    const sale = {
      ...newNode("sale", day),
      label: tr('出售产物'),
      position: visiblePosition([...plan.nodes, buy, plant]),
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
  const traced = useMemo(
    () => traceSelection(plan, selected),
    [plan.nodes, plan.edges, selected],
  );
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
              ? tr(' 等 {count} 项', { count: n.requirements.length })
              : "")
          : `${entity?.name.zh_hans ?? (n.itemId ? itemName(n.itemId) : tr('连接后自动识别'))} · ${projection?.quantity ? `${n.kind === "plant" ? projection.land : projection.quantity}${n.kind === "plant" ? tr(' 格') : n.kind === "process" ? tr(' 批') : tr(' 个')}` : autoAmount(n) ? tr('跟随上游') : tr('{quantity} 个', { quantity: n.quantity })}`;
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
          className: traced.active
            ? traced.nodes.has(n.id)
              ? "wf-chain-related"
              : "wf-chain-muted"
            : "",
          data: {
            node: n,
            onAdd: (nodeId, side) => setAddMenu({ nodeId, side }),
            projection,
            subtitle,
            icon: icon ? withBase(icon) : undefined,
            problems,
            today: events.length
              ? tr('{day} 日 · {summary}', {
                  day: ((day - 1) % 28) + 1,
                  summary: problems
                    ? tr('{count} 项缺口', { count: problems })
                    : events
                        .map(
                          (e) =>
                            ({
                              inventory: tr('库存'),
                              purchase: tr('买入'),
                              plant: tr('播种'),
                              harvest: tr('收获'),
                              process: tr('投料'),
                              complete: tr('完成'),
                              reserve: tr('留货'),
                              delivery: tr('交付'),
                              consume: tr('消耗'),
                              sale: tr('出货'),
                              receipt: tr('到账'),
                              warning: tr('缺口'),
                            })[e.kind],
                        )
                        .filter((v, i, a) => a.indexOf(v) === i)
                        .join(" / "),
                })
              : "",
            progress: completed
              ? tr('当日已备 {ready} / {required} 个', { ready: completed.reduce((s, a) => s + a.quantity, 0), required: (n.requirements ?? []).reduce((s, a) => s + a.quantity, 0) })
              : undefined,
          },
        };
      }),
    [plan.nodes, entities, result, day, selected, byId, traced],
  );
  const edges = useMemo(
    () =>
      plan.edges.map((e) => ({
        ...e,
        selected: selectedEdges.includes(e.id),
        type: "workflow",
        className: traced.active
          ? traced.edges.has(e.id)
            ? "wf-chain-related"
            : "wf-chain-muted"
          : "",
        zIndex: traced.active && traced.edges.has(e.id) ? 1 : 0,
        data: {
          focus: traced.active
            ? traced.edges.has(e.id)
              ? "related"
              : "muted"
            : "",
          onInsert: (edgeId: string) => setAddMenu({ edgeId }),
        },
        label:
          (result.intent?.edgeTransfers[e.id]
            ?.map((a) => `${itemName(a.itemId)} ×${a.quantity}`)
            .join(" · ") ?? tr('等待分配')) +
          (result.intent?.edgeSchedule[e.id]?.length
            ? ` · ${formatDay(result.intent.edgeSchedule[e.id][0].day)}${result.intent.edgeSchedule[e.id].at(-1)!.day !== result.intent.edgeSchedule[e.id][0].day ? tr(' 起') : ""}`
            : ""),
        labelStyle: { fill: "var(--ink)", fontSize: 11 },
        labelBgStyle: { fill: "var(--paper-raised)", fillOpacity: 0.95 },
        labelBgPadding: [6, 4] as [number, number],
        labelBgBorderRadius: 5,
        style: { stroke: "var(--wf-edge)", strokeWidth: 1.7 },
      })),
    [plan.edges, selectedEdges, result, byId, traced],
  );
  const arrange = () => {
    const bounds = canvas.current?.getBoundingClientRect();
    const sizes = new Map(
      plan.nodes.map((n) => {
        const measured = flow.current?.getNode(n.id)?.measured;
        return [
          n.id,
          { width: measured?.width ?? 264, height: measured?.height ?? 260 },
        ] as const;
      }),
    );
    const arranged = layoutWorkflow(
      plan,
      sizes,
      bounds ? bounds.width / bounds.height : 1.6,
    );
    change({
      ...plan,
      nodes: arranged.nodes,
    });
    setTimeout(
      () => flow.current?.fitView({ padding: 0.18, maxZoom: 1, duration: 250 }),
      100,
    );
    setNotice(
      tr('已将 {groupCount} 组独立流程分别整理并紧凑排布，可撤销恢复原位置。', { groupCount: arranged.groupCount }),
    );
  };
  const download = () => {
    const blob = new Blob([JSON.stringify(plan, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = tr('农场计划-{slice}.json', { slice: new Date().toISOString().slice(0, 10) });
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
  const advice = useMemo(
    () =>
      current
        ? getWorkflowAssistance(plan, entities, current.id, result)
        : undefined,
    [computationKey, current?.id, entities, result],
  );
  const assist = (key: string) => {
    if (!current) return;
    try {
      const applied = applyWorkflowAssistance(
        plan,
        entities,
        current.id,
        key,
        result,
      );
      const occupied = [...plan.nodes];
      applied.plan.nodes = applied.plan.nodes.map((n) => {
        if (plan.nodes.some((old) => old.id === n.id)) return n;
        const placed = { ...n, position: visiblePosition(occupied) };
        occupied.push(placed);
        return placed;
      });
      change(applied.plan);
      setSelected([applied.focusId]);
      setInspectorOpen(true);
      setNotice(applied.message);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : tr('暂时不能执行这项操作。'),
      );
    }
  };
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
    purchase: tr('购买种子与原料'),
    inventory: tr('使用手头已有物品'),
    plant: tr('播种、收获与自动续种'),
    process: tr('原料投入与多级加工'),
    reserve: tr('为后续用途保留物品'),
    delivery: tr('供奉、村长与任务交付'),
    consume: tr('料理、送礼与日常使用'),
    sale: tr('出货并计算到账收入'),
  };
  const togglePanel = (next: typeof panel) => {
    setPanel(panel === next ? null : next);
    setInspectorOpen(false);
  };
  const crops = entities.filter(
    (e) =>
      e.kind === "crops" &&
      Number(e.growth_days) > 0 &&
      Number(e.harvest_quantity) > 0,
  );
  return (
    <div
      ref={app}
      className={`wf-app ${focused ? "wf-focused" : ""}`}
      tabIndex={0}
      onKeyDown={keyboard}
      aria-label={tr('农场工作流编辑器')}
    >
      {addMenu && (
        <div
          className="wf-add-menu wf-floating"
          role="dialog"
          aria-label={tr('连接新节点')}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") setAddMenu(null);
          }}
        >
          <div className="wf-floating-header">
            <strong>
              {addMenu.edgeId
                ? tr('插入流程节点')
                : addMenu.side === "input"
                  ? tr('添加前置节点')
                  : tr('添加后续节点')}
            </strong>
            <button aria-label={tr('关闭新增菜单')} onClick={() => setAddMenu(null)}>
              <WorkflowIcon name="close" />
            </button>
          </div>
          <p>{tr('添加后自动连接，物品和日期沿流程推算。')}</p>
          <div>
            {(Object.keys(nodeLabels) as NodeKind[])
              .filter((kind) =>
                addMenu.edgeId
                  ? ["plant", "process"].includes(kind)
                  : addMenu.side === "input"
                    ? !["sale", "consume", "delivery", "reserve"].includes(kind)
                    : !["purchase", "inventory"].includes(kind),
              )
              .map((kind) => (
                <button key={kind} onClick={() => insertNode(kind)}>
                  <WorkflowIcon name={kind} />
                  <span>
                    {nodeLabels[kind]}
                    <small>{descriptions[kind]}</small>
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}
      <header className="wf-heading">
        <div className="wf-identity">
          <span className="wf-brand-mark">
            <WorkflowIcon name="plant" size={24} />
          </span>
          <div>
            <div className="wf-breadcrumb">
              <a href={pageHref("/planner/")}>{tr('收益规划')}</a>
              <span>/</span>
              <h1>{tr('生产工作流')}</h1>
            </div>
            <input
              className="wf-plan-name"
              aria-label={tr('计划名称')}
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
            aria-label={tr('计划设置')}
            onClick={() => togglePanel("resources")}
            aria-pressed={panel === "resources"}
          >
            <WorkflowIcon name="settings" />
            <span>{tr('计划设置')}</span>
          </button>
          <button
            className="wf-icon-button"
            title={focused ? tr('退出专注模式（Esc）') : tr('专注模式')}
            aria-label={focused ? tr('退出专注模式') : tr('专注模式')}
            aria-pressed={focused}
            onClick={() => setFocused(!focused)}
          >
            <WorkflowIcon name="expand" />
          </button>
          <details className="wf-file-menu">
            <summary title={tr('计划文件')} aria-label={tr('计划文件')}>
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
                  setNotice(tr('已新建计划，可撤销返回上一份。'));
                }}
              >
                <WorkflowIcon name="plus" />
                {tr('新建计划')}
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
                    a.download = tr('农场计划-升级前备份.json');
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                >
                  {tr('导出升级前备份')}
                </button>
              )}
              <button onClick={download}>
                <WorkflowIcon name="download" />
                {tr('导出计划')}
              </button>
              <button onClick={() => file.current?.click()}>
                <WorkflowIcon name="upload" />
                {tr('导入计划')}
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
                throw new Error(tr('计划文件不能超过 2 MB'));
              const next = parsePlan(await picked.text());
              change(next);
              setTimeout(() => frameNodes(next.nodes), 100);
              setSelected([]);
              setPanel(null);
              setInspectorOpen(false);
              setNotice(tr('计划已导入。'));
            } catch (error) {
              setNotice(error instanceof Error ? error.message : tr('导入失败'));
            }
          }}
        />
      </header>
      <div className="wf-context-bar">
        <button className="wf-period" onClick={() => togglePanel("resources")}>
          <WorkflowIcon name="calendar" size={15} />
          {formatDay(plan.startDay)} {tr('起 ·')} {plan.days} {tr('天')}
          <WorkflowIcon name="chevron" size={12} />
        </button>
        <span
          className="wf-resource-summary"
          title={tr('按同时占用推算的需求，机器购置费用另计')}
        >
          {tr('需要')} {result.intent?.land ?? 0} {tr('格土地')}<span>·</span>
          {Object.values(result.intent?.nodes ?? {}).reduce(
            (sum, p) => sum + p.machines,
            0,
          )}{" "}
          {tr('台机器')}
        </span>
        <div className="wf-cash-summary">
          <span title={tr('支出发生时不依赖尚未到账的收入')}>
            {tr('启动资金')}{" "}
            <b>{(result.intent?.startupFunds ?? 0).toLocaleString()}</b>
          </span>
          <span title={tr('本期实际到账减去购买支出')}>
            {tr('本期收支')}{" "}
            <b>
              {result.cash >= 0 ? "+" : ""}
              {result.cash.toLocaleString()}
            </b>
          </span>
          <span title={tr('包含期末之后的加工与到账')}>
            {tr('最终收支')}{" "}
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
        <nav className="wf-rail" aria-label={tr('工作流工具')}>
          <button
            className={panel === "nodes" ? "active" : ""}
            aria-label={tr('添加节点')}
            title={tr('添加节点')}
            aria-pressed={panel === "nodes"}
            onClick={() => togglePanel("nodes")}
          >
            <WorkflowIcon name="plus" size={22} />
            <span>{tr('节点')}</span>
          </button>
          <button
            className={mode === "hand" ? "active" : ""}
            aria-label={tr('平移画布')}
            title={tr('平移画布（H / 按住空格）')}
            aria-pressed={mode === "hand"}
            onClick={() => setMode("hand")}
          >
            <WorkflowIcon name="hand" />
            <span>{tr('平移')}</span>
          </button>
          <button
            className={mode === "select" ? "active" : ""}
            aria-label={tr('框选节点')}
            title={tr('框选节点（V / 按住 Shift）')}
            aria-pressed={mode === "select"}
            onClick={() => setMode("select")}
          >
            <WorkflowIcon name="select" />
            <span>{tr('框选')}</span>
          </button>
          <hr />
          <button
            aria-label={tr('连线管理')}
            title={tr('连线管理')}
            aria-pressed={panel === "connections"}
            onClick={() => togglePanel("connections")}
          >
            <WorkflowIcon name="link" />
          </button>
          <button
            aria-label={tr('操作帮助')}
            title={tr('操作帮助与计算范围')}
            aria-pressed={panel === "help"}
            onClick={() => togglePanel("help")}
          >
            <WorkflowIcon name="help" />
          </button>
        </nav>
        {panel === "nodes" && (
          <aside className="wf-library wf-floating" aria-label={tr('节点库')}>
            <div className="wf-floating-header">
              <strong>{tr('添加节点')}</strong>
              <button
                className="wf-icon-button"
                aria-label={tr('关闭节点库')}
                onClick={() => setPanel(null)}
              >
                <WorkflowIcon name="close" size={16} />
              </button>
            </div>
            <div className="wf-library-content">
              <div className="wf-starter">
                <div className="wf-starter-title">
                  <WorkflowIcon name="plant" size={17} />
                  <strong>{tr('从一条种植流程开始')}</strong>
                </div>
                <p>{tr('买种 → 种植 → 出售，一次连好。')}</p>
                <div className="wf-crop-picks">
                  {crops.slice(0, 4).map((c) => (
                    <button
                      key={c.id}
                      title={tr('{name} · {days} 天生长', { name: c.name.zh_hans, days: c.growth_days })}
                      aria-label={tr('选择{name}', { name: c.name.zh_hans })}
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
                  label={tr('快速添加的作物')}
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
                  {tr('添加种植流程')}
                </button>
              </div>
              <div className="wf-library-search">
                <WorkflowIcon name="search" size={16} />
                <input
                  aria-label={tr('搜索节点类型')}
                  placeholder={tr('搜索节点类型…')}
                  value={nodeQuery}
                  onChange={(e) => setNodeQuery(e.target.value)}
                />
              </div>
              <p className="wf-library-caption">{tr('点击添加，或拖入画布')}</p>
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
                {tr('补充当季留货节点')}
              </button>
              <p className="wf-note">
                {tr('供奉与交付需求已自动带入，可连接产物，也可删除暂时不做的项目。')}
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
                ? tr('计划设置')
                : panel === "connections"
                  ? tr('连线管理')
                  : panel === "help"
                    ? tr('操作指南')
                    : tr('节点设置')
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
                    {tr('连线管理（也可用下拉框连接） ·')} {plan.edges.length} {tr('条')}
                  </summary>
                  <div className="wf-link-form">
                    <label>
                      {tr('来源')}
                      <select
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                      >
                        <option value="">{tr('选择来源')}</option>
                        {inference.nodes.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <span>→</span>
                    <label>
                      {tr('去向')}
                      <select
                        value={target}
                        onChange={(e) => setTarget(e.target.value)}
                      >
                        <option value="">{tr('选择去向')}</option>
                        {inference.nodes.map((n) => (
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
                      {tr('连接')}
                    </button>
                  </div>
                  <ul>
                    {plan.edges.map((e) => (
                      <li key={e.id}>
                        {inference.nodes.find((n) => n.id === e.source)?.label}{" "}
                        →{" "}
                        {inference.nodes.find((n) => n.id === e.target)?.label}
                        {!!result.intent?.edgeSchedule[e.id]?.length && (
                          <details>
                            <summary>
                              {result.intent.edgeSchedule[e.id].length}{" "}
                              {tr('批分配明细')}
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
                          aria-label={tr('删除此连线')}
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
                  <h3>{tr('把农场安排在一张画布上')}</h3>
                  <p>
                    {tr('拖动节点移动位置，从右侧圆点拖到另一个节点的左侧圆点连接产物。')}
                  </p>
                  <dl>
                    <dt>{tr('移动画布')}</dt>
                    <dd>{tr('左键拖动空白处 · H')}</dd>
                    <dt>{tr('框选节点')}</dt>
                    <dd>{tr('框选工具 · Shift 拖动')}</dd>
                    <dt>{tr('临时平移')}</dt>
                    <dd>{tr('按住空格拖动')}</dd>
                    <dt>{tr('复制 / 粘贴')}</dt>
                    <dd>Ctrl / ⌘ + C / V</dd>
                    <dt>{tr('撤销 / 重做')}</dt>
                    <dd>Ctrl / ⌘ + Z / Shift Z</dd>
                    <dt>{tr('查看每日安排')}</dt>
                    <dd>{tr('底部选择日期，展开生产日程')}</dd>
                  </dl>
                  <p>
                    {tr('选中种植节点可勾选自动续种、缺种补买。每次购买和播种都会出现在日程上。')}
                  </p>
                </div>
                <details className="wf-assumptions" open>
                  <summary>{tr('计算假设与范围')}</summary>
                  <p>
                    {tr('每天统一操作一次。播种日加生长天数为收获日；加工按 24 小时向上取整，最早次日收取。实际游戏日界、出货到账时间和机器并行容量尚需玩家核对，到账天数在计划设置中调整，机器台数与并行容量在加工节点中调整。')}
                  </p>
                  <p>
                    {tr('适种季节和商店供应使用现有资料。额外解锁、天气、肥料、体力、价格整数舍入及混合品质继承未完整模拟。统一品质是当前计划的估算假设。未知生长、产量、配方或价格不会被当成零。')}
                  </p>
                  <p>
                    {tr('已有库存不重复扣买入成本。自动补买产生真实购买事件和现金支出；无期限的供奉与交付仅作为备货目标。此版本不会自动推荐最优方案，保存的计划结构可用于后续推荐。')}
                  </p>
                </details>
              </>
            ) : (
              current && (
                <NodeInspector
                  key={current.id}
                  node={current}
                  result={result}
                  selectedDay={day}
                  onPrepare={prepare}
                  resolved={inference.nodes.find((n) => n.id === current.id)}
                  projection={result.intent?.nodes[current.id]}
                  choices={inference.choices[current.id]}
                  comparison={comparison}
                  plan={plan}
                  entities={entities}
                  advice={advice}
                  onAction={assist}
                  onChange={(n) =>
                    change({
                      ...plan,
                      nodes: plan.nodes.map((v) =>
                        v.id === n.id ? updateWorkflowNode(v, n, entities) : v,
                      ),
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
              aria-label={tr('缩小画布')}
              title={tr('缩小')}
              onClick={() => flow.current?.zoomOut({ duration: 150 })}
            >
              <WorkflowIcon name="minus" size={16} />
            </button>
            <button
              className="wf-zoom-value"
              aria-label={tr('重置为百分之百缩放')}
              title={tr('重置为 100%')}
              onClick={() => flow.current?.zoomTo(1, { duration: 150 })}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              className="wf-icon-button"
              aria-label={tr('放大画布')}
              title={tr('放大')}
              onClick={() => flow.current?.zoomIn({ duration: 150 })}
            >
              <WorkflowIcon name="plus" size={16} />
            </button>
            <i />
            <button
              className="wf-icon-button"
              aria-label={tr('适应全部节点')}
              title={tr('适应全部节点')}
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
              aria-label={tr('整理节点布局')}
              title={tr('按独立流程分组整理布局（可撤销）')}
              onClick={arrange}
            >
              <WorkflowIcon name="layout" size={17} />
            </button>
          </div>
          <span className="wf-pan-hint">
            {mode === "hand"
              ? tr('拖动空白处平移 · Shift 框选')
              : tr('拖动空白处框选 · 空格平移')}
          </span>
        </div>
        <div className="wf-history-tools">
          {selected.length > 0 && (
            <>
              <span>{tr('已选')} {selected.length}</span>
              <button
                aria-label={tr('聚焦所选链路')}
                title={tr('放大查看选中节点的完整上下游')}
                onClick={() =>
                  frameSelection(
                    plan.nodes.filter((n) => traced.nodes.has(n.id)),
                    !!(inspectorOpen && current) ||
                      ["resources", "connections", "help"].includes(
                        panel ?? "",
                      ),
                  )
                }
              >
                <WorkflowIcon name="fit" size={16} /> {tr('聚焦链路')}
              </button>
              <button
                className="wf-icon-button"
                aria-label={tr('复制选中节点')}
                title={tr('复制（Ctrl / ⌘ + C）')}
                onClick={copy}
              >
                <WorkflowIcon name="copy" size={16} />
              </button>
            </>
          )}
          <button
            className="wf-icon-button"
            aria-label={tr('粘贴节点')}
            title={tr('粘贴（Ctrl / ⌘ + V）')}
            disabled={!hasClipboard}
            onClick={paste}
          >
            <WorkflowIcon name="paste" size={16} />
          </button>
          {(selected.length > 0 || selectedEdges.length > 0) && (
            <button
              className="wf-icon-button wf-danger"
              aria-label={tr('删除选中')}
              title={tr('删除选中')}
              onClick={() => remove()}
            >
              <WorkflowIcon name="trash" size={16} />
            </button>
          )}
          <i />
          <button
            className="wf-icon-button"
            aria-label={tr('撤销')}
            title={tr('撤销（Ctrl / ⌘ + Z）')}
            disabled={!past.length}
            onClick={undo}
          >
            <WorkflowIcon name="undo" size={16} />
          </button>
          <button
            className="wf-icon-button"
            aria-label={tr('重做')}
            title={tr('重做（Ctrl / ⌘ + Shift + Z）')}
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
              aria-label={tr('关闭提示')}
              onClick={() => setNotice("")}
            >
              <WorkflowIcon name="close" size={14} />
            </button>
          </div>
        )}
      </div>
      <WorkflowTimeline
        result={result}
        plan={{ ...plan, nodes: inference.nodes }}
        entities={entities}
        day={day}
        onDay={setDay}
        onNode={focus}
      />
    </div>
  );
}
