import type { Entity } from "../../data/types";
import { useMemo } from "react";
import type {
  WorkflowNode,
  WorkflowPlan,
  NodeProjection,
  SimulationResult,
} from "../../domain/workflow/types";
import { nodeLabels } from "../../domain/workflowEditor";
import {
  autoAmount,
  autoDate,
  autoLabel,
  resolveIntent,
} from "../../domain/workflow/intent";
import type { WorkflowAssistance as Advice } from "../../domain/workflow/assistance";
import WorkflowAssistance from "./WorkflowAssistance";
import { formatDay } from "../../domain/workflow/date";
import { DateField, EntityPicker, NumberField } from "./fields";
import DemandDetails from "./DemandDetails";
import FarmlandPicker from "./FarmlandPicker";
import { farmlandUsage } from "../../domain/workflow/farmland";
import { bearingLabel } from "../../domain/workflow/catalog";
import { shrubCoProducts } from "../../domain/perennial";
import { withBase } from "../../lib/sitePath";
import { tr } from '../../i18n/active';

export default function NodeInspector({
  node,
  resolved = node,
  projection,
  choices = [],
  comparison,
  plan,
  entities,
  advice,
  onAction,
  onChange,
  onDelete,
  result,
  selectedDay,
  onPrepare,
}: {
  node: WorkflowNode;
  resolved?: WorkflowNode;
  projection?: NodeProjection;
  choices?: Entity[];
  comparison?: { delay: number; incomeDifference: number; machines: number };
  plan: WorkflowPlan;
  entities: Entity[];
  advice?: Advice;
  onAction?: (key: string) => void;
  onChange: (n: WorkflowNode) => void;
  onDelete: () => void;
  result?: SimulationResult;
  selectedDay?: number;
  onPrepare?: () => void;
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
      ? tr('作物')
      : node.kind === "process"
        ? tr('加工配方')
        : tr('物品');
  const all = entities.filter((e) => e.kind === kind),
    items = entities.filter((e) => e.kind === "items");
  const name = (id: string) =>
    items.find((e) => e.id === id)?.name.zh_hans ?? id;
  const seasonsByItem = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const crop of entities.filter((e) => e.kind === "crops"))
      for (const id of (crop.harvest_item_ids ?? []) as string[])
        map.set(id, [
          ...new Set([
            ...(map.get(id) ?? []),
            ...((crop.seasons ?? []) as string[]),
          ]),
        ]);
    return map;
  }, [entities]);
  const crop = entities.find((e) => e.id === resolved.cropId),
    recipe = entities.find((e) => e.id === resolved.recipeId);
  // Shrubs and fruit trees are planted once and never replanted.
  const perennial = node.kind === "plant" ? crop?.perennial ?? undefined : undefined;
  const perennialNote = (() => {
    if (!crop || !perennial) return "";
    const days = String(crop.growth_days ?? "?"),
      bearing = bearingLabel(perennial),
      harvestId = String((crop.harvest_item_ids as string[] | undefined)?.[0] ?? "");
    const habit =
      perennial.kind === "shrub"
        ? tr('生长 {days} 天，{bearing}。每 {rebear} 天收一次，每格收 {items}。', {
            days,
            bearing,
            rebear: perennial.rebear_days,
            items: [
              { itemId: harvestId, quantity: Number(crop.harvest_quantity) },
              ...shrubCoProducts(crop, harvestId),
            ]
              .map((a) => tr('{quantity} 个{name}', { quantity: a.quantity, name: name(a.itemId) }))
              .join(tr('、')),
          })
        : tr('生长 {days} 天，{bearing}。每天结 {count} 个，最多挂 {capacity} 个，挂满就摇。', {
            days,
            bearing,
            count: perennial.fruit_per_day,
            capacity: perennial.fruit_capacity ?? "?",
          });
    return `${habit}${perennial.kind === "fruit_tree" && perennial.greenhouse_only ? tr('只能种在温室里。') : ""}${tr('树苗只买一次，种下后一直留在地里。')}`;
  })();
  const inferred = !node[field] && !!resolved[field];
  const resetProjection = node[field]
    ? resolveIntent(
        {
          ...plan,
          nodes: plan.nodes.map((n) =>
            n.id === node.id ? { ...n, [field]: undefined } : n,
          ),
        },
        entities,
      ).nodes.find((n) => n.id === node.id)
    : undefined;
  const canReset =
    !!resetProjection?.[field] && resetProjection[field] === resolved[field];
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
    <aside className="wf-inspector" aria-label={tr('节点设置')}>
      <div className="wf-panel-title">
        <span>{nodeLabels[node.kind]}</span>
        <button className="wf-danger" onClick={onDelete}>
          {tr('删除节点')}
        </button>
      </div>
      {demand && result && onPrepare && (
        <DemandDetails
          node={node}
          result={result}
          day={selectedDay ?? plan.startDay}
          entities={entities}
          onPrepare={onPrepare}
        />
      )}
      {node.needsConfirmation && (
        <section className="wf-projection draft">
          <strong>{tr('这些物品还未确认取得')}</strong>
          <p>{tr('准备好后填写实际数量与可用日期，再计入流程。')}</p>
          <button onClick={() => patch({ needsConfirmation: false })}>
            {tr('已准备好，计入库存')}
          </button>
        </section>
      )}
      {projection && !demand && (
        <div className={`wf-projection ${projection.status}`}>
          <strong>
            {projection.firstDay !== undefined
              ? `${formatDay(projection.firstDay)}${projection.finishDay !== projection.firstDay ? ` → ${formatDay(projection.finishDay!)}` : ""}`
              : tr('连接来源，自动安排')}{" "}
          </strong>
          {projection.readyDay !== undefined && (
            <span>{tr('已备齐，最早可在 {date} 交付', { date: formatDay(projection.readyDay) })}</span>
          )}
          {projection.quantity > 0 && (
            <span>
              {node.kind === "plant"
                ? perennial
                  ? tr('占地 {land} 格 · 收获 {outputQuantity} 个', { land: projection.land, outputQuantity: projection.outputQuantity })
                  : tr('占地 {land} 格 · 累计播种 {ceil} 轮 · 收获 {outputQuantity} 个', { land: projection.land, ceil: Math.ceil(projection.quantity / Math.max(1, projection.land)), outputQuantity: projection.outputQuantity })
                : node.kind === "process"
                  ? tr('加工 {quantity} 批 · 产出 {outputQuantity} 个', { quantity: projection.quantity, outputQuantity: projection.outputQuantity })
                  : tr('已安排 {quantity} 个', { quantity: projection.quantity })}
            </span>
          )}
          {projection.notices.map((message, i) => (
            <p key={i}>{message}</p>
          ))}
        </div>
      )}
      {advice && onAction && (
        <WorkflowAssistance key={node.id} advice={advice} onAction={onAction} />
      )}
      <label className="wf-field">
        {tr('节点名称')}
        <input
          value={autoLabel(node) ? resolved.label : node.label}
          maxLength={200}
          onChange={(e) =>
            patch({ label: e.target.value, labelMode: "manual" })
          }
        />
      </label>
      <div className="wf-auto-hint">
        <span>{autoLabel(node) ? tr('名称跟随所选物品') : tr('自定义名称')}</span>
        {!autoLabel(node) && !demand && (
          <button
            onClick={() =>
              patch({ label: nodeLabels[node.kind], labelMode: "auto" })
            }
          >
            {tr('恢复自动命名')}
          </button>
        )}
      </div>
      {!root &&
        !demand &&
        node.remainingDays === undefined &&
        (!autoAmount(node) || !autoDate(node)) && (
          <button
            className="wf-restore-auto"
            onClick={() => patch({ amountMode: "auto", dateMode: "auto" })}
          >
            {tr('恢复自动数量与日期')}
          </button>
        )}
      {!demand && (
        <>
          <EntityPicker
            label={label}
            entities={candidates.map((e) =>
              e.kind === "items"
                ? { ...e, seasons: seasonsByItem.get(e.id) ?? [] }
                : e,
            )}
            value={resolved[field]}
            onChange={(id) => patch({ [field]: id })}
          />
          <div className="wf-auto-hint">
            <span>
              {inferred
                ? tr('已根据连线推算')
                : choices.length > 1
                  ? tr('{count} 种兼容选择', { count: choices.length })
                  : node[field]
                    ? tr('手动选择')
                    : tr('连接后自动推算')}
            </span>
            {node[field] && (
              <button
                disabled={!canReset}
                title={
                  canReset
                    ? tr('根据现有连线自动识别，保留当前物品')
                    : tr('现有连线无法唯一识别此项，保留你的选择')
                }
                onClick={() => {
                  if (canReset) patch({ [field]: undefined });
                }}
              >
                {canReset ? tr('恢复自动识别') : tr('需指定物品')}
              </button>
            )}
          </div>
        </>
      )}
      {node.kind === "plant" && crop && (
        <p className="wf-note">
          {perennial ? perennialNote : (
            <>
              {tr('生长 {days} 天，每格收获 {count} 个。', { days: String(crop.growth_days ?? "?"), count: String(crop.harvest_quantity ?? "?") })}
              {crop.regrow_days
                ? tr('天然再生：每 {regrow_days} 天再收获，不消耗种子。', { regrow_days: crop.regrow_days })
                : ""}
            </>
          )}
        </p>
      )}
      {node.kind === "plant" && !perennial && (
        <label className="wf-check">
          <input
            type="checkbox"
            checked={!!node.seasonProtection}
            onChange={(e) => patch({ seasonProtection: e.target.checked })}
          />
          {tr('使用季节稻草人 / 温室保护（允许跨季生长）')}
        </label>
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
          {tr('每批 {days} 天，完工当天可继续加工或出货。', { days: projection?.duration ?? "?" })}
        </p>
      )}
      {!demand && (
        <div
          className={
            node.kind === "plant"
              ? "wf-inspector-section wf-plant-scale"
              : undefined
          }
        >
          {node.kind === "plant" && <h3>{tr('种植规模')}</h3>}
          {!root && (
            <label className="wf-check">
              <input
                type="checkbox"
                checked={autoAmount(node)}
                onChange={(e) =>
                  patch({
                    amountMode: e.target.checked ? "auto" : "manual",
                    ...(node.kind === "plant" && e.target.checked
                      ? { farmlandSelection: undefined }
                      : {}),
                    quantity: Math.max(
                      1,
                      (node.kind === "plant"
                        ? projection?.land
                        : projection?.quantity) ?? node.quantity,
                    ),
                  })
                }
              />
              {node.kind === "plant"
                ? tr('种下上游全部种子')
                : node.kind === "process"
                  ? tr('加工分配到的全部原料')
                  : tr('使用分配到的全部物品')}
            </label>
          )}
          {(node.kind === "plant" ||
            root ||
            !autoAmount(node) ||
            node.remainingDays !== undefined) && (
            <NumberField
              label={
                node.kind === "plant"
                  ? tr('种植格数')
                  : node.kind === "process"
                    ? tr('本节点安排的总批数')
                    : node.kind === "purchase"
                      ? tr('每次买入数量')
                      : tr('数量')
              }
              value={
                node.kind === "plant" && autoAmount(node)
                  ? projection?.land || node.quantity
                  : node.quantity
              }
              min={1}
              onChange={(quantity) =>
                patch({
                  quantity,
                  amountMode: "manual",
                  ...(node.kind === "plant"
                    ? { farmlandSelection: undefined }
                    : {}),
                })
              }
            />
          )}
          {node.kind === "plant" && (
            <FarmlandPicker
              value={node.farmlandSelection}
              usage={farmlandUsage(plan, node, result, entities)}
              onApply={(quantity, farmlandSelection) =>
                patch({ quantity, farmlandSelection, amountMode: "manual" })
              }
            />
          )}
          {node.kind === "plant" && node.farmlandSelection && (
            <p className="wf-note">
              {tr('格数来自地图选区；手动改数量或跟随全部种子会解除地图分配。')}
            </p>
          )}
          {!root && autoAmount(node) && (
            <p className="wf-note">
              {tr('留货先分配，固定数量其次，剩余原料再分给本节点。数量随上游变化。')}
            </p>
          )}
        </div>
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
          {tr('原料齐备后尽早执行')}
        </label>
      )}
      {(root || !autoDate(node)) && (
        <DateField
          label={
            root
              ? node.kind === "purchase"
                ? tr('买入日期')
                : tr('库存可用日期')
              : tr('不早于此日')
          }
          value={node.startDay}
          onChange={(startDay) => patch({ startDay, dateMode: "manual" })}
        />
      )}
      {node.kind === "process" && (
        <section className="wf-inspector-section">
          <h3>{tr('这个节点使用的机器')}</h3>
          {recipe &&
            Array.isArray(recipe.machine_ids) &&
            recipe.machine_ids.length > 0 && (
              <EntityPicker
                label={tr('机器型号')}
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
              ? tr('每台可同时加工 {machineCapacity} 批，容量由游戏设备数据确定。', { machineCapacity: projection.machineCapacity })
              : tr('选择设备后自动读取游戏中的加工容量。')}
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
            {tr('自动配足，当批原料尽快加工')}
          </label>
          {node.machineCount === undefined ? (
            <p className="wf-note">
              {tr('当前流程需要最多')} <b>{projection?.machines ?? 0}</b>{" "}
              {tr('台。按完整配方批数与每台并行容量推算。')}
            </p>
          ) : (
            <NumberField
              label={tr('可用机器台数')}
              value={node.machineCount}
              min={1}
              max={10000}
              onChange={(machineCount) => patch({ machineCount })}
            />
          )}
          {comparison && (
            <div className="wf-comparison">
              <strong>{tr('与配足 {machines} 台相比', { machines: comparison.machines })}</strong>
              <span>{tr('末批完工晚 {days} 天', { days: comparison.delay })}</span>
              <span>
                {tr('本期到账')} {comparison.incomeDifference >= 0 ? "+" : ""}
                {comparison.incomeDifference.toLocaleString()}
              </span>
              <small>{tr('延后到账会继续列在后续日程中。')}</small>
            </div>
          )}
          {projection?.processedValue !== undefined && (
            <div className="wf-comparison">
              <strong>{tr('加工价值对比')}</strong>
              <span>
                {tr('产物卖价合计')} {projection.processedValue.toLocaleString()}
              </span>
              {projection.rawValue !== undefined ? (
                <span>
                  {tr('较原料直接出售')}
                  {(
                    projection.processedValue - projection.rawValue
                  ).toLocaleString()}{" "}
                  {tr('· 每批多用 {days} 天', { days: projection.duration })}
                </span>
              ) : (
                <span>{tr('原料卖价有缺失，暂不能比较增值。')}</span>
              )}
              <small>{tr('比较已投料批次的物品价值，不含购置机器的成本。')}</small>
            </div>
          )}
          <p className="wf-note">
            {tr('各加工节点独立占用机器；这里显示需求，购置成本需另计。')}
          </p>
        </section>
      )}
      {node.kind === "plant" && (
        <section className="wf-inspector-section">
          {!perennial && (
            <>
              <label className="wf-check">
                <input
                  type="checkbox"
                  checked={node.repeat}
                  onChange={(e) => patch({ repeat: e.target.checked })}
                />
                {tr('收获清田后自动续种')}
              </label>
              <p className="wf-note">
                {node.repeat
                  ? tr('保持首轮规模，优先使用已有种子；每次补买和播种都会列入日程。本季来不及收获时停止续种。')
                  : tr('只播种一次。框选并复制整条流程，可以单独安排下一轮日期和去向。')}
              </p>
            </>
          )}
          <label className="wf-check">
            <input
              type="checkbox"
              checked={node.autoBuy}
              onChange={(e) => patch({ autoBuy: e.target.checked })}
            />
            {perennial ? tr('树苗不足时自动买入') : tr('种子不足时自动补买')}
          </label>
          <p className="wf-note">
            {tr('需要土地 {count} 格；整份计划按同时占地推算需求。', { count: projection?.land ?? 0 })}
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
          {tr('每天重复购买')}
        </label>
      )}
      {["plant", "process"].includes(node.kind) && (
        <details>
          <summary>{tr('已有作物 / 在制品')}</summary>
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
            {tr('计划开始时已在进行')}
          </label>
          {node.remainingDays !== undefined && (
            <NumberField
              label={
                perennial
                  ? tr('距长成还需天数（0 表示已长成，不计树苗钱）')
                  : tr('距完成还需天数（已有投入不扣费）')
              }
              value={node.remainingDays}
              max={112}
              onChange={(remainingDays) => patch({ remainingDays })}
            />
          )}
        </details>
      )}
      {node.repeat && ["plant", "purchase"].includes(node.kind) && !perennial && (
        <details>
          <summary>{tr('停止新增安排')}</summary>
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
            {tr('提前停止')}
          </label>
          {node.endDay !== undefined && (
            <DateField
              label={tr('最后安排日期')}
              value={node.endDay}
              onChange={(endDay) => patch({ endDay })}
            />
          )}
          <p className="wf-note">
            {tr('默认到计划期末；已开始的加工和到账会继续推算。')}
          </p>
        </details>
      )}
      {demand && (
        <>
          <p className="wf-note">
            {node.sourceId
              ? tr('来自四季留货目录，可按需要删除。')
              : tr('连接产物来源，自动优先留存。')}
            {tr('未指定交付日期时只备货，不消耗。')}
          </p>
          {(node.requirements ?? []).map((a, i) => (
            <div className="wf-requirement" key={`${a.itemId}-${i}`}>
              <span className="wf-item-inline">
                {items.find((e) => e.id === a.itemId)?.icon_path && (
                  <img
                    src={withBase(
                      items.find((e) => e.id === a.itemId)!.icon_path!,
                    )}
                    width={28}
                    height={28}
                    alt=""
                  />
                )}
                {name(a.itemId)}
              </span>
              <NumberField
                label={tr('需求数量')}
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
                aria-label={tr('移除{name}', { name: name(a.itemId) })}
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
            label={tr('添加需求物品')}
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
                {tr('指定交付日期，备齐后一次扣除')}
              </label>
              {node.dueDay !== undefined && (
                <DateField
                  label={tr('交付日期')}
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
          <summary>{tr('分流顺序')}</summary>
          <NumberField
            label={tr('同类分配顺序（较小优先）')}
            value={node.priority}
            max={100}
            onChange={(priority) => patch({ priority })}
          />
          <p className="wf-note">
            {tr('多个“剩余全部”去向需要不同顺序，或改为固定数量。优先级相同的剩余去向会等待你选择。')}
          </p>
        </details>
      )}
    </aside>
  );
}
