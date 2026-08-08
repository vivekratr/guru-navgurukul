import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  useMutation,
} from "@tanstack/react-query";
import { useState } from "react";

import { useCourseResilience } from "@/features/courses/course-resilience";
import { api } from "@/lib/api";
import { isCourseProcessing } from "@/lib/course-processing";
import { queryKeys } from "@/lib/query-keys";
import type { RealtimeConnectionStatus } from "@/lib/realtime";

export function useCourses() {
  return useQuery({
    queryKey: queryKeys.courses,
    queryFn: () => api.getCourses(),
  });
}

export function useCreateCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (title: string) => api.createCourse(title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.courses });
    },
  });
}

export function useCourse(courseId: string) {
  const queryClient = useQueryClient();
  const [realtimeStatus, setRealtimeStatus] =
    useState<RealtimeConnectionStatus>("disconnected");
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  const query = useQuery({
    queryKey: queryKeys.course(courseId),
    queryFn: () => api.getCourse(courseId),
    enabled: Boolean(courseId),
    placeholderData: keepPreviousData,
    retry: (failureCount, error) => {
      if (!navigator.onLine) {
        return false;
      }

      if (error instanceof Error && error.message === "Failed to fetch") {
        return failureCount < 2;
      }

      return false;
    },
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      if (!status || !isCourseProcessing(status)) {
        return false;
      }

      if (realtimeStatus === "connected") {
        return false;
      }

      return 3000;
    },
  });

  const realtimeConnected = realtimeStatus === "connected";

  const { shouldPoll } = useCourseResilience({
    courseId,
    courseStatus: query.data?.status,
    realtimeConnected,
    setRealtimeStatus,
    setIsOnline,
  });

  const isShowingStaleData =
    Boolean(query.data) && query.isError && !query.isFetching;
  const isLive =
    realtimeConnected &&
    query.data?.status !== undefined &&
    isCourseProcessing(query.data.status);

  return {
    ...query,
    realtimeStatus,
    isOnline,
    shouldPoll,
    isShowingStaleData,
    isLive,
    invalidateCourse: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.course(courseId) }),
  };
}

export function useGenerateCourse(courseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.generateCourse(courseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.course(courseId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.courses });
    },
  });
}

export function useRetryKnowledge(courseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.retryKnowledgeExtraction(courseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.course(courseId) });
    },
  });
}

export function useRetryArtifact(
  courseId: string,
  artifactType: "flashcards" | "summary",
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.retryArtifact(courseId, artifactType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.course(courseId) });
      if (artifactType === "flashcards") {
        queryClient.invalidateQueries({
          queryKey: queryKeys.flashcards(courseId),
        });
      } else {
        queryClient.invalidateQueries({
          queryKey: queryKeys.summary(courseId),
        });
      }
    },
  });
}

export function useSummary(courseId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.summary(courseId),
    queryFn: () => api.getSummary(courseId),
    enabled: Boolean(courseId) && enabled,
  });
}

export function useFlashcards(courseId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.flashcards(courseId),
    queryFn: () => api.getFlashcards(courseId),
    enabled: Boolean(courseId) && enabled,
  });
}

export function useConceptGraph(courseId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.conceptGraph(courseId),
    queryFn: () => api.getConceptGraph(courseId),
    enabled: Boolean(courseId) && enabled,
  });
}
