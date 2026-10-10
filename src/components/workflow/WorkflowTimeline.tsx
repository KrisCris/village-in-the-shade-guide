import { useEffect, useRef, useState } from "react";
import type { Entity } from "../../data/types";
import type {
  SimulationResult,
  WorkflowPlan,
} from "../../domain/workflow/types";
import { formatDay, formatSeason } from "../../domain/workflow/date";
import WorkflowIcon from "./WorkflowIcon";
import PlanResults from "./PlanResults";
import ResizeHandle from "./ResizeHandle";
import { tr } from '../../i18n/active';

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
    const months = [
      ...new Set(result.days.map((d) => Math.floor((d.day - 1) / 28))),
    ];
    const target = months[months.indexOf(month) + offset];
    const d = result.days.find((d) => Math.floor((d.day - 1) / 28) === target);
    if (d) onDay(d.day);
  };
  useEffect(() => {
    active.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [day]);
  return (
    <section
      className={`wf-timeline ${expanded ? "is-expanded" : ""}`}
      aria-label={tr('生产日程')}
      style={expanded ? { height } : undefined}
    >
      {expanded && (
        <ResizeHandle
          axis="height"
          label={tr('调整日程面板高度')}
          value={height}
          min={240}
          max={Math.max(240, window.innerHeight * 0.6)}
          onChange={setHeight}
        />
      )}
      <div className="wf-timeline-heading">
        <button
          className="wf-timeline-toggle"
          aria-label={expanded ? tr('收起生产日程') : tr('展开生产日程')}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          <WorkflowIcon name="calendar" />
          <strong>{tr('生产日程')}</strong>
          <WorkflowIcon name="chevron" size={14} />
        </button>
        <div className="wf-month-switch">
          <button
            aria-label={tr('查看上月')}
            disabled={
              !result.days.some((d) => Math.floor((d.day - 1) / 28) < month)
            }
            onClick={() => nextMonth(-1)}
          >
            ‹
          </button>
          <span>{formatSeason(month * 28 + 1)}</span>
          <button
            aria-label={tr('查看下月')}
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
          {tr('买种')}
          <i className="plant" />
          {tr('播种')}
          <i className="harvest" />
          {tr('收获')}
        </span>
        <button
          className="wf-timeline-summary"
          onClick={() => setExpanded(!expanded)}
        >
          {tr('{date} · 买入 {count} 个 · 今日支出 -{spending}', {
            date: formatDay(day),
            count: daily?.events
              .filter((e) => e.kind === "purchase")
              .reduce((s, e) => s + (e.quantity ?? 0), 0) ?? 0,
            spending: (daily?.spending ?? 0).toLocaleString(),
          })}
          {(daily?.income ?? 0) > 0 ? tr(' · 到账 +{amount}', { amount: daily!.income.toLocaleString() }) : ""}
          {warnings ? tr(' · {warnings} 项未完成', { warnings }) : ""}
          <WorkflowIcon name="chevron" size={14} />
        </button>
      </div>
      <div className="wf-day-strip">
        {days.map((d) => {
          const buy = d.events
            .filter((e) => e.kind === "purchase")
            .reduce((s, e) => s + (e.quantity ?? 0), 0);
          const sow = d.events
            .filter((e) => e.kind === "plant")
            .reduce((s, e) => s + (e.quantity ?? 0), 0);
          const harvest = d.events
            .filter((e) => e.kind === "harvest")
            .reduce((s, e) => s + (e.quantity ?? 0), 0);
          const warning = d.events.some((e) => e.kind === "warning");
          return (
            <button
              key={d.day}
              ref={d.day === day ? active : undefined}
              className={`wf-strip-day ${d.day === day ? "active" : ""}`}
              aria-pressed={d.day === day}
              aria-label={warning ? tr('{date}，买入 {buy} 个，播种 {sow} 格，收获 {harvest} 个，有未完成操作', { date: formatDay(d.day), buy, sow, harvest }) : tr('{date}，买入 {buy} 个，播种 {sow} 格，收获 {harvest} 个', { date: formatDay(d.day), buy, sow, harvest })}
              title={tr('{date} · 买入 {buy} / 播种 {sow} / 收获 {harvest}', { date: formatDay(d.day), buy, sow, harvest })}
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
                    <em>{buy}</em>
                  </i>
                )}
                {sow > 0 && (
                  <i className="plant">
                    <WorkflowIcon name="plant" size={12} />
                    <em>{sow}</em>
                  </i>
                )}
                {harvest > 0 && (
                  <i className="harvest">
                    <WorkflowIcon name="harvest" size={12} />
                    <em>{harvest}</em>
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
