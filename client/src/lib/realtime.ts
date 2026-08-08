import { supabase } from "@/lib/supabase";

export type RealtimeConnectionStatus =
  | "connected"
  | "connecting"
  | "disconnected"
  | "error";

type RealtimeSubscribeStatus =
  | "SUBSCRIBED"
  | "CHANNEL_ERROR"
  | "TIMED_OUT"
  | "CLOSED";

const COURSE_TABLES: { table: string; filter: (courseId: string) => string }[] =
  [
    { table: "courses", filter: (courseId) => `id=eq.${courseId}` },
    { table: "sources", filter: (courseId) => `course_id=eq.${courseId}` },
    {
      table: "artifact_generation_status",
      filter: (courseId) => `course_id=eq.${courseId}`,
    },
  ];

function mapSubscribeStatus(status: string): RealtimeConnectionStatus {
  switch (status as RealtimeSubscribeStatus) {
    case "SUBSCRIBED":
      return "connected";
    case "CHANNEL_ERROR":
      return "error";
    case "TIMED_OUT":
    case "CLOSED":
      return "disconnected";
    default:
      return "connecting";
  }
}

export function subscribeToCourseChanges(
  courseId: string,
  onInvalidate: () => void,
  onStatusChange: (status: RealtimeConnectionStatus) => void,
): () => void {
  onStatusChange("connecting");

  const channelName = `course:${courseId}`;
  const channel = supabase.channel(channelName);

  for (const { table, filter } of COURSE_TABLES) {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table,
        filter: filter(courseId),
      },
      () => {
        onInvalidate();
      },
    );
  }

  channel.subscribe((status) => {
    onStatusChange(mapSubscribeStatus(status));
  });

  return () => {
    supabase.removeChannel(channel);
    onStatusChange("disconnected");
  };
}
