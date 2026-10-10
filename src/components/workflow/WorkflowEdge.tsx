import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";
import WorkflowIcon from "./WorkflowIcon";
import { tr } from '../../i18n/active';
export default function WorkflowEdge(props: EdgeProps) {
  const [path, x, y] = getSmoothStepPath(props);
  const onInsert = props.data?.onInsert as
    ((id: string, position: { x: number; y: number }) => void) | undefined;
  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        style={props.style}
        interactionWidth={28}
      />
      <EdgeLabelRenderer>
        <div
          className={`wf-edge-middle nodrag nopan ${props.data?.focus ? `wf-chain-${props.data.focus}` : ""}`}
          style={{
            transform: `translate(-50%, -50%) translate(${x}px,${y}px)`,
          }}
        >
          <span>{props.label}</span>
          <button
            type="button"
            aria-label={tr('在连线中插入节点')}
            title={tr('插入节点并自动连接')}
            onClick={(e) => {
              e.stopPropagation();
              onInsert?.(props.id, { x, y });
            }}
          >
            <WorkflowIcon name="plus" size={14} />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
