import {Handle,Position,type NodeProps,type Node} from '@xyflow/react';
import type {WorkflowNode} from '../../domain/workflow/types';
import {nodeLabels} from '../../domain/workflowEditor';
import {formatDay} from '../../domain/workflow/date';
export type CardData={node:WorkflowNode;subtitle:string;icon?:string;today:string;progress?:string;problems:number};
export type FlowNode=Node<CardData,'operation'>;
export default function WorkflowCard({data,selected}:NodeProps<FlowNode>){
 const n=data.node;return <div className={`wf-node kind-${n.kind} ${selected?'selected':''}`}>
 {!['purchase','inventory'].includes(n.kind)&&<Handle type="target" position={Position.Left} aria-label="连接输入"/>}
 <div className="wf-node-top"><span>{nodeLabels[n.kind]}</span>{n.repeat&&<b>{n.kind==='plant'?'↻ 自动续种':'↻ 循环'}</b>}</div>
 <div className="wf-node-name">{data.icon&&<img src={data.icon} width={32} height={32} alt=""/>}<strong>{n.label}</strong></div>
 <p>{data.subtitle||'点击设置物品与数量'}</p>
 <small>{formatDay(n.startDay)} 起{n.autoBuy?' · 缺种补买':''}{n.remainingDays!==undefined?' · 已在进行':''}</small>
 {data.progress&&<div className="wf-node-progress">{data.progress}</div>}
 {data.today&&<div className={`wf-node-today ${data.problems?'has-problems':''}`}>{data.today}</div>}
 {!['reserve','delivery','consume','sale'].includes(n.kind)&&<Handle type="source" position={Position.Right} aria-label="连接产物"/>}
 </div>;
}
