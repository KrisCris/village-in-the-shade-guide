import { useEffect, useRef, useState } from "react";
import farmland from "../../../data/sources/game-farmland.json";
import { mapCell, sourceCell } from "../../domain/workflow/farmland";
import WorkflowIcon from "./WorkflowIcon";
const shapes = farmland.shapes;
type Selection = { shapeId: string; cells: string[] };
export default function FarmlandPicker({
  value,
  onApply,
}: {
  value?: Selection;
  onApply: (quantity: number, selection: Selection) => void;
}) {
  const [open, setOpen] = useState(false),
    [shapeId, setShapeId] = useState(
      value?.shapeId ?? shapes.find((s) => s.count === 437)!.id,
    );
  const [selected, setSelected] = useState(() => {
    const source = shapes.find((s) => s.id === shapeId) ?? shapes[0];
    return new Set(
      (value?.cells ?? []).map((cell) => {
        const [x, y] = cell.split(",").map(Number);
        return mapCell(x, y, source.height).join(",");
      }),
    );
  });
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
        onClick={() => setOpen(true)}
      >
        <WorkflowIcon name="select" />
        框选田块，自动数格{value ? ` · ${value.cells.length} 格` : ""}
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
              <span>拖出矩形选区；Shift 拖动取消。缺角会自动跳过。</span>
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
                setSelected(new Set());
                setDrag(null);
              }}
            >
              {shapes.map((s) => (
                <option key={s.id} value={s.id}>
                  {label(s)} · {s.count} 格
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
          </div>
          <div className="wf-farm-grid-wrap">
            <svg
              ref={grid}
              className="wf-farm-grid"
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
              {shape.cells.map(([x, y]) => (
                <rect
                  key={key(x, y)}
                  x={x * 24 + 2}
                  y={y * 24 + 2}
                  width={20}
                  height={20}
                  rx={3}
                  className={preview.has(key(x, y)) ? "chosen" : ""}
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
                />
              ))}
            </svg>
          </div>
          <div className="wf-farm-summary">
            <strong>已选 {preview.size} 格</strong>
            <span>
              地形共 {shape.count} 格 · {shape.width} × {shape.height} 外框
            </span>
          </div>
          <p className="wf-farm-note">
            请取消建筑、机器、稻草人和其他作物占用的格子。田块是否解锁、温室外围是否可达需按自己的游戏状态选择；这里展示地图的可耕标记。
          </p>
          <footer className="wf-picker-footer">
            <span>应用后设置本节点的播种规模</span>
            <button
              className="wf-primary"
              disabled={!selected.size}
              onClick={() => {
                onApply(selected.size, {
                  shapeId: shape.id,
                  cells: [...selected].map((cell) => {
                    const [x, y] = cell.split(",").map(Number);
                    return sourceCell(x, y, source.height).join(",");
                  }),
                });
                setOpen(false);
              }}
            >
              使用 {selected.size} 格
            </button>
          </footer>
        </dialog>
      )}
    </>
  );
}
