import type { Entity } from "../../data/types";
import type {
  WorkflowNode,
  SimulationResult,
} from "../../domain/workflow/types";
import { demandRows } from "../../domain/workflow/editing";
import { formatDay } from "../../domain/workflow/date";
import { withBase } from "../../lib/sitePath";
import WorkflowIcon from "./WorkflowIcon";
export default function DemandDetails({
  node,
  result,
  day,
  entities,
  onPrepare,
}: {
  node: WorkflowNode;
  result: SimulationResult;
  day: number;
  entities: Entity[];
  onPrepare: () => void;
}) {
  const rows = demandRows(node, result, day),
    p = result.intent?.nodes[node.id];
  const delivered = result.events.some(
    (e) => e.nodeId === node.id && e.kind === "delivery" && e.day <= day,
  );
  const shortage = rows.reduce((s, a) => s + a.shortage, 0);
  const ready = rows.length > 0 && rows.every((a) => a.held >= a.quantity);
  return (
    <section className="wf-demand-detail" aria-label="交付准备进度">
      <div className="wf-demand-heading">
        <WorkflowIcon name="delivery" size={24} />
        <div>
          <strong>
            {delivered
              ? "已交付"
              : ready
                ? "已备齐，可以交付"
                : p?.readyDay !== undefined
                  ? `${formatDay(p.readyDay)} 可备齐`
                  : "仍需补齐前置条件"}
          </strong>
          <small>
            截至 {formatDay(day)} ·{" "}
            {rows.filter((a) => a.held >= a.quantity).length} / {rows.length}{" "}
            项已足
          </small>
        </div>
      </div>
      {rows.map((a) => {
        const item = entities.find((e) => e.id === a.itemId);
        return (
          <div
            key={a.itemId}
            className={`wf-demand-item ${a.held >= a.quantity ? "ready" : ""}`}
          >
            {item?.icon_path ? (
              <img
                src={withBase(item.icon_path)}
                width={32}
                height={32}
                alt=""
              />
            ) : (
              <WorkflowIcon name="inventory" size={28} />
            )}
            <div>
              <strong>{item?.name.zh_hans ?? a.itemId}</strong>
              <small>
                {a.held >= a.quantity
                  ? "已足"
                  : a.shortage
                    ? `计划仍缺 ${a.shortage} 个`
                    : a.readyDay !== undefined
                      ? `${formatDay(a.readyDay)} 备齐`
                      : "等待来源"}
              </small>
            </div>
            <b>
              {a.held}
              <span> / {a.quantity}</span>
            </b>
            <progress
              max={a.quantity || 1}
              value={a.held}
              aria-label={`${item?.name.zh_hans ?? a.itemId}备货进度`}
            />
          </div>
        );
      })}
      {shortage > 0 && (
        <button className="wf-primary" onClick={onPrepare}>
          <WorkflowIcon name="plus" />
          按缺口生成前置流程
        </button>
      )}
      {shortage > 0 && (
        <p className="wf-note">
          优先使用可用余料，再安排种植、加工或购买。采集等未知来源会标为待准备，确认取得后才计入可交付数量。
        </p>
      )}
    </section>
  );
}
