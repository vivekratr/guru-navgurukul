export type LayoutNodeInput = {
  id: string;
  name: string;
  difficulty?: "beginner" | "intermediate" | "advanced" | null;
};

export type LayoutEdgeInput = {
  from: string;
  to: string;
  type: "contains" | "prerequisite" | "related";
};

export type LayoutPosition = {
  x: number;
  y: number;
};

const X_GAP = 260;
const Y_GAP = 100;

function buildStructuralRanks(
  nodeIds: string[],
  edges: LayoutEdgeInput[],
): Map<string, number> {
  const ranks = new Map<string, number>();
  for (const id of nodeIds) {
    ranks.set(id, 0);
  }

  const structural = edges.filter(
    (edge) => edge.type === "prerequisite" || edge.type === "contains",
  );

  for (let pass = 0; pass < nodeIds.length; pass += 1) {
    for (const edge of structural) {
      const nextRank = (ranks.get(edge.from) ?? 0) + 1;
      const current = ranks.get(edge.to) ?? 0;
      if (nextRank > current) {
        ranks.set(edge.to, nextRank);
      }
    }
  }

  return ranks;
}

export function layoutConceptGraph(
  nodes: LayoutNodeInput[],
  edges: LayoutEdgeInput[],
): Map<string, LayoutPosition> {
  const positions = new Map<string, LayoutPosition>();

  if (nodes.length === 0) {
    return positions;
  }

  const ranks = buildStructuralRanks(
    nodes.map((node) => node.id),
    edges,
  );

  const layers = new Map<number, string[]>();
  for (const node of nodes) {
    const rank = ranks.get(node.id) ?? 0;
    const layer = layers.get(rank) ?? [];
    layer.push(node.id);
    layers.set(rank, layer);
  }

  for (const [rank, layer] of layers) {
    const sorted = [...layer].sort((left, right) => {
      const leftNode = nodes.find((node) => node.id === left);
      const rightNode = nodes.find((node) => node.id === right);
      return (leftNode?.name ?? left).localeCompare(rightNode?.name ?? right);
    });

    sorted.forEach((nodeId, index) => {
      positions.set(nodeId, {
        x: rank * X_GAP,
        y: index * Y_GAP,
      });
    });
  }

  return positions;
}

export const EDGE_VISUALS: Record<
  LayoutEdgeInput["type"],
  { stroke: string; strokeDasharray?: string }
> = {
  prerequisite: { stroke: "#2563eb" },
  contains: { stroke: "#16a34a", strokeDasharray: "6 4" },
  related: { stroke: "#9ca3af", strokeDasharray: "2 4" },
};
