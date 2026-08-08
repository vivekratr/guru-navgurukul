export const queryKeys = {
  courses: ["courses"] as const,
  course: (courseId: string) => ["course", courseId] as const,
  summary: (courseId: string) => ["course", courseId, "summary"] as const,
  flashcards: (courseId: string) => ["course", courseId, "flashcards"] as const,
  conceptGraph: (courseId: string) =>
    ["course", courseId, "concept-graph"] as const,
};
