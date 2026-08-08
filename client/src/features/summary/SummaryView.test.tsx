import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { SummaryView } from "@/features/summary/SummaryView";

const getSummary = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    getSummary: (...args: unknown[]) => getSummary(...args),
  },
}));

function renderSummary(status: "ready" | "draft" = "ready") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SummaryView courseId="course-1" courseStatus={status} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SummaryView", () => {
  beforeEach(() => {
    getSummary.mockReset();
  });

  it("renders summary content", async () => {
    getSummary.mockResolvedValue({
      short: "Short text",
      detailed: "Detailed text",
    });

    renderSummary();

    await waitFor(() => {
      expect(screen.getByText("Short text")).toBeInTheDocument();
    });

    expect(screen.getByText("Detailed text")).toBeInTheDocument();
  });
});
