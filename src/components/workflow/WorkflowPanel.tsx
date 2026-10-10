import { useEffect, useRef, useState, type ReactNode } from "react";
import ResizeHandle from "./ResizeHandle";
import WorkflowIcon, { type IconName } from "./WorkflowIcon";
import { tr } from '../../i18n/active';

export default function WorkflowPanel({
  title,
  icon,
  width,
  onWidth,
  onClose,
  children,
}: {
  title: string;
  icon: IconName;
  width: number;
  onWidth: (width: number) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const element = useRef<HTMLElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const constrain = (x: number, y: number) => {
    const panel = element.current,
      parent = panel?.parentElement;
    return panel && parent
      ? {
          x: Math.min(
            0,
            Math.max(80 + panel.offsetWidth - parent.clientWidth, x),
          ),
          y: Math.max(
            0,
            Math.min(parent.clientHeight - panel.offsetHeight - 32, y),
          ),
        }
      : { x: 0, y: 0 };
  };
  useEffect(() => {
    const parent = element.current?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(() =>
      setOffset((p) => constrain(p.x, p.y)),
    );
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);
  useEffect(() => setOffset((p) => constrain(p.x, p.y)), [width]);
  return (
    <aside
      ref={element}
      className="wf-property-panel wf-floating"
      style={{ width, transform: `translate(${offset.x}px,${offset.y}px)` }}
      aria-label={tr('属性面板')}
    >
      <ResizeHandle
        axis="width"
        label={tr('调整属性面板宽度')}
        value={width}
        min={280}
        max={Math.max(280, Math.min(640, window.innerWidth - 100))}
        onChange={onWidth}
      />
      <div
        className="wf-floating-header wf-panel-drag"
        title={tr('拖动标题栏移动面板')}
        onPointerDown={(e) => {
          if (e.button !== 0 || (e.target as HTMLElement).closest("button"))
            return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            left: offset.x,
            top: offset.y,
          };
        }}
        onPointerMove={(e) => {
          if (drag.current)
            setOffset(
              constrain(
                drag.current.left + e.clientX - drag.current.x,
                drag.current.top + e.clientY - drag.current.y,
              ),
            );
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <strong>
          <WorkflowIcon name={icon} />
          {title}
        </strong>
        <button
          className="wf-icon-button"
          aria-label={tr('关闭属性面板')}
          onClick={onClose}
        >
          <WorkflowIcon name="close" size={16} />
        </button>
      </div>
      <div className="wf-property-content">{children}</div>
    </aside>
  );
}
