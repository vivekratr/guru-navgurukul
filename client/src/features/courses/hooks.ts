import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

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
  return useQuery({
    queryKey: queryKeys.course(courseId),
    queryFn: () => api.getCourse(courseId),
    enabled: Boolean(courseId),
  });
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
