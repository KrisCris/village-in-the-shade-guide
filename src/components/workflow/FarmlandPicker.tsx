import { useEffect, useRef, useState, useId } from "react";
import farmland from "../../../data/sources/game-farmland.json";
import {
  mapCell,
  sourceCell,
  farmlandPlots,
  type farmlandUsage,
} from "../../domain/workflow/farmland";
import type { FarmlandSelection } from "../../domain/workflow/types";
import { formatDay } from "../../domain/workflow/date";
import WorkflowIcon from "./WorkflowIcon";
const shapes = farmland.shapes;
export default function FarmlandPicker({
  value,
  onApply,
  usage,
}: {
  value?: FarmlandSelection;
  onApply: (quantity: number, selection: FarmlandSelection) => void;
  usage: ReturnType<typeof farmlandUsage>;
}) {
  const hatchId = useId().replace(/:/g, "") + "-occupied";
  const [open, setOpen] = useState(false),
    [shapeId, setShapeId] = useState(
      farmlandPlots(value)[0]?.shapeId ??
        shapes.find((s) => s.count === 437)!.id,
    );
  const [draft, setDraft] = useState(() => farmlandPlots(value));
  const [drag, setDrag] = useState<{
    start: [number, number];
    end: [number, number];
    remove: boolean;
  } | null>(null);
  const ref = useRef<HTMLDialogElement>(null),
    grid = useRef<SVGSVGElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const source = shapes.find((s) => s.id === shapeId) ?? shapes[0];
  const shape = {
    ...source,
    width: source.height,
    height: source.width,
    cells: source.cells.map(([x, y]) => mapCell(x, y, source.height)),
  };
  const label = (s: typeof source) =>
    s.label.includes("温室")
      ? `${s.label} · ${s.count === 100 ? "中央田区" : "外围地形标记"}`
      : s.label;
  const key = (x: number, y: number) => `${x},${y}`;
  const selected = new Set(
    (draft.find((p) => p.shapeId === shapeId)?.cells ?? []).map((cell) => {
      const [x, y] = cell.split(",").map(Number);
      return mapCell(x, y, source.height).join(",");
    }),
  );
  const setSelected = (cells: Set<string>) =>
    setDraft((previous) =>
      [
        ...previous.filter((p) => p.shapeId !== shapeId),
        {
          shapeId,
          cells: [...cells].map((cell) => {
            const [x, y] = cell.split(",").map(Number);
            return sourceCell(x, y, source.height).join(",");
          }),
        },
      ].filter((p) => p.cells.length),
    );
  const uses = usage.occupied.get(shapeId);
  const cellUses = (x: number, y: number) =>
    uses?.get(sourceCell(x, y, source.height).join(",")) ?? [];
  const cellStatus = (x: number, y: number) => {
    const list = cellUses(x, y);
    return list.some((u) => u.status === "conflict")
      ? "conflict"
      : list.some((u) => u.status === "unknown")
        ? "unknown"
        : list.length
          ? "separate"
          : "";
  };
  const owners = [
    ...new Map(
      [...(uses?.values() ?? [])].flat().map((u) => [u.nodeId, u]),
    ).values(),
  ];
  const statusText = {
    conflict: "种植时间重叠",
    separate: "其他时段使用",
    unknown: "日期待定",
  };
  const inside = (x: number, y: number) =>
    drag &&
    x >= Math.min(drag.start[0], drag.end[0]) &&
    x <= Math.max(drag.start[0], drag.end[0]) &&
    y >= Math.min(drag.start[1], drag.end[1]) &&
    y <= Math.max(drag.start[1], drag.end[1]);
  const preview = new Set(selected);
  if (drag)
    for (const [x, y] of shape.cells)
      if (inside(x, y)) {
        if (drag.remove) preview.delete(key(x, y));
        else preview.add(key(x, y));
      }
  const total =
    draft
      .filter((p) => p.shapeId !== shapeId)
      .reduce((s, p) => s + p.cells.length, 0) + preview.size;
  const selectedConflicts = draft.reduce(
    (sum, p) =>
      sum +
      p.cells.filter((c) =>
        usage.occupied
          .get(p.shapeId)
          ?.get(c)
          ?.some((u) => u.status === "conflict"),
      ).length,
    0,
  );
  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    el?.showModal();
    return () => {
      el?.close();
      trigger.current?.focus({ preventScroll: true });
    };
  }, [open]);
  const point = (
    event: React.PointerEvent<SVGSVGElement>,
  ): [number, number] => {
    const pt = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      grid.current!.getScreenCTM()!.inverse(),
    );
    return [
      Math.max(0, Math.min(shape.width - 1, Math.floor(pt.x / 24))),
      Math.max(0, Math.min(shape.height - 1, Math.floor(pt.y / 24))),
    ];
  };
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="wf-farm-trigger"
        onClick={() => {
          setDraft(farmlandPlots(value));
          setDrag(null);
          setOpen(true);
        }}
      >
        <WorkflowIcon name="select" />
        框选田块，自动数格
        {value
          ? ` · ${farmlandPlots(value).reduce((s, p) => s + p.cells.length, 0)} 格`
          : ""}
      </button>
      {open && (
        <dialog
          ref={ref}
          className="wf-picker-dialog wf-farm-dialog"
          aria-label="框选可种植田块"
          onCancel={(e) => {
            e.preventDefault();
            setOpen(false);
          }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <header className="wf-picker-heading">
            <div>
              <h2>选出这次要种的田</h2>
              <span>可跨地图选择，切换地图保留选区；Shift 拖动取消。</span>
            </div>
            <button aria-label="关闭田地选择" onClick={() => setOpen(false)}>
              <WorkflowIcon name="close" />
            </button>
          </header>
          <div className="wf-farm-toolbar">
            <select
              aria-label="田块形状"
              value={shapeId}
              onChange={(e) => {
                setShapeId(e.target.value);
                setDrag(null);
              }}
            >
              {shapes.map((s) => (
                <option key={s.id} value={s.id}>
                  {label(s)} · {s.count} 格
                  {draft.find((p) => p.shapeId === s.id)?.cells.length
                    ? ` · 已选 ${draft.find((p) => p.shapeId === s.id)!.cells.length}`
                    : ""}
                </option>
              ))}
            </select>
            <button
              onClick={() =>
                setSelected(new Set(shape.cells.map(([x, y]) => key(x, y))))
              }
            >
              全选
            </button>
            <button onClick={() => setSelected(new Set())}>清空</button>
            <button
              onClick={() =>
                setSelected(
                  new Set(
                    shape.cells
                      .filter(
                        ([x, y]) =>
                          !["conflict", "unknown"].includes(cellStatus(x, y)),
                      )
                      .map(([x, y]) => key(x, y)),
                  ),
                )
              }
            >
              仅选可用
            </button>
          </div>
          <div className="wf-farm-maps" aria-label="已选地图">
            {draft.map((p) => (
              <button
                key={p.shapeId}
                className={p.shapeId === shapeId ? "active" : ""}
                onClick={() => {
                  setShapeId(p.shapeId);
                  setDrag(null);
                }}
              >
                {label(shapes.find((s) => s.id === p.shapeId)!)} ·{" "}
                {p.cells.length} 格
              </button>
            ))}
          </div>
          <div className="wf-farm-legend" role="list" aria-label="田块状态图例">
            {[
              ["", "未分配"],
              ["chosen", "本次选择"],
              ["conflict", "同时占用"],
              ["unknown", "待排期"],
              ["separate", "其他时段"],
            ].map(([state, label]) => (
              <span key={label} role="listitem">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                >
                  <rect
                    x="2"
                    y="2"
                    width="20"
                    height="20"
                    rx="3"
                    className={`wf-farm-cell ${state}`}
                    style={
                      state === "conflict"
                        ? { fill: `url(#${hatchId})` }
                        : undefined
                    }
                  />
                </svg>
                {label}
              </span>
            ))}
          </div>
          <div className="wf-farm-grid-wrap">
            <svg
              ref={grid}
              className="wf-farm-grid"
              style={{ maxWidth: shape.width * 32 }}
              viewBox={`0 0 ${shape.width * 24} ${shape.height * 24}`}
              role="group"
              aria-label="田块格子，按住拖动框选"
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                const p = point(e);
                setDrag({
                  start: p,
                  end: p,
                  remove: e.shiftKey || selected.has(key(...p)),
                });
              }}
              onPointerMove={(e) => {
                if (drag) setDrag({ ...drag, end: point(e) });
              }}
              onPointerUp={(e) => {
                if (drag) {
                  setSelected(preview);
                  setDrag(null);
                }
                if (e.currentTarget.hasPointerCapture(e.pointerId))
                  e.currentTarget.releasePointerCapture(e.pointerId);
              }}
              onPointerCancel={() => setDrag(null)}
            >
              <defs>
                <pattern
                  id={hatchId}
                  width="7"
                  height="7"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M-1,1 L1,-1 M0,7 L7,0 M6,8 L8,6"
                    stroke="var(--vermilion)"
                    strokeWidth="2"
                  />
                </pattern>
              </defs>
              {shape.cells.map(([x, y]) => (
                <rect
                  key={key(x, y)}
                  x={x * 24 + 2}
                  y={y * 24 + 2}
                  width={20}
                  height={20}
                  rx={3}
                  className={`wf-farm-cell ${preview.has(key(x, y)) ? "chosen" : ""} ${cellStatus(x, y)}`}
                  style={
                    cellStatus(x, y) === "conflict"
                      ? { fill: `url(#${hatchId})` }
                      : undefined
                  }
                  role="checkbox"
                  aria-checked={preview.has(key(x, y))}
                  aria-label={`第 ${y + 1} 行第 ${x + 1} 格`}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      const next = new Set(selected);
                      if (next.has(key(x, y))) next.delete(key(x, y));
                      else next.add(key(x, y));
                      setSelected(next);
                    }
                  }}
                >
                  <title>
                    {cellUses(x, y)
                      .map((u) => `${u.label}：${statusText[u.status]}`)
                      .join("；") || "未被其他节点分配"}
                  </title>
                </rect>
              ))}
            </svg>
          </div>
          <div className="wf-farm-summary">
            <strong>已选 {total} 格</strong>
            <span>
              当前地图 {preview.size} / {shape.count} 格
            </span>
          </div>
          {owners.length > 0 && (
            <details className="wf-farm-occupancy" open>
              <summary>当前地图有 {uses?.size} 格已分配给其他种植</summary>
              <ul>
                {owners.map((u) => (
                  <li key={u.nodeId} className={u.status}>
                    <strong>{u.label}</strong> · {statusText[u.status]}
                    {u.spans.length
                      ? ` · ${formatDay(Math.min(...u.spans.map((s) => s.start)))} 起`
                      : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {selectedConflicts > 0 && (
            <p className="wf-farm-warning" role="status">
              已选格子中有 {selectedConflicts}{" "}
              格与其他种植时间重叠，请调整选区或种植日期。
            </p>
          )}
          <p className="wf-farm-note">
            请取消建筑、机器、稻草人和其他作物占用的格子。田块是否解锁、温室外围是否可达需按自己的游戏状态选择；这里展示地图的可耕标记。
            {usage.unmapped > 0
              ? `另有 ${usage.unmapped} 个种植节点未分配地图格子，无法定位占地。`
              : ""}
          </p>
          <footer className="wf-picker-footer">
            <span>应用后设置本节点的播种规模</span>
            <button
              className="wf-primary"
              disabled={!total}
              onClick={() => {
                onApply(total, { plots: farmlandPlots({ plots: draft }) });
                setOpen(false);
              }}
            >
              使用 {total} 格
            </button>
          </footer>
        </dialog>
      )}
    </>
  );
}
