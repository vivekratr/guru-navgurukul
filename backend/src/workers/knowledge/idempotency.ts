export const SKIPPABLE_COURSE_STATUSES = [
  "generating_artifacts",
  "ready",
  "partially_ready",
  "draft",
  "knowledge_extraction_failed",
] as const;

export type CourseRow = {
  status: string;
};

export type KnowledgeIdempotencyDecision =
  | { action: "skip"; reason: string }
  | { action: "claim" }
  | { action: "resume_processing" };

export function decideKnowledgeIdempotency(
  course: CourseRow,
): KnowledgeIdempotencyDecision {
  if (SKIPPABLE_COURSE_STATUSES.includes(course.status as never)) {
    return { action: "skip", reason: `course already ${course.status}` };
  }

  if (course.status === "extracting_knowledge") {
    return { action: "resume_processing" };
  }

  if (course.status === "ingesting") {
    return { action: "claim" };
  }

  return {
    action: "skip",
    reason: `unsupported course status ${course.status}`,
  };
}
