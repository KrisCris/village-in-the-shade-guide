import type { Entity } from "../../data/types";
import type { WorkflowPlan } from "../../domain/workflow/types";
import { QUALITY_LABELS, QUALITY_VALUES } from "../../domain/quality";
import { DateField, NumberField } from "./fields";
import { tr } from '../../i18n/active';
export default function PlanResources({
  plan,
  onChange,
}: {
  plan: WorkflowPlan;
  entities: Entity[];
  onChange: (p: WorkflowPlan) => void;
}) {
  return (
    <div className="wf-resources">
      <h3>{tr('日期与计算假设')}</h3>
      <p className="wf-note">
        {tr('填写买入和生产安排后，土地、启动资金与机器需求会自动计算。')}
      </p>
      <DateField
        label={tr('计划开始')}
        value={plan.startDay}
        onChange={(startDay) => onChange({ ...plan, startDay })}
      />
      <NumberField
        label={tr('计划天数（购买 / 续种范围）')}
        value={plan.days}
        min={1}
        max={112}
        onChange={(days) => onChange({ ...plan, days })}
      />
      <p className="wf-note">
        {tr('已有手动日期保持不变。期末之后的加工、出货和到账继续推算，单独列出。')}
      </p>
      <NumberField
        label={tr('出货后到账天数（计算假设）')}
        value={plan.settlementDays}
        max={7}
        onChange={(settlementDays) => onChange({ ...plan, settlementDays })}
      />
      <label className="wf-field">
        {tr('统一品质假设')}
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
      <p className="wf-note">
        {tr('收支只计购买原料和出货。机器购置、土地扩建等费用另计；推算的资源数量表示完成该流程的需求。')}
      </p>
    </div>
  );
}
