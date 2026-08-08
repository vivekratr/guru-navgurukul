import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { GenerateButton } from "@/features/courses/GenerateButton";
import type { CourseDetail } from "@/types/api";

const mutate = vi.fn();

vi.mock("@/features/courses/hooks", () => ({
  useGenerateCourse: () => ({
    mutate,
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
  }),
}));

const draftCourse: CourseDetail = {
  id: "course-1",
  title: "Course",
  status: "draft",
  last_error: null,
  sources: [
    {
      id: "source-1",
      type: "text",
      status: "pending",
      last_error: null,
    },
  ],
  artifact_status: {},
};

describe("GenerateButton", () => {
  it("calls generate mutation when clicked", async () => {
    render(<GenerateButton course={draftCourse} />);

    await userEvent.click(screen.getByRole("button", { name: "Generate" }));

    expect(mutate).toHaveBeenCalled();
  });

  it("is disabled without usable sources", () => {
    render(
      <GenerateButton
        course={{
          ...draftCourse,
          sources: [],
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "Generate" })).toBeDisabled();
  });
});
