import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RetryControls } from "@/features/courses/RetryControls";
import type { CourseDetail } from "@/types/api";

const retryKnowledge = vi.fn();
const retryFlashcards = vi.fn();
const retrySummary = vi.fn();

vi.mock("@/features/courses/hooks", () => ({
  useRetryKnowledge: () => ({
    mutate: retryKnowledge,
    isPending: false,
  }),
  useRetryArtifact: (_courseId: string, type: string) => ({
    mutate:
      type === "flashcards" ? retryFlashcards : retrySummary,
    isPending: false,
  }),
}));

describe("RetryControls", () => {
  it("shows knowledge retry", async () => {
    const course: CourseDetail = {
      id: "course-1",
      title: "Course",
      status: "knowledge_extraction_failed",
      last_error: "failed",
      sources: [],
      artifact_status: {},
    };

    render(<RetryControls course={course} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Retry knowledge extraction" }),
    );

    expect(retryKnowledge).toHaveBeenCalled();
  });

  it("shows artifact retry buttons", async () => {
    const course: CourseDetail = {
      id: "course-1",
      title: "Course",
      status: "partially_ready",
      last_error: null,
      sources: [],
      artifact_status: {
        flashcards: "failed_permanent",
        summary: "failed_permanent",
      },
    };

    render(<RetryControls course={course} />);

    await userEvent.click(screen.getByRole("button", { name: "Retry flashcards" }));
    await userEvent.click(screen.getByRole("button", { name: "Retry summary" }));

    expect(retryFlashcards).toHaveBeenCalled();
    expect(retrySummary).toHaveBeenCalled();
  });
});
