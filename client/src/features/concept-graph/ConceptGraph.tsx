import { useMemo } from "react";
import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";

import { Card } from "@/components/ui/Card";
import {
  EmptyState,
  ErrorMessage,
  LoadingMessage,
} from "@/components/ui/StateMessages";
import { useConceptGraph } from "@/features/courses/hooks";
import type { CourseStatus } from "@/types/api";

import { conceptNodeTypes } from "./ConceptNode";
import { EDGE_VISUALS, layoutConceptGraph } from "./layout";

import "@xyflow/react/dist/style.css";

function buildFlowGraph(
  nodes: {
    id: string;
    name: string;
    difficulty: "beginner" | "intermediate" | "advanced" | null;
  }[],
  edges: {
    from: string;
    to: string;
    type: "contains" | "prerequisite" | "related";
  }[],
): { flowNodes: Node[]; flowEdges: Edge[] } {
  const positions = layoutConceptGraph(nodes, edges);

  const flowNodes: Node[] = nodes.map((node) => ({
    id: node.id,
    type: "concept",
    data: { label: node.name, difficulty: node.difficulty },
    position: positions.get(node.id) ?? { x: 0, y: 0 },
  }));

  const flowEdges: Edge[] = edges.map((edge) => {
    const visuals = EDGE_VISUALS[edge.type];

    return {
      id: `${edge.from}-${edge.to}-${edge.type}`,
      source: edge.from,
      target: edge.to,
      type: "smoothstep",
      animated: edge.type === "prerequisite",
      style: {
        stroke: visuals.stroke,
        strokeWidth: 1.5,
        strokeDasharray: visuals.strokeDasharray,
      },
      label: edge.type === "related" ? undefined : edge.type,
      labelStyle: { fontSize: 10, fill: "#555" },
    };
  });

  return { flowNodes, flowEdges };
}

export function ConceptGraph({
  courseId,
  courseStatus,
}: {
  courseId: string;
  courseStatus: CourseStatus;
}) {
  const enabled =
    courseStatus === "ready" ||
    courseStatus === "partially_ready" ||
    courseStatus === "generating_artifacts" ||
    courseStatus === "extracting_knowledge";

  const { data, isLoading, isError, error, refetch } = useConceptGraph(
    courseId,
    enabled,
  );

  const { flowNodes, flowEdges } = useMemo(() => {
    if (!data) {
      return { flowNodes: [], flowEdges: [] };
    }

    return buildFlowGraph(data.nodes, data.edges);
  }, [data]);

  if (!enabled) {
    return (
      <EmptyState
        title="Concept graph not available yet"
        description="The graph appears after knowledge extraction."
      />
    );
  }

  if (isLoading) {
    return <LoadingMessage>Loading concept graph…</LoadingMessage>;
  }

  if (isError) {
    return <ErrorMessage error={error} onRetry={() => refetch()} />;
  }

  if (!data || data.nodes.length === 0) {
    return (
      <EmptyState
        title="No concepts yet"
        description="Concepts will appear after knowledge extraction."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden !p-0">
        <div className="h-[560px] w-full bg-pure-white">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={conceptNodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.4}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#e5e5e5" gap={24} size={1} />
            <Controls />
          </ReactFlow>
        </div>
      </Card>
      <div className="flex flex-wrap gap-4 text-body-sm text-charcoal">
        <span className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-6 bg-blue-600" />
          prerequisite
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-6 border-t-2 border-dashed border-green-600" />
          contains
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-6 border-t border-dotted border-gray-400" />
          related
        </span>
      </div>
    </div>
  );
}
