import { useEffect, useRef, useState } from "react";
import type { Entity } from "../../data/types";
import type {
  SimulationResult,
  WorkflowPlan,
} from "../../domain/workflow/types";
import { formatDay } from "../../domain/workflow/date";
import WorkflowIcon from "./WorkflowIcon";
import PlanResults from "./PlanResults";
import ResizeHandle from "./ResizeHandle";

export default function WorkflowTimeline({
  result,
  plan,
  entities,
  day,
  onDay,
  onNode,
}: {
  result: SimulationResult;
  plan: WorkflowPlan;
  entities: Entity[];
  day: number;
  onDay: (day: number) => void;
  onNode: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [height, setHeight] = useState(400);
  const active = useRef<HTMLButtonElement>(null);
  const daily = result.days.find((d) => d.day === day);
  const month = Math.floor((day - 1) / 28);
  const days = result.days.filter(
    (d) => Math.floor((d.day - 1) / 28) === month,
  );
  const warnings =
    daily?.events.filter((e) => e.kind === "warning").length ?? 0;
  const nextMonth = (offset: number) => {
    const d = result.days.find(
      (d) => Math.floor((d.day - 1) / 28) === month + offset,
    );
    if (d) onDay(d.day);
  };
  useEffect(() => {
    active.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [day]);
  return (
    <section
      className={`wf-timeline ${expanded ? "is-expanded" : ""}`}
      aria-label="生产日程"
      style={expanded ? { height } : undefined}
    >
      {expanded && (
        <ResizeHandle
          axis="height"
          label="调整日程面板高度"
          value={height}
          min={240}
          max={Math.max(240, window.innerHeight * 0.6)}
          onChange={setHeight}
        />
      )}
      <div className="wf-timeline-heading">
        <button
          className="wf-timeline-toggle"
          aria-label={expanded ? "收起生产日程" : "展开生产日程"}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          <WorkflowIcon name="calendar" />
          <strong>生产日程</strong>
          <WorkflowIcon name="chevron" size={14} />
        </button>
        <div className="wf-month-switch">
          <button
            aria-label="查看上月"
            disabled={
              !result.days.some((d) => Math.floor((d.day - 1) / 28) < month)
            }
            onClick={() => nextMonth(-1)}
          >
            ‹
          </button>
          <span>{formatDay(month * 28 + 1).replace("1日", "季")}</span>
          <button
            aria-label="查看下月"
            disabled={
              !result.days.some((d) => Math.floor((d.day - 1) / 28) > month)
            }
            onClick={() => nextMonth(1)}
          >
            ›
          </button>
        </div>
        <span className="wf-timeline-legend">
          <i className="buy" />
          买种
          <i className="plant" />
          播种
          <i className="harvest" />
          收获
        </span>
        <button
          className="wf-timeline-summary"
          onClick={() => setExpanded(!expanded)}
        >
          {formatDay(day)} · {daily?.events.length ?? 0} 项操作
          {warnings ? ` · ${warnings} 项未完成` : ""}
          <WorkflowIcon name="chevron" size={14} />
        </button>
      </div>
      <div className="wf-day-strip">
        {days.map((d) => {
          const buy = d.events.filter((e) => e.kind === "purchase").length;
          const sow = d.events.filter((e) => e.kind === "plant").length;
          const harvest = d.events.filter((e) => e.kind === "harvest").length;
          const warning = d.events.some((e) => e.kind === "warning");
          return (
            <button
              key={d.day}
              ref={d.day === day ? active : undefined}
              className={`wf-strip-day ${d.day === day ? "active" : ""}`}
              aria-pressed={d.day === day}
              aria-label={`${formatDay(d.day)}，买入 ${buy} 次，播种 ${sow} 次，收获 ${harvest} 次${warning ? "，有未完成操作" : ""}`}
              title={`${formatDay(d.day)} · 买入 ${buy} / 播种 ${sow} / 收获 ${harvest}`}
              onClick={() => onDay(d.day)}
              onDoubleClick={() => setExpanded(true)}
            >
              <span>
                {((d.day - 1) % 28) + 1}
                {warning && <i className="wf-day-warning" />}
              </span>
              <span className="wf-day-marks">
                {buy > 0 && (
                  <i className="buy">
                    <WorkflowIcon name="purchase" size={12} />
                  </i>
                )}
                {sow > 0 && (
                  <i className="plant">
                    <WorkflowIcon name="plant" size={12} />
                  </i>
                )}
                {harvest > 0 && (
                  <i className="harvest">
                    <WorkflowIcon name="harvest" size={12} />
                  </i>
                )}
                {!buy && !sow && !harvest && (
                  <i className={d.events.length ? "other" : "idle"} />
                )}
              </span>
            </button>
          );
        })}
      </div>
      {expanded && (
        <div className="wf-timeline-detail">
          <PlanResults
            result={result}
            plan={plan}
            entities={entities}
            selectedDay={day}
            onDay={onDay}
            onNode={onNode}
            compact
          />
        </div>
      )}
    </section>
  );
}
