import type { CourseStatus, SourceStatus } from "@/types/api";

export function courseStatusLabel(status: CourseStatus): string {
  switch (status) {
    case "draft":
      return "Add your sources";
    case "ingesting":
      return "Reading your sources…";
    case "extracting_knowledge":
      return "Finding the concepts…";
    case "knowledge_extraction_failed":
      return "Couldn't map the concepts";
    case "generating_artifacts":
      return "Writing flashcards and summaries…";
    case "ready":
      return "Course ready";
    case "partially_ready":
      return "Course partially ready";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function sourceStatusLabel(status: SourceStatus): string {
  switch (status) {
    case "pending":
      return "Waiting to be processed";
    case "processing":
      return "Reading/processing";
    case "done":
      return "Ready";
    case "failed":
      return "Retrying";
    case "failed_permanent":
      return "Failed — Retry";
    case "cancelled":
      return "Cancelled";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function artifactStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "processing":
      return "Generating…";
    case "done":
      return "Done";
    case "failed":
      return "Retrying";
    case "failed_permanent":
      return "Failed — Retry";
    default:
      return status;
  }
}

export function sourceTypeLabel(type: string): string {
  switch (type) {
    case "text":
      return "TEXT";
    case "doc":
      return "DOCUMENT";
    case "image":
      return "IMAGE";
    case "video":
      return "VIDEO";
    default:
      return type.toUpperCase();
  }
}

export function isWorkspaceContentUnlocked(status: CourseStatus): boolean {
  return status === "ready" || status === "partially_ready";
}

export function hasUsableSources(
  sources: { status: string }[],
): boolean {
  return sources.some(
    (source) => source.status === "pending" || source.status === "done",
  );
}
