import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCourseResilience } from "@/features/courses/course-resilience";
import { subscribeToCourseChanges } from "@/lib/realtime";

const invalidateQueries = vi.fn();
const cancelQueries = vi.fn();

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );

  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries,
      cancelQueries,
    }),
  };
});

vi.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({
    session: { access_token: "token", user: { id: "user-1" } },
    loading: false,
    signOut: vi.fn(),
  }),
}));

vi.mock("@/lib/realtime", () => ({
  subscribeToCourseChanges: vi.fn(() => () => {}),
}));

function renderResilience(
  courseStatus: "ingesting" | "ready",
  realtimeConnected: boolean,
) {
  const setRealtimeStatus = vi.fn();
  const setIsOnline = vi.fn();

  return renderHook(
    () =>
      useCourseResilience({
        courseId: "course-1",
        courseStatus,
        realtimeConnected,
        setRealtimeStatus,
        setIsOnline,
      }),
    {
      wrapper: ({ children }) => (
        <QueryClientProvider
          client={
            new QueryClient({
              defaultOptions: { queries: { retry: false } },
            })
          }
        >
          {children}
        </QueryClientProvider>
      ),
    },
  );
}

describe("useCourseResilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enables polling only while processing and realtime is disconnected", () => {
    const { result } = renderResilience("ingesting", false);
    expect(result.current.shouldPoll).toBe(true);

    const connected = renderResilience("ingesting", true);
    expect(connected.result.current.shouldPoll).toBe(false);

    const terminal = renderResilience("ready", false);
    expect(terminal.result.current.shouldPoll).toBe(false);
  });

  it("invalidates course query when realtime reconnects", async () => {
    const { rerender } = renderHook(
      ({ realtimeConnected }: { realtimeConnected: boolean }) =>
        useCourseResilience({
          courseId: "course-1",
          courseStatus: "ingesting",
          realtimeConnected,
          setRealtimeStatus: vi.fn(),
          setIsOnline: vi.fn(),
        }),
      {
        initialProps: { realtimeConnected: false },
        wrapper: ({ children }) => (
          <QueryClientProvider
            client={
              new QueryClient({
                defaultOptions: { queries: { retry: false } },
              })
            }
          >
            {children}
          </QueryClientProvider>
        ),
      },
    );

    rerender({ realtimeConnected: true });

    await waitFor(() => {
      expect(cancelQueries).toHaveBeenCalled();
      expect(invalidateQueries).toHaveBeenCalled();
    });
  });

  it("subscribes to realtime only once per mounted course", () => {
    renderResilience("ingesting", false);
    expect(subscribeToCourseChanges).toHaveBeenCalledTimes(1);
  });
});
