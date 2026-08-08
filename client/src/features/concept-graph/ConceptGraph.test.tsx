import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const getConceptGraph = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    getConceptGraph: (...args: unknown[]) => getConceptGraph(...args),
  },
}));

vi.mock("@xyflow/react", () => ({
  Background: () => <div data-testid="graph-background" />,
  Controls: () => <div data-testid="graph-controls" />,
  ReactFlow: ({
    nodes,
  }: {
    nodes: Array<{ data: { label: string } }>;
  }) => (
    <div data-testid="react-flow">
      {nodes.map((node) => <span key={node.data.label}>{node.data.label}</span>)}
    </div>
  ),
}));

import { ConceptGraph } from "@/features/concept-graph/ConceptGraph";

describe("ConceptGraph", () => {
  beforeEach(() => {
    getConceptGraph.mockReset();
  });

  it("renders concept graph container", async () => {
    getConceptGraph.mockResolvedValue({
      nodes: [{ id: "n1", name: "Hooks", difficulty: "beginner" }],
      edges: [],
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ConceptGraph courseId="course-1" courseStatus="ready" />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Hooks")).toBeInTheDocument();
    });
  });
});
