import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCourse } from "@/features/courses/hooks";
import { api } from "@/lib/api";

const subscribeCleanup = vi.fn();

vi.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({
    session: { access_token: "token", user: { id: "user-1" } },
    loading: false,
    signOut: vi.fn(),
  }),
}));

vi.mock("@/lib/realtime", () => ({
  subscribeToCourseChanges: vi.fn(
    (_courseId: string, _invalidate: () => void, onStatusChange: (s: string) => void) => {
      onStatusChange("disconnected");
      return subscribeCleanup;
    },
  ),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getCourse: vi.fn(),
  },
}));

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useCourse resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("polls while processing and realtime is disconnected", async () => {
    vi.mocked(api.getCourse).mockResolvedValue({
      id: "course-1",
      title: "Course",
      status: "ingesting",
      last_error: null,
      sources: [],
      artifact_status: {},
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useCourse("course-1"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.data?.status).toBe("ingesting");
    });

    expect(result.current.shouldPoll).toBe(true);
    expect(result.current.realtimeStatus).toBe("disconnected");
  });

  it("cleans up realtime subscription on unmount", async () => {
    vi.mocked(api.getCourse).mockResolvedValue({
      id: "course-1",
      title: "Course",
      status: "ingesting",
      last_error: null,
      sources: [],
      artifact_status: {},
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { unmount } = renderHook(() => useCourse("course-1"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(api.getCourse).toHaveBeenCalled();
    });

    unmount();

    expect(subscribeCleanup).toHaveBeenCalled();
  });

  it("refetches on visibility change", async () => {
    vi.mocked(api.getCourse).mockResolvedValue({
      id: "course-1",
      title: "Course",
      status: "ready",
      last_error: null,
      sources: [],
      artifact_status: {},
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    renderHook(() => useCourse("course-1"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(api.getCourse).toHaveBeenCalledTimes(1);
    });

    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => {
      expect(api.getCourse).toHaveBeenCalledTimes(2);
    });
  });
});
