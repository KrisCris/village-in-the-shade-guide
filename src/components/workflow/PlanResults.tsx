import { useState } from "react";
import type { Entity } from "../../data/types";
import type {
  SimulationResult,
  WorkflowPlan,
  PlanEvent,
} from "../../domain/workflow/types";
import { formatDay } from "../../domain/workflow/date";

const labels: Record<PlanEvent["kind"], string> = {
  purchase: "买种 / 买入",
  plant: "播种 / 补种",
  harvest: "收获",
  process: "投料",
  complete: "加工完成",
  reserve: "留货",
  delivery: "交付",
  consume: "消耗",
  sale: "出货",
  receipt: "到账",
  warning: "未能执行",
};
const number = (n: number) =>
  Number.isInteger(n)
    ? n.toLocaleString()
    : `≈${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
export default function PlanResults({
  result,
  plan,
  entities,
  selectedDay,
  onDay,
  onNode,
  compact = false,
}: {
  result: SimulationResult;
  plan: WorkflowPlan;
  entities: Entity[];
  selectedDay: number;
  onDay: (n: number) => void;
  onNode: (id: string) => void;
  compact?: boolean;
}) {
  const [onlyProblems, setOnlyProblems] = useState(false);
  const months = [
    ...new Set(result.days.map((d) => Math.floor((d.day - 1) / 28))),
  ];
  const month = Math.max(0, months.indexOf(Math.floor((selectedDay - 1) / 28)));
  const currentMonth = months[month];
  const days = result.days.filter(
    (d) => Math.floor((d.day - 1) / 28) === currentMonth,
  );
  const daily = days.find((d) => d.day === selectedDay) ?? days[0];
  const selectMonth = (index: number) => {
    const firstDay = result.days.find(
      (d) => Math.floor((d.day - 1) / 28) === months[index],
    );
    if (firstDay) onDay(firstDay.day);
  };
  const name = (id: string) =>
    entities.find((e) => e.kind === "items" && e.id === id)?.name.zh_hans ?? id;
  const nodeName = (id: string) =>
    plan.nodes.find((n) => n.id === id)?.label ?? "计划";
  return (
    <section className="wf-results" aria-label="每日推演结果">
      <div className="wf-metrics">
        {[
          ["到账收入", result.income],
          ["实际支出", result.spending],
          ["现金净流入", result.income - result.spending],
          ["期末现金", result.cash],
          ["待到账", result.pendingRevenue],
        ].map(([label, value]) => (
          <div key={label}>
            <small>{label}</small>
            <strong>{number(Number(value))}</strong>
          </div>
        ))}
      </div>
      {result.issues.length > 0 && (
        <div className="wf-error" role="status">
          {result.issues.slice(0, 8).map((issue, i) => (
            <p key={i}>{issue}</p>
          ))}
        </div>
      )}
      {!compact && (
        <>
          <div className="wf-panel-title">
            <h2>每日安排</h2>
            <div className="wf-month-nav">
              <button
                aria-label="上个月"
                disabled={month <= 0}
                onClick={() => selectMonth(month - 1)}
              >
                ‹
              </button>
              <span>
                {currentMonth !== undefined
                  ? formatDay(currentMonth * 28 + 1).replace("1日", "季")
                  : ""}
              </span>
              <button
                aria-label="下个月"
                disabled={month >= months.length - 1}
                onClick={() => selectMonth(month + 1)}
              >
                ›
              </button>
            </div>
          </div>
          <p className="wf-note">
            每一轮购买、播种和收获都会单独列出。点击日期查看当天清单，点击操作定位节点。
          </p>
          <div className="wf-calendar">
            {days.length > 0 &&
              Array.from({ length: (days[0].day - 1) % 28 }, (_, i) => (
                <div key={`blank-${i}`} className="wf-day-empty" />
              ))}
            {days.map((d) => {
              const sow = d.events.filter((e) => e.kind === "plant"),
                buy = d.events.filter((e) => e.kind === "purchase"),
                harvest = d.events.filter((e) => e.kind === "harvest"),
                warnings = d.events.filter((e) => e.kind === "warning");
              return (
                <button
                  className={`wf-day ${d.day === daily?.day ? "active" : ""}`}
                  key={d.day}
                  onClick={() => onDay(d.day)}
                  aria-label={`${formatDay(d.day)}，${buy.length} 次购买，${sow.length} 次播种，${harvest.length} 次收获`}
                >
                  <b>{((d.day - 1) % 28) + 1}</b>
                  <div>
                    {buy.length > 0 && (
                      <span className="wf-tag buy">买入 {buy.length}</span>
                    )}
                    {sow.length > 0 && (
                      <span className="wf-tag plant">播种 {sow.length}</span>
                    )}
                    {harvest.length > 0 && (
                      <span className="wf-tag harvest">
                        收获 {harvest.length}
                      </span>
                    )}
                    {d.events.some((e) => e.kind === "process") && (
                      <span className="wf-tag">加工</span>
                    )}
                    {warnings.length > 0 && (
                      <span className="wf-tag warn">
                        缺口 {warnings.length}
                      </span>
                    )}
                  </div>
                  <small>余额 {number(d.cash)}</small>
                </button>
              );
            })}
          </div>
        </>
      )}
      {daily && (
        <div className="wf-daily">
          <div className="wf-panel-title">
            <h3>{formatDay(daily.day)}</h3>
            <label className="wf-check">
              <input
                type="checkbox"
                checked={onlyProblems}
                onChange={(e) => setOnlyProblems(e.target.checked)}
              />
              只看未完成
            </label>
          </div>
          <ul className="wf-events">
            {daily.events
              .filter((e) => !onlyProblems || e.kind === "warning")
              .map((e, i) => (
                <li key={i} className={e.kind === "warning" ? "warning" : ""}>
                  <span
                    className={`wf-tag ${e.kind === "purchase" ? "buy" : e.kind === "plant" ? "plant" : ""}`}
                  >
                    {labels[e.kind]}
                  </span>
                  <button onClick={() => onNode(e.nodeId)}>
                    {nodeName(e.nodeId)}
                  </button>
                  <span>{e.message}</span>
                  {e.amount !== undefined && <b>{number(e.amount)}</b>}
                </li>
              ))}
          </ul>
          {!daily.events.length && (
            <p className="wf-note">这一天没有操作，作物和机器继续等待。</p>
          )}
          <details>
            <summary>当天库存 · {daily.stock.length} 项</summary>
            <div className="wf-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>所在节点</th>
                    <th>物品</th>
                    <th>数量</th>
                    <th>用途</th>
                  </tr>
                </thead>
                <tbody>
                  {daily.stock.map((s, i) => (
                    <tr key={i}>
                      <td>
                        <button onClick={() => onNode(s.nodeId)}>
                          {nodeName(s.nodeId)}
                        </button>
                      </td>
                      <td>{name(s.itemId)}</td>
                      <td>{s.quantity}</td>
                      <td>{s.reserved ? "已留货" : "可用 / 待加工"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
      <details>
        <summary>期末仍在生长 / 加工 · {result.inProgress.length} 项</summary>
        <ul>
          {result.inProgress.map((p, i) => (
            <li key={i}>
              {nodeName(p.nodeId)} · {name(p.itemId)} ×{p.quantity} · 预计{" "}
              {formatDay(p.finishDay)} 完成
            </li>
          ))}
        </ul>
      </details>
      <p className="wf-note">
        现金净流入只计算本期到账与支出；库存、留货和在制品不计为现金收入。当前结果为所设时间范围的合计。
      </p>
    </section>
  );
}
