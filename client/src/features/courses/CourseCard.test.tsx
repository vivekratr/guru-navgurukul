import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { CourseCard } from "@/features/courses/CourseCard";

describe("CourseCard", () => {
  it("renders course title and status", () => {
    render(
      <MemoryRouter>
        <CourseCard
          course={{
            id: "course-1",
            title: "React Hooks",
            status: "draft",
            updated_at: "2026-08-08T10:00:00.000Z",
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("React Hooks")).toBeInTheDocument();
    expect(screen.getByText("Add your sources")).toBeInTheDocument();
  });
});
