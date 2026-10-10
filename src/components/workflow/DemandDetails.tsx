import type { Entity } from "../../data/types";
import type {
  WorkflowNode,
  SimulationResult,
} from "../../domain/workflow/types";
import { demandRows } from "../../domain/workflow/editing";
import { formatDay } from "../../domain/workflow/date";
import { withBase } from "../../lib/sitePath";
import WorkflowIcon from "./WorkflowIcon";
import { tr } from '../../i18n/active';
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
    <section className="wf-demand-detail" aria-label={tr('交付准备进度')}>
      <div className="wf-demand-heading">
        <WorkflowIcon name="delivery" size={24} />
        <div>
          <strong>
            {delivered
              ? tr('已交付')
              : ready
                ? tr('已备齐，可以交付')
                : p?.readyDay !== undefined
                  ? tr('{date} 可备齐', { date: formatDay(p.readyDay) })
                  : tr('仍需补齐前置条件')}
          </strong>
          <small>
            {tr('截至 {date} · {ready} / {total} 项已足', {
              date: formatDay(day),
              ready: rows.filter((a) => a.held >= a.quantity).length,
              total: rows.length,
            })}
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
                  ? tr('已足')
                  : a.shortage
                    ? tr('计划仍缺 {shortage} 个', { shortage: a.shortage })
                    : a.readyDay !== undefined
                      ? tr('{date} 备齐', { date: formatDay(a.readyDay) })
                      : tr('等待来源')}
              </small>
            </div>
            <b>
              {a.held}
              <span> / {a.quantity}</span>
            </b>
            <progress
              max={a.quantity || 1}
              value={a.held}
              aria-label={tr('{name}备货进度', { name: item?.name.zh_hans ?? a.itemId })}
            />
          </div>
        );
      })}
      {shortage > 0 && (
        <button className="wf-primary" onClick={onPrepare}>
          <WorkflowIcon name="plus" />
          {tr('按缺口生成前置流程')}
        </button>
      )}
      {shortage > 0 && (
        <p className="wf-note">
          {tr('优先使用可用余料，再安排种植、加工或购买。采集等未知来源会标为待准备，确认取得后才计入可交付数量。')}
        </p>
      )}
    </section>
  );
}
