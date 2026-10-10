import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { WorkflowNode, NodeProjection } from "../../domain/workflow/types";
import { nodeLabels } from "../../domain/workflowEditor";
import { formatDay } from "../../domain/workflow/date";
import { memo } from "react";
import WorkflowIcon from "./WorkflowIcon";
import { tr } from '../../i18n/active';
export type CardData = {
  node: WorkflowNode;
  subtitle: string;
  icon?: string;
  today: string;
  progress?: string;
  projection?: NodeProjection;
  problems: number;
  onAdd?: (id: string, side: "input" | "output") => void;
};
export type FlowNode = Node<CardData, "operation">;
export default memo(function WorkflowCard({
  data,
  selected,
}: NodeProps<FlowNode>) {
  const n = data.node;
  return (
    <div className={`wf-node kind-${n.kind} ${selected ? "selected" : ""}`}>
      {!["purchase", "inventory"].includes(n.kind) && (
        <Handle
          type="target"
          position={Position.Left}
          aria-label={tr('连接输入')}
          onClick={(e) => {
            e.stopPropagation();
            data.onAdd?.(n.id, "input");
          }}
        />
      )}
      <div className="wf-node-top">
        <span>
          <WorkflowIcon name={n.kind} size={14} />
          {nodeLabels[n.kind]}
        </span>
        {n.repeat && ["plant", "purchase"].includes(n.kind) && (
          <b>
            <WorkflowIcon name="repeat" size={12} />
            {n.kind === "plant" ? tr('自动续种') : tr('循环')}
          </b>
        )}
      </div>
      <div className="wf-node-name">
        <span className="wf-node-art">
          {data.icon ? (
            <img
              src={data.icon}
              width={36}
              height={36}
              alt=""
              draggable={false}
            />
          ) : (
            <WorkflowIcon name={n.kind} size={25} />
          )}
        </span>
        <strong>{n.label}</strong>
      </div>
      <p>{data.subtitle || tr('点击设置物品与数量')}</p>
      <small className="wf-node-date">
        <WorkflowIcon name="calendar" size={12} />
        {data.projection?.firstDay !== undefined
          ? `${formatDay(data.projection.firstDay)}${data.projection.finishDay !== data.projection.firstDay ? ` → ${formatDay(data.projection.finishDay!)}` : ""}`
          : n.dateMode === "manual"
            ? tr('{date} 起', { date: formatDay(n.startDay) })
            : tr('原料齐备后自动安排')}
        {n.remainingDays !== undefined ? tr(' · 已在进行') : ""}
      </small>
      {data.projection && (
        <div className={`wf-node-status ${data.projection.status}`}>
          {data.projection.notices[0] ??
            (n.kind === "plant"
              ? tr('需 {land} 格土地 · 收获 {outputQuantity} 个', { land: data.projection.land, outputQuantity: data.projection.outputQuantity })
              : n.kind === "process"
                ? tr('{machines} 台机器 · 产出 {outputQuantity} 个', { machines: data.projection.machines, outputQuantity: data.projection.outputQuantity })
                : data.projection.delivered
                  ? tr('已交付')
                  : tr('数量与日期随上游推算'))}
        </div>
      )}
      {data.progress && <div className="wf-node-progress">{data.progress}</div>}
      {data.today && (
        <div className={`wf-node-today ${data.problems ? "has-problems" : ""}`}>
          {data.today}
        </div>
      )}
      {!["reserve", "delivery", "consume", "sale"].includes(n.kind) && (
        <Handle
          type="source"
          position={Position.Right}
          aria-label={tr('连接产物')}
          onClick={(e) => {
            e.stopPropagation();
            data.onAdd?.(n.id, "output");
          }}
        />
      )}
      {!["purchase", "inventory"].includes(n.kind) && (
        <button
          className="wf-node-add input nodrag nopan"
          aria-label={tr('添加前置节点')}
          onClick={(e) => {
            e.stopPropagation();
            data.onAdd?.(n.id, "input");
          }}
        >
          <WorkflowIcon name="plus" size={14} />
        </button>
      )}
      {!["reserve", "delivery", "consume", "sale"].includes(n.kind) && (
        <button
          className="wf-node-add output nodrag nopan"
          aria-label={tr('添加后续节点')}
          onClick={(e) => {
            e.stopPropagation();
            data.onAdd?.(n.id, "output");
          }}
        >
          <WorkflowIcon name="plus" size={14} />
        </button>
      )}
    </div>
  );
});
