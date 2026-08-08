import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GenerationProgress } from "@/features/courses/GenerationProgress";
import type { CourseDetail } from "@/types/api";

describe("GenerationProgress", () => {
  it("shows ingesting per-source progress", () => {
    const course: CourseDetail = {
      id: "course-1",
      title: "Course",
      status: "ingesting",
      last_error: null,
      sources: [
        {
          id: "s1",
          type: "text",
          status: "done",
          last_error: null,
        },
        {
          id: "s2",
          type: "doc",
          status: "processing",
          last_error: null,
        },
      ],
      artifact_status: {},
    };

    render(<GenerationProgress course={course} />);

    expect(screen.getByText("1 of 2 sources processed")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("Reading/processing")).toBeInTheDocument();
  });
});
