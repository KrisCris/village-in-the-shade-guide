import { useState } from "react";
import type { AssistanceAction, WorkflowAssistance as Advice } from "../../domain/workflow/assistance";
import WorkflowIcon from "./WorkflowIcon";

export default function WorkflowAssistance({ advice, onAction }: { advice: Advice; onAction: (key: string) => void }) {
  const [query, setQuery] = useState("");
  const action = (a: AssistanceAction) => (
    <button className="wf-assist-action" key={a.key} onClick={() => onAction(a.key)}>
      <WorkflowIcon name={a.targetId ? "link" : a.kind} size={17} />
      <span><strong>{a.label}</strong><small>{a.detail}</small></span>
      <WorkflowIcon name="plus" size={14} />
    </button>
  );
  if (!advice.next.length && !advice.inputs.length) return null;
  const choices = advice.next.filter(a => `${a.label} ${a.detail}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <section className="wf-assistance" aria-label="流程辅助">
    {advice.inputs.length > 0 && <details open className="wf-assist-group">
      <summary><WorkflowIcon name="inventory" size={16} /> 补齐加工原料 <span>{advice.inputs.length} 项</span></summary>
      <p className="wf-note">按当前已分配原料计算缺口。下面的买入或库存数量是本次安排，修改上游后会重新提示缺口。</p>
      {advice.inputs.map(input => <div className="wf-assist-ingredient" key={input.itemId}>
        <strong>{input.name}</strong>
        <small>{input.shortage > 0 ? `还需 ${input.shortage} 个 · 已分配 ${input.received} 个` : "尚未连接来源"} · 每批 {input.perBatch} 个</small>
        <div className="wf-assist-options">{input.actions.map(action)}</div>
        {!input.actions.length && <p className="wf-note">请连接来源，或分次添加原料节点。</p>}
      </div>)}
    </details>}
    {advice.next.length > 0 && <details open className="wf-assist-group">
      <summary><WorkflowIcon name="link" size={16} /> 接下来做什么 <span>{advice.next.length} 项</span></summary>
      <p className="wf-note">根据当前产物筛选，选好后自动添加并连线。产值差额按当前品质比较原料与产物卖价，不含设备成本。</p>
      {advice.next.length > 5 && <input className="wf-assist-search" aria-label="搜索后续操作" placeholder="搜索加工、出售或留货…" value={query} onChange={e => setQuery(e.target.value)} />}
      <div className="wf-assist-options wf-assist-scroll">{choices.map(action)}</div>
      {!choices.length && <p className="wf-note">没有匹配的后续操作。</p>}
    </details>}
  </section>;
}
