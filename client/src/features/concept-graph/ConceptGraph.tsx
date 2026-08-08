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

import "@xyflow/react/dist/style.css";

function layoutNodes(
  nodes: { id: string; name: string }[],
): Node<{ label: string }>[] {
  const columns = 3;
  const xGap = 220;
  const yGap = 100;

  return nodes.map((node, index) => ({
    id: node.id,
    data: { label: node.name },
    position: {
      x: (index % columns) * xGap,
      y: Math.floor(index / columns) * yGap,
    },
  }));
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

    const nodes = layoutNodes(data.nodes);
    const edges: Edge[] = data.edges.map((edge) => ({
      id: `${edge.from}-${edge.to}-${edge.type}`,
      source: edge.from,
      target: edge.to,
      label: edge.type,
    }));

    return { flowNodes: nodes, flowEdges: edges };
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
    <Card className="overflow-hidden !p-0">
      <div className="h-[480px] w-full bg-pure-white">
        <ReactFlow nodes={flowNodes} edges={flowEdges} fitView>
          <Background color="#333333" gap={20} size={1} />
          <Controls />
        </ReactFlow>
      </div>
    </Card>
  );
}
