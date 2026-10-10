import type { Entity } from "../../data/types";
import type {
  SimulationResult,
  WorkflowPlan,
  PlanEvent,
  StockRow,
} from "../../domain/workflow/types";
import { formatDay } from "../../domain/workflow/date";
import { withBase } from "../../lib/sitePath";
import { tr } from '../../i18n/active';

const labels: Record<PlanEvent["kind"], string> = {
  inventory: tr('已有库存'),
  purchase: tr('买入'),
  plant: tr('播种'),
  harvest: tr('收获'),
  process: tr('投料'),
  complete: tr('加工完成'),
  reserve: tr('留货'),
  delivery: tr('交付'),
  consume: tr('消耗'),
  sale: tr('出货'),
  receipt: tr('到账'),
  warning: tr('需处理'),
};
const number = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const signed = (n: number) => `${n >= 0 ? "+" : ""}${number(n)}`;
export default function PlanResults({
  result,
  plan,
  entities,
  selectedDay,
  onDay,
  onNode,
}: {
  result: SimulationResult;
  plan: WorkflowPlan;
  entities: Entity[];
  selectedDay: number;
  onDay: (n: number) => void;
  onNode: (id: string) => void;
  compact?: boolean;
}) {
  const daily =
    result.days.find((d) => d.day === selectedDay) ?? result.days[0];
  const catalog = new Map(entities.map((e) => [e.id, e]));
  const name = (id: string) => catalog.get(id)?.name.zh_hans ?? id;
  const nodeName = (id: string) =>
    plan.nodes.find((n) => n.id === id)?.label ?? tr('计划');
  const next = result.days.find(
    (d) =>
      d.day > (daily?.day ?? selectedDay) &&
      d.events.some((e) => e.kind !== "warning"),
  );
  const shopping = new Map<
    string,
    { quantity: number; amount: number; replant: number }
  >();
  for (const e of daily?.events ?? [])
    if (e.kind === "purchase" && e.itemId) {
      const current = shopping.get(e.itemId) ?? {
        quantity: 0,
        amount: 0,
        replant: 0,
      };
      current.quantity += e.quantity ?? 0;
      current.amount += e.amount ?? 0;
      if (e.reason === "replant") current.replant += e.quantity ?? 0;
      shopping.set(e.itemId, current);
    }
  const groupStock = (rows: StockRow[]) => {
    const grouped = new Map<string, number>();
    for (const row of rows)
      grouped.set(row.itemId, (grouped.get(row.itemId) ?? 0) + row.quantity);
    return [...grouped];
  };
  const item = (id: string) => (
    <span className="wf-item-inline">
      {catalog.get(id)?.icon_path && (
        <img
          src={withBase(catalog.get(id)!.icon_path!)}
          width={24}
          height={24}
          alt=""
        />
      )}
      {name(id)}
    </span>
  );
  const tasks = plan.nodes.filter((n) =>
    ["reserve", "delivery"].includes(n.kind),
  );
  const machineNeeds = new Map<string, number>();
  for (const p of Object.values(result.intent?.nodes ?? {}))
    if (p.machines)
      machineNeeds.set(
        p.machineId ?? tr('配方所需机器'),
        (machineNeeds.get(p.machineId ?? tr('配方所需机器')) ?? 0) + p.machines,
      );
  const visibleEvents = (daily?.events ?? []).filter(
    (e) => e.kind !== "purchase",
  );
  return (
    <section className="wf-results wf-intent-results" aria-label={tr('每日推演结果')}>
      {daily && (
        <div className="wf-daily">
          <div className="wf-panel-title">
            <h3>
              {formatDay(daily.day)}
              {daily.day > (result.intent?.periodEnd ?? Infinity) && (
                <small> {tr('· 期末后续')}</small>
              )}
            </h3>
            {next && (
              <button onClick={() => onDay(next.day)}>
                {tr('下次操作 ·')} {formatDay(next.day)} →
              </button>
            )}
          </div>
          <div className="wf-daily-cash">
            <div>
              <small>{tr('今日支出')}</small>
              <b>{number(daily.spending)}</b>
            </div>
            <div>
              <small>{tr('今日到账')}</small>
              <b>{number(daily.income)}</b>
            </div>
            <div>
              <small>{tr('较期初累计增减')}</small>
              <b>{signed(daily.cash)}</b>
            </div>
            <div>
              <small>{tr('已出货待到账')}</small>
              <b>{number(daily.pendingRevenue)}</b>
            </div>
          </div>
          <section className="wf-shopping">
            <h4>
              {tr('今日要买')}{" "}
              <small>
                {shopping.size
                  ? tr('{count} 个 · {amount}', { count: [...shopping.values()].reduce((s, a) => s + a.quantity, 0), amount: number(daily.spending) })
                  : tr('无需购买')}
              </small>
            </h4>
            {[...shopping].map(([id, a]) => (
              <div key={id}>
                {item(id)}
                <b>×{a.quantity}</b>
                <span>{number(a.amount)}</span>
                {a.replant > 0 && <small>{tr('其中续种补买')} {a.replant} {tr('个')}</small>}
              </div>
            ))}
          </section>
          <ul className="wf-events">
            {visibleEvents.map((e, i) => (
              <li key={i} className={e.kind === "warning" ? "warning" : ""}>
                <span
                  className={`wf-tag ${e.kind === "plant" ? "plant" : e.kind === "harvest" ? "harvest" : ""}`}
                >
                  {labels[e.kind]}
                </span>
                <button onClick={() => onNode(e.nodeId)}>
                  {nodeName(e.nodeId)}
                </button>
                <span>{e.message}</span>
              </li>
            ))}
          </ul>
          {!visibleEvents.length && (
            <p className="wf-note">
              {shopping.size
                ? tr('按采购清单买入后，后续安排会在对应日期列出。')
                : tr('这一天无需操作。可以直接跳到下一次操作。')}
            </p>
          )}
          <div className="wf-operation-totals">
            {(["plant", "harvest", "complete", "sale", "reserve"] as const).map(
              (kind) => {
                const count = daily.events
                  .filter((e) => e.kind === kind)
                  .reduce((s, e) => s + (e.quantity ?? 0), 0);
                return count > 0 ? (
                  <span key={kind}>
                    {labels[kind]}{" "}
                    <b>
                      {number(count)}
                      {kind === "plant" ? tr(' 格') : tr(' 个')}
                    </b>
                  </span>
                ) : null;
              },
            )}
          </div>
          <section className="wf-stock-overview">
            <h4>{tr('当日结束时的物品')}</h4>
            <div className="wf-stock-columns">
              {(["usable", "reserved", "waiting"] as const).map((state) => {
                const rows = groupStock(
                  daily.stock.filter(
                    (s) =>
                      (s.state ?? (s.reserved ? "reserved" : "usable")) ===
                      state,
                  ),
                );
                return (
                  <div key={state}>
                    <h5>
                      {
                        {
                          usable: tr('可用库存'),
                          reserved: tr('已留货'),
                          waiting: tr('等待投料 / 使用'),
                        }[state]
                      }
                    </h5>
                    {rows.length ? (
                      rows.map(([id, q]) => (
                        <p key={id}>
                          {item(id)}
                          <b>×{q}</b>
                        </p>
                      ))
                    ) : (
                      <small>{tr('暂无')}</small>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
          {!!tasks.length && (
            <details className="wf-daily-tasks">
              <summary>{tr('留货与交付目标 ·')} {tasks.length} {tr('项')}</summary>
              {tasks.map((n) => {
                const history = result.events.filter(
                  (e) => e.nodeId === n.id && e.day <= daily.day,
                );
                const delivered = history.some((e) => e.kind === "delivery");
                const amounts = (n.requirements ?? []).map((a) => ({
                  ...a,
                  held: history
                    .filter(
                      (e) => e.kind === "reserve" && e.itemId === a.itemId,
                    )
                    .reduce((s, e) => s + (e.quantity ?? 0), 0),
                }));
                const ready =
                  amounts.length > 0 &&
                  amounts.every((a) => a.held >= a.quantity);
                const projection = result.intent?.nodes[n.id];
                return (
                  <div className="wf-status-row" key={n.id}>
                    <button onClick={() => onNode(n.id)}>{n.label}</button>
                    <strong>
                      {delivered ? tr(' 已交付') : ready ? tr(' 已备齐') : tr(' 待备货')}
                    </strong>
                    <p>
                      {amounts
                        .map((a) => `${name(a.itemId)} ${a.held}/${a.quantity}`)
                        .join(" · ")}
                    </p>
                    <small>
                      {!plan.edges.some((e) => e.target === n.id)
                        ? tr('尚未安排来源')
                        : projection?.readyDay !== undefined
                          ? tr('{date} 可备齐', { date: formatDay(projection.readyDay) })
                          : tr('仍有缺口，查看来源或增加安排')}
                    </small>
                  </div>
                );
              })}
            </details>
          )}
          {!!daily.inProgress?.length && (
            <details open>
              <summary>{tr('生长 / 加工中 ·')} {daily.inProgress.length} {tr('批')}</summary>
              <ul className="wf-progress-list">
                {daily.inProgress.map((job, i) => (
                  <li key={i}>
                    <button onClick={() => onNode(job.nodeId)}>
                      {nodeName(job.nodeId)}
                    </button>
                    <span>
                      {name(job.itemId)} ×{job.quantity}
                    </span>
                    <small>{formatDay(job.finishDay)} {tr('完成')}</small>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      <aside className="wf-plan-outcome">
        <h3>{tr('这份计划能带来什么')}</h3>
        <div className="wf-metrics">
          {[
            [tr('本期收支增减'), signed(result.cash)],
            [
              tr('后续全部到账后'),
              signed(result.intent?.finalDelta ?? result.cash),
            ],
            [tr('至少准备资金'), number(result.intent?.startupFunds ?? 0)],
            [tr('同时需要土地'), tr('{count} 格', { count: result.intent?.land ?? 0 })],
            [
              tr('本期留存数量'),
              tr('{count} 个', { count: result.stock.filter((s) => s.reserved).reduce((s, a) => s + a.quantity, 0) }),
            ],
            [tr('期末已出货待到账'), number(result.pendingRevenue)],
          ].map(([label, value]) => (
            <div key={label}>
              <small>{label}</small>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        {!!machineNeeds.size && (
          <details>
            <summary>{tr('机器需求 · 按型号查看')}</summary>
            {[...machineNeeds].map(([id, count]) => (
              <p className="wf-machine-need" key={id}>
                {catalog.get(id)?.name.zh_hans ?? id}
                <b>{count} {tr('台')}</b>
              </p>
            ))}
          </details>
        )}
        <p className="wf-note">
          {tr('资金需求按先投入、后回款推算。收支不含库存估值和机器购置费用。')}
        </p>
        {(result.intent?.finishDay ?? 0) >
          (result.intent?.periodEnd ?? Infinity) && (
          <button
            className="wf-future-link"
            onClick={() => onDay(result.intent!.finishDay)}
          >
            {tr('查看最后到账 / 完成日 ·')} {formatDay(result.intent!.finishDay)} →
          </button>
        )}
        {!!result.issues.length && (
          <details className="wf-error" open>
            <summary>{result.issues.length} {tr('项需处理')}</summary>
            {result.issues.map((issue, i) => (
              <p key={i}>{issue}</p>
            ))}
          </details>
        )}
      </aside>
    </section>
  );
}
