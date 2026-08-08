import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SourceItem } from "@/features/sources/SourceItem";

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("SourceItem", () => {
  it("renders source status labels", () => {
    renderWithQuery(
      <SourceItem
        courseId="course-1"
        source={{
          id: "source-1",
          type: "doc",
          status: "failed",
          last_error: null,
        }}
      />,
    );

    expect(screen.getByText("Retrying")).toBeInTheDocument();
  });

  it("shows retry for failed_permanent", () => {
    renderWithQuery(
      <SourceItem
        courseId="course-1"
        source={{
          id: "source-2",
          type: "video",
          status: "failed_permanent",
          last_error: "Permanent failure",
        }}
      />,
    );

    expect(screen.getByText("Failed — Retry")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Retry source" }),
    ).toBeInTheDocument();
  });
});
