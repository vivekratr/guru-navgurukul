import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ErrorMessage } from "@/components/ui/StateMessages";
import { ApiClientError } from "@/lib/api-error";

describe("ErrorMessage", () => {
  it("shows retry affordance for retryable API errors", async () => {
    const onRetry = vi.fn();

    render(
      <ErrorMessage
        error={
          new ApiClientError({
            code: "SOME_ERROR",
            message: "Something failed",
            retryable: true,
          })
        }
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText("Something failed")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("hides retry affordance when retryable is false", () => {
    render(
      <ErrorMessage
        error={
          new ApiClientError({
            code: "INVALID_STATE",
            message: "Not allowed",
            retryable: false,
          })
        }
        onRetry={() => {}}
      />,
    );

    expect(screen.getByText("Not allowed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });
});
