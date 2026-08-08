import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { FlashcardList } from "@/features/flashcards/FlashcardList";

const getFlashcards = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    getFlashcards: (...args: unknown[]) => getFlashcards(...args),
  },
}));

describe("FlashcardList", () => {
  beforeEach(() => {
    getFlashcards.mockReset();
  });

  it("renders flashcards", async () => {
    getFlashcards.mockResolvedValue({
      flashcards: [
        {
          id: "fc-1",
          concept_id: null,
          front: "What is a hook?",
          back: "A React function",
        },
      ],
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <FlashcardList courseId="course-1" courseStatus="ready" />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("What is a hook?")).toBeInTheDocument();
    });
  });
});
