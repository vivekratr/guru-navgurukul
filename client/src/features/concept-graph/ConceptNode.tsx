import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

type ConceptNodeData = {
  label: string;
  difficulty: "beginner" | "intermediate" | "advanced" | null;
};

const DIFFICULTY_STYLES: Record<
  NonNullable<ConceptNodeData["difficulty"]>,
  string
> = {
  beginner: "border-sage-green/40 bg-sage-green/10 text-sage-green",
  intermediate: "border-amber-500/40 bg-amber-500/10 text-amber-700",
  advanced: "border-rose-500/40 bg-rose-500/10 text-rose-700",
};

function ConceptNodeComponent({ data }: NodeProps) {
  const nodeData = data as ConceptNodeData;
  const difficultyClass = nodeData.difficulty
    ? DIFFICULTY_STYLES[nodeData.difficulty]
    : "border-charcoal/20 bg-pure-white text-charcoal";

  return (
    <div
      className={`min-w-[160px] max-w-[200px] rounded-lg border px-3 py-2 shadow-sm ${difficultyClass}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-charcoal/40" />
      <p className="text-body-sm font-medium leading-snug text-ink-black">
        {nodeData.label}
      </p>
      {nodeData.difficulty && (
        <p className="mt-1 text-xs capitalize opacity-80">{nodeData.difficulty}</p>
      )}
      <Handle type="source" position={Position.Right} className="!bg-charcoal/40" />
    </div>
  );
}

export const ConceptNode = memo(ConceptNodeComponent);

export const conceptNodeTypes = {
  concept: ConceptNode,
};
