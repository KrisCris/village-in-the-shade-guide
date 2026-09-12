import type { Entity } from "../../data/types";
import type {
  WorkflowNode,
  WorkflowPlan,
  NodeProjection,
} from "../../domain/workflow/types";
import { nodeLabels } from "../../domain/workflowEditor";
import { autoAmount, autoDate } from "../../domain/workflow/intent";
import { formatDay } from "../../domain/workflow/date";
import { DateField, EntityPicker, NumberField } from "./fields";

export default function NodeInspector({
  node,
  resolved = node,
  projection,
  choices = [],
  comparison,
  plan,
  entities,
  onChange,
  onDelete,
}: {
  node: WorkflowNode;
  resolved?: WorkflowNode;
  projection?: NodeProjection;
  choices?: Entity[];
  comparison?: { delay: number; incomeDifference: number; machines: number };
  plan: WorkflowPlan;
  entities: Entity[];
  onChange: (n: WorkflowNode) => void;
  onDelete: () => void;
}) {
  const patch = (p: Partial<WorkflowNode>) => onChange({ ...node, ...p });
  const demand = ["reserve", "delivery"].includes(node.kind),
    root = ["purchase", "inventory"].includes(node.kind);
  const field =
    node.kind === "plant"
      ? "cropId"
      : node.kind === "process"
        ? "recipeId"
        : "itemId";
  const kind =
    node.kind === "plant"
      ? "crops"
      : node.kind === "process"
        ? "processes"
        : "items";
  const label =
    node.kind === "plant"
      ? "作物"
      : node.kind === "process"
        ? "加工配方"
        : "物品";
  const all = entities.filter((e) => e.kind === kind),
    items = entities.filter((e) => e.kind === "items");
  const name = (id: string) =>
    items.find((e) => e.id === id)?.name.zh_hans ?? id;
  const crop = entities.find((e) => e.id === resolved.cropId),
    recipe = entities.find((e) => e.id === resolved.recipeId);
  const inferred = !node[field] && !!resolved[field];
  const candidates =
    !root && choices.length
      ? all.filter(
          (e) =>
            choices.some((c) => c.id === e.id) ||
            e.id === node[field] ||
            e.id === resolved[field],
        )
      : all;
  return (
    <aside className="wf-inspector" aria-label="节点设置">
      <div className="wf-panel-title">
        <span>{nodeLabels[node.kind]}</span>
        <button className="wf-danger" onClick={onDelete}>
          删除节点
        </button>
      </div>
      {projection && (
        <div className={`wf-projection ${projection.status}`}>
          <strong>
            {projection.firstDay !== undefined
              ? `${formatDay(projection.firstDay)}${projection.finishDay !== projection.firstDay ? ` → ${formatDay(projection.finishDay!)}` : ""}`
              : "连接来源，自动安排"}{" "}
          </strong>
          {projection.readyDay !== undefined && (
            <span>已备齐，最早可在 {formatDay(projection.readyDay)} 交付</span>
          )}
          {projection.quantity > 0 && (
            <span>
              {node.kind === "plant"
                ? `播种共 ${projection.quantity} 格 · 收获 ${projection.outputQuantity} 个`
                : node.kind === "process"
                  ? `加工 ${projection.quantity} 批 · 产出 ${projection.outputQuantity} 个`
                  : `已安排 ${projection.quantity} 个`}
            </span>
          )}
          {projection.notices.map((message, i) => (
            <p key={i}>{message}</p>
          ))}
        </div>
      )}
      <label className="wf-field">
        节点名称
        <input
          value={node.label}
          maxLength={200}
          onChange={(e) => patch({ label: e.target.value })}
        />
      </label>
      {!demand && (
        <>
          <EntityPicker
            label={label}
            entities={candidates}
            value={resolved[field]}
            onChange={(id) => patch({ [field]: id })}
          />
          <div className="wf-auto-hint">
            <span>
              {inferred
                ? "已根据连线推算"
                : choices.length > 1
                  ? `${choices.length} 种兼容选择`
                  : node[field]
                    ? "手动选择"
                    : "连接后自动推算"}
            </span>
            {node[field] && (
              <button onClick={() => patch({ [field]: undefined })}>
                恢复自动
              </button>
            )}
          </div>
        </>
      )}
      {node.kind === "plant" && crop && (
        <p className="wf-note">
          生长 {String(crop.growth_days ?? "?")} 天，每格收获{" "}
          {String(crop.harvest_quantity ?? "?")} 个。
          {crop.regrow_days
            ? `天然再生：每 ${crop.regrow_days} 天再收获，不消耗种子。`
            : ""}
        </p>
      )}
      {node.kind === "process" && recipe && (
        <p className="wf-note">
          {((recipe.inputs ?? []) as { item_id: string; quantity: number }[])
            .map((a) => `${name(a.item_id)} ×${a.quantity}`)
            .join(" + ")}{" "}
          →{" "}
          {name(String((recipe.output as { item_id: string })?.item_id ?? ""))}{" "}
          ×{String((recipe.output as { quantity: number })?.quantity ?? "?")}
          <br />
          每批 {projection?.duration ?? "?"} 天，完工当天可继续加工或出货。
        </p>
      )}
      {!demand && (
        <>
          {!root && (
            <label className="wf-check">
              <input
                type="checkbox"
                checked={autoAmount(node)}
                onChange={(e) =>
                  patch({
                    amountMode: e.target.checked ? "auto" : "manual",
                    quantity: Math.max(
                      1,
                      projection?.quantity ?? node.quantity,
                    ),
                  })
                }
              />
              {node.kind === "plant"
                ? "种下上游全部种子"
                : node.kind === "process"
                  ? "加工分配到的全部原料"
                  : "使用分配到的全部物品"}
            </label>
          )}
          {(root || !autoAmount(node) || node.remainingDays !== undefined) && (
            <NumberField
              label={
                node.kind === "plant"
                  ? "种植格数"
                  : node.kind === "process"
                    ? "本节点安排的总批数"
                    : node.kind === "purchase"
                      ? "每次买入数量"
                      : "数量"
              }
              value={node.quantity}
              min={1}
              onChange={(quantity) => patch({ quantity, amountMode: "manual" })}
            />
          )}
          {!root && autoAmount(node) && (
            <p className="wf-note">
              留货先分配，固定数量其次，剩余原料再分给本节点。数量随上游变化。
            </p>
          )}
        </>
      )}
      {!root && (
        <label className="wf-check">
          <input
            type="checkbox"
            checked={autoDate(node)}
            onChange={(e) =>
              patch({
                dateMode: e.target.checked ? "auto" : "manual",
                startDay: projection?.firstDay ?? node.startDay,
              })
            }
          />
          原料齐备后尽早执行
        </label>
      )}
      {(root || !autoDate(node)) && (
        <DateField
          label={
            root
              ? node.kind === "purchase"
                ? "买入日期"
                : "库存可用日期"
              : "不早于此日"
          }
          value={node.startDay}
          onChange={(startDay) => patch({ startDay, dateMode: "manual" })}
        />
      )}
      {node.kind === "process" && (
        <section className="wf-inspector-section">
          <h3>这个节点使用的机器</h3>
          {recipe &&
            Array.isArray(recipe.machine_ids) &&
            recipe.machine_ids.length > 0 && (
              <EntityPicker
                label="机器型号"
                entities={entities.filter(
                  (e) =>
                    e.kind === "machines" &&
                    (recipe.machine_ids as string[]).includes(e.id),
                )}
                value={node.machineId ?? projection?.machineId}
                onChange={(machineId) => patch({ machineId })}
              />
            )}

          <p className="wf-note">
            {projection?.machineCapacity
              ? `每台可同时加工 ${projection.machineCapacity} 批，容量由游戏设备数据确定。`
              : "选择设备后自动读取游戏中的加工容量。"}
          </p>

          <label className="wf-check">
            <input
              type="checkbox"
              checked={node.machineCount === undefined}
              onChange={(e) =>
                patch({
                  machineCount: e.target.checked
                    ? undefined
                    : Math.max(1, projection?.machines ?? 1),
                })
              }
            />
            自动配足，当批原料尽快加工
          </label>
          {node.machineCount === undefined ? (
            <p className="wf-note">
              当前流程需要最多 <b>{projection?.machines ?? 0}</b>{" "}
              台。按完整配方批数与每台并行容量推算。
            </p>
          ) : (
            <NumberField
              label="可用机器台数"
              value={node.machineCount}
              min={1}
              max={10000}
              onChange={(machineCount) => patch({ machineCount })}
            />
          )}
          {comparison && (
            <div className="wf-comparison">
              <strong>与配足 {comparison.machines} 台相比</strong>
              <span>末批完工晚 {comparison.delay} 天</span>
              <span>
                本期到账 {comparison.incomeDifference >= 0 ? "+" : ""}
                {comparison.incomeDifference.toLocaleString()}
              </span>
              <small>延后到账会继续列在后续日程中。</small>
            </div>
          )}
          {projection?.processedValue !== undefined && (
            <div className="wf-comparison">
              <strong>加工价值对比</strong>
              <span>
                产物卖价合计 {projection.processedValue.toLocaleString()}
              </span>
              {projection.rawValue !== undefined ? (
                <span>
                  较原料直接出售
                  {(
                    projection.processedValue - projection.rawValue
                  ).toLocaleString()}{" "}
                  · 每批多用 {projection.duration} 天
                </span>
              ) : (
                <span>原料卖价有缺失，暂不能比较增值。</span>
              )}
              <small>比较已投料批次的物品价值，不含购置机器的成本。</small>
            </div>
          )}
          <p className="wf-note">
            各加工节点独立占用机器；这里显示需求，购置成本需另计。
          </p>
        </section>
      )}
      {node.kind === "plant" && (
        <section className="wf-inspector-section">
          <label className="wf-check">
            <input
              type="checkbox"
              checked={node.repeat}
              onChange={(e) => patch({ repeat: e.target.checked })}
            />
            收获清田后自动续种
          </label>
          <p className="wf-note">
            {node.repeat
              ? "保持首轮规模，优先使用已有种子；每次补买和播种都会列入日程。本季来不及收获时停止续种。"
              : "只播种一次。框选并复制整条流程，可以单独安排下一轮日期和去向。"}
          </p>
          <label className="wf-check">
            <input
              type="checkbox"
              checked={node.autoBuy}
              onChange={(e) => patch({ autoBuy: e.target.checked })}
            />
            种子不足时自动补买
          </label>
          <p className="wf-note">
            需要土地 {projection?.land ?? 0} 格；整份计划按同时占地推算需求。
          </p>
        </section>
      )}
      {node.kind === "purchase" && (
        <label className="wf-check">
          <input
            type="checkbox"
            checked={node.repeat}
            onChange={(e) => patch({ repeat: e.target.checked })}
          />
          每天重复购买
        </label>
      )}
      {["plant", "process"].includes(node.kind) && (
        <details>
          <summary>已有作物 / 在制品</summary>
          <label className="wf-check">
            <input
              type="checkbox"
              checked={node.remainingDays !== undefined}
              onChange={(e) =>
                patch({
                  remainingDays: e.target.checked ? 1 : undefined,
                  amountMode: e.target.checked ? "manual" : node.amountMode,
                })
              }
            />
            计划开始时已在进行
          </label>
          {node.remainingDays !== undefined && (
            <NumberField
              label="距完成还需天数（已有投入不扣费）"
              value={node.remainingDays}
              max={112}
              onChange={(remainingDays) => patch({ remainingDays })}
            />
          )}
        </details>
      )}
      {node.repeat && ["plant", "purchase"].includes(node.kind) && (
        <details>
          <summary>停止新增安排</summary>
          <label className="wf-check">
            <input
              type="checkbox"
              checked={node.endDay !== undefined}
              onChange={(e) =>
                patch({
                  endDay: e.target.checked
                    ? plan.startDay + plan.days - 1
                    : undefined,
                })
              }
            />
            提前停止
          </label>
          {node.endDay !== undefined && (
            <DateField
              label="最后安排日期"
              value={node.endDay}
              onChange={(endDay) => patch({ endDay })}
            />
          )}
          <p className="wf-note">
            默认到计划期末；已开始的加工和到账会继续推算。
          </p>
        </details>
      )}
      {demand && (
        <>
          <p className="wf-note">
            {node.sourceId
              ? "来自四季留货目录，可按需要删除。"
              : "连接产物来源，自动优先留存。"}
            未指定交付日期时只备货，不消耗。
          </p>
          {(node.requirements ?? []).map((a, i) => (
            <div className="wf-requirement" key={`${a.itemId}-${i}`}>
              <span>{name(a.itemId)}</span>
              <NumberField
                label="需求数量"
                min={1}
                value={a.quantity}
                onChange={(quantity) =>
                  patch({
                    requirements: node.requirements!.map((v, j) =>
                      i === j ? { ...v, quantity } : v,
                    ),
                  })
                }
              />
              <button
                aria-label={`移除${name(a.itemId)}`}
                onClick={() =>
                  patch({
                    requirements: node.requirements!.filter((_, j) => i !== j),
                  })
                }
              >
                ×
              </button>
            </div>
          ))}
          <EntityPicker
            label="添加需求物品"
            entities={items.filter(
              (e) => !node.requirements?.some((a) => a.itemId === e.id),
            )}
            onChange={(itemId) =>
              patch({
                requirements: [
                  ...(node.requirements ?? []),
                  { itemId, quantity: 1 },
                ],
              })
            }
          />
          {node.kind === "delivery" && (
            <>
              <label className="wf-check">
                <input
                  type="checkbox"
                  checked={node.dueDay !== undefined}
                  onChange={(e) =>
                    patch({
                      dueDay: e.target.checked
                        ? (projection?.finishDay ??
                          plan.startDay + plan.days - 1)
                        : undefined,
                    })
                  }
                />
                指定交付日期，备齐后一次扣除
              </label>
              {node.dueDay !== undefined && (
                <DateField
                  label="交付日期"
                  value={node.dueDay}
                  onChange={(dueDay) => patch({ dueDay })}
                />
              )}
            </>
          )}
        </>
      )}
      {!root && (
        <details>
          <summary>分流顺序</summary>
          <NumberField
            label="同类分配顺序（较小优先）"
            value={node.priority}
            max={100}
            onChange={(priority) => patch({ priority })}
          />
          <p className="wf-note">
            多个“剩余全部”去向需要不同顺序，或改为固定数量。优先级相同的剩余去向会等待你选择。
          </p>
        </details>
      )}
    </aside>
  );
}
