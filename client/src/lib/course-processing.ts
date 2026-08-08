import type { CourseStatus } from "@/types/api";

export const COURSE_POLL_INTERVAL_MS = 3000;

export const COURSE_PROCESSING_STATUSES: readonly CourseStatus[] = [
  "ingesting",
  "extracting_knowledge",
  "generating_artifacts",
];

export const COURSE_TERMINAL_STATUSES: readonly CourseStatus[] = [
  "draft",
  "ready",
  "partially_ready",
  "knowledge_extraction_failed",
];

export function isCourseProcessing(status: CourseStatus): boolean {
  return COURSE_PROCESSING_STATUSES.includes(status);
}

export function isCourseTerminalForPolling(status: CourseStatus): boolean {
  return !isCourseProcessing(status);
}
