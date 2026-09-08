import type { Entity } from "../../data/types";
import type { WorkflowPlan } from "../../domain/workflow/types";
import { uid } from "../../domain/workflowEditor";
import { QUALITY_LABELS, QUALITY_VALUES } from "../../domain/quality";
import { DateField, EntityPicker, NumberField } from "./fields";

export default function PlanResources({
  plan,
  entities,
  onChange,
}: {
  plan: WorkflowPlan;
  entities: Entity[];
  onChange: (p: WorkflowPlan) => void;
}) {
  return (
    <details className="wf-resources" open>
      <summary>
        计划资源与计算设置{" "}
        <span>
          {plan.plots.reduce((n, p) => n + p.capacity, 0)} 格土地 ·{" "}
          {plan.machines.reduce((n, m) => n + m.count, 0)} 台机器
        </span>
      </summary>
      <div className="wf-resource-grid">
        <section>
          <h3>日期与资金</h3>
          <DateField
            label="计划开始"
            value={plan.startDay}
            onChange={(startDay) => onChange({ ...plan, startDay })}
          />
          <p className="wf-note">更改计划开始日不会移动已有节点的日期。</p>
          <NumberField
            label="推演天数（可跨月）"
            value={plan.days}
            min={1}
            max={112}
            onChange={(days) => onChange({ ...plan, days })}
          />
          <NumberField
            label="初始现金"
            value={plan.initialCash}
            max={1e12}
            onChange={(initialCash) => onChange({ ...plan, initialCash })}
          />
          <NumberField
            label="出货后到账天数（计算假设）"
            value={plan.settlementDays}
            max={7}
            onChange={(settlementDays) => onChange({ ...plan, settlementDays })}
          />
          <label className="wf-field">
            统一品质假设
            <select
              value={plan.quality}
              onChange={(e) =>
                onChange({
                  ...plan,
                  quality: e.target.value as WorkflowPlan["quality"],
                })
              }
            >
              {QUALITY_VALUES.map((q) => (
                <option key={q} value={q}>
                  {QUALITY_LABELS[q]}
                </option>
              ))}
            </select>
          </label>
        </section>
        <section>
          <h3>土地</h3>
          {plan.plots.map((p, i) => (
            <div className="wf-resource-row" key={p.id}>
              <label className="wf-field">
                地块名称
                <input
                  value={p.label}
                  maxLength={120}
                  onChange={(e) =>
                    onChange({
                      ...plan,
                      plots: plan.plots.map((v, j) =>
                        i === j ? { ...v, label: e.target.value } : v,
                      ),
                    })
                  }
                />
              </label>
              <NumberField
                label="格数"
                min={1}
                value={p.capacity}
                onChange={(capacity) =>
                  onChange({
                    ...plan,
                    plots: plan.plots.map((v, j) =>
                      i === j ? { ...v, capacity } : v,
                    ),
                  })
                }
              />
              <button
                onClick={() =>
                  onChange({
                    ...plan,
                    plots: plan.plots.filter((v) => v.id !== p.id),
                  })
                }
              >
                移除地块
              </button>
            </div>
          ))}
          <button
            disabled={plan.plots.length >= 50}
            onClick={() =>
              onChange({
                ...plan,
                plots: [
                  ...plan.plots,
                  {
                    id: uid(),
                    label: `地块 ${plan.plots.length + 1}`,
                    capacity: 12,
                  },
                ],
              })
            }
          >
            ＋ 添加地块
          </button>
        </section>
        <section>
          <h3>共享机器</h3>
          <p className="wf-note">
            同一组机器被所有连接的加工任务共享。改良机器的同时加工批数，请根据游戏实际情况调整；默认每台
            1 批。
          </p>
          {plan.machines.map((m, i) => (
            <div className="wf-resource-row" key={m.id}>
              <label className="wf-field">
                机器组名称
                <input
                  value={m.label}
                  maxLength={120}
                  onChange={(e) =>
                    onChange({
                      ...plan,
                      machines: plan.machines.map((v, j) =>
                        i === j ? { ...v, label: e.target.value } : v,
                      ),
                    })
                  }
                />
              </label>
              <NumberField
                label="台数"
                min={1}
                max={100}
                value={m.count}
                onChange={(count) =>
                  onChange({
                    ...plan,
                    machines: plan.machines.map((v, j) =>
                      i === j ? { ...v, count } : v,
                    ),
                  })
                }
              />
              <NumberField
                label="每台同时加工批数"
                min={1}
                max={100}
                value={m.capacity}
                onChange={(capacity) =>
                  onChange({
                    ...plan,
                    machines: plan.machines.map((v, j) =>
                      i === j ? { ...v, capacity } : v,
                    ),
                  })
                }
              />
              <button
                onClick={() =>
                  onChange({
                    ...plan,
                    machines: plan.machines.filter((v) => v.id !== m.id),
                  })
                }
              >
                移除机器组
              </button>
            </div>
          ))}
          <EntityPicker
            label="添加机器型号"
            entities={entities.filter((e) => e.kind === "machines")}
            onChange={(machineId) => {
              const m = entities.find(
                (e) => e.kind === "machines" && e.id === machineId,
              )!;
              onChange({
                ...plan,
                machines: [
                  ...plan.machines,
                  {
                    id: uid(),
                    label: m.name.zh_hans,
                    machineId,
                    count: 1,
                    capacity: 1,
                  },
                ],
              });
            }}
          />
        </section>
      </div>
    </details>
  );
}
