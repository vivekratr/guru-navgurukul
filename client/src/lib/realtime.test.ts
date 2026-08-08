import { beforeEach, describe, expect, it, vi } from "vitest";

import { supabase } from "@/lib/supabase";
import { subscribeToCourseChanges } from "@/lib/realtime";

const channelHandlers = {
  onInvalidate: vi.fn(),
  onStatusChange: vi.fn(),
};

const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn((callback: (status: string) => void) => {
    callback("SUBSCRIBED");
    return "ok";
  }),
};

vi.mock("@/lib/supabase", () => ({
  supabase: {
    channel: vi.fn(() => mockChannel),
    removeChannel: vi.fn(),
  },
}));

describe("subscribeToCourseChanges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    channelHandlers.onInvalidate.mockReset();
    channelHandlers.onStatusChange.mockReset();
    mockChannel.on.mockClear();
    mockChannel.subscribe.mockClear();
  });

  it("subscribes to course-scoped tables and reports connection status", () => {
    const cleanup = subscribeToCourseChanges(
      "course-1",
      channelHandlers.onInvalidate,
      channelHandlers.onStatusChange,
    );

    expect(mockChannel.on).toHaveBeenCalled();
    expect(channelHandlers.onStatusChange).toHaveBeenCalledWith("connecting");
    expect(channelHandlers.onStatusChange).toHaveBeenCalledWith("connected");

    cleanup();

    expect(supabase.removeChannel).toHaveBeenCalledWith(mockChannel);
    expect(channelHandlers.onStatusChange).toHaveBeenCalledWith("disconnected");
  });

  it("invalidates on postgres change events", () => {
    subscribeToCourseChanges(
      "course-1",
      channelHandlers.onInvalidate,
      channelHandlers.onStatusChange,
    );

    const changeHandler = mockChannel.on.mock.calls.find(
      (call) => call[1]?.table === "courses",
    )?.[2];

    expect(changeHandler).toBeTypeOf("function");
    changeHandler?.();
    expect(channelHandlers.onInvalidate).toHaveBeenCalled();
  });
});
