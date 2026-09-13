import { useRef } from "react";

export default function ResizeHandle({
  axis,
  value,
  min,
  max,
  onChange,
  label,
}: {
  axis: "width" | "height";
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
}) {
  const drag = useRef<{ start: number; value: number } | null>(null);
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div
      className={`wf-resize wf-resize-${axis}`}
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={axis === "width" ? "vertical" : "horizontal"}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = {
          start: axis === "width" ? e.clientX : e.clientY,
          value,
        };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        onChange(
          clamp(
            drag.current.value +
              drag.current.start -
              (axis === "width" ? e.clientX : e.clientY),
          ),
        );
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onKeyDown={(e) => {
        const decrease = axis === "width" ? "ArrowRight" : "ArrowDown";
        const increase = axis === "width" ? "ArrowLeft" : "ArrowUp";
        if (e.key === decrease || e.key === increase) {
          e.preventDefault();
          onChange(clamp(value + (e.key === increase ? 20 : -20)));
        }
      }}
    >
      <span />
    </div>
  );
}
