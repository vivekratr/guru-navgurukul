import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { useAuth } from "@/features/auth/AuthContext";
import {
  COURSE_POLL_INTERVAL_MS,
  isCourseProcessing,
} from "@/lib/course-processing";
import { queryKeys } from "@/lib/query-keys";
import {
  subscribeToCourseChanges,
  type RealtimeConnectionStatus,
} from "@/lib/realtime";
import { isWorkspaceContentUnlocked } from "@/lib/status-labels";
import type { CourseStatus } from "@/types/api";

type CourseResilienceOptions = {
  courseId: string;
  courseStatus: CourseStatus | undefined;
  realtimeConnected: boolean;
  setRealtimeStatus: (status: RealtimeConnectionStatus) => void;
  setIsOnline: (online: boolean) => void;
};

function invalidateArtifactQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  courseId: string,
): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.summary(courseId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.flashcards(courseId) });
  queryClient.invalidateQueries({
    queryKey: queryKeys.conceptGraph(courseId),
  });
}

export function useCourseResilience({
  courseId,
  courseStatus,
  realtimeConnected,
  setRealtimeStatus,
  setIsOnline,
}: CourseResilienceOptions): {
  shouldPoll: boolean;
  pollIntervalMs: number;
} {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const prevStatusRef = useRef<CourseStatus | undefined>(undefined);
  const prevRealtimeConnectedRef = useRef(false);

  const shouldWatchProcessing =
    Boolean(courseId) &&
    Boolean(session) &&
    courseStatus !== undefined &&
    isCourseProcessing(courseStatus);

  const shouldPoll =
    shouldWatchProcessing && !realtimeConnected && Boolean(courseId);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    function handleOnline() {
      setIsOnline(true);
      if (courseId) {
        queryClient.cancelQueries({ queryKey: queryKeys.course(courseId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.course(courseId) });
      }
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [courseId, queryClient, setIsOnline]);

  useEffect(() => {
    if (!courseId) {
      return;
    }

    function handleVisibilityChange() {
      if (!document.hidden) {
        queryClient.invalidateQueries({ queryKey: queryKeys.course(courseId) });
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [courseId, queryClient]);

  useEffect(() => {
    if (!shouldWatchProcessing || !courseId || !session) {
      setRealtimeStatus("disconnected");
      return;
    }

    const invalidateCourse = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.course(courseId) });
    };

    return subscribeToCourseChanges(courseId, invalidateCourse, setRealtimeStatus);
  }, [
    courseId,
    session,
    shouldWatchProcessing,
    queryClient,
    setRealtimeStatus,
  ]);

  useEffect(() => {
    if (!courseId) {
      return;
    }

    const wasConnected = prevRealtimeConnectedRef.current;
    if (!wasConnected && realtimeConnected) {
      queryClient.cancelQueries({ queryKey: queryKeys.course(courseId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.course(courseId) });
    }

    prevRealtimeConnectedRef.current = realtimeConnected;
  }, [courseId, realtimeConnected, queryClient]);

  useEffect(() => {
    if (!courseId || !courseStatus) {
      return;
    }

    const previousStatus = prevStatusRef.current;
    const wasUnlocked =
      previousStatus !== undefined &&
      isWorkspaceContentUnlocked(previousStatus);
    const isUnlocked = isWorkspaceContentUnlocked(courseStatus);

    if (isUnlocked && !wasUnlocked) {
      invalidateArtifactQueries(queryClient, courseId);
    }

    prevStatusRef.current = courseStatus;
  }, [courseId, courseStatus, queryClient]);

  return {
    shouldPoll,
    pollIntervalMs: COURSE_POLL_INTERVAL_MS,
  };
}
