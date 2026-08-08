import { useRetryArtifact, useRetryKnowledge } from "@/features/courses/hooks";
import type { CourseDetail } from "@/types/api";

export function RetryControls({ course }: { course: CourseDetail }) {
  const retryKnowledge = useRetryKnowledge(course.id);
  const retryFlashcards = useRetryArtifact(course.id, "flashcards");
  const retrySummary = useRetryArtifact(course.id, "summary");

  const flashcardsFailed =
    course.artifact_status.flashcards === "failed_permanent";
  const summaryFailed = course.artifact_status.summary === "failed_permanent";

  if (
    course.status !== "knowledge_extraction_failed" &&
    !flashcardsFailed &&
    !summaryFailed
  ) {
    return null;
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <h3 className="font-medium text-amber-900">Retry options</h3>

      {course.status === "knowledge_extraction_failed" && (
        <div className="mt-3">
          <p className="text-sm text-amber-800">
            Knowledge extraction failed. Retry without re-uploading sources.
          </p>
          <button
            type="button"
            onClick={() => retryKnowledge.mutate()}
            disabled={retryKnowledge.isPending}
            className="mt-2 text-sm font-medium text-amber-900 underline"
          >
            {retryKnowledge.isPending ? "Retrying…" : "Retry knowledge extraction"}
          </button>
        </div>
      )}

      {flashcardsFailed && (
        <div className="mt-3">
          <p className="text-sm text-amber-800">Flashcard generation failed.</p>
          <button
            type="button"
            onClick={() => retryFlashcards.mutate()}
            disabled={retryFlashcards.isPending}
            className="mt-2 text-sm font-medium text-amber-900 underline"
          >
            {retryFlashcards.isPending ? "Retrying…" : "Retry flashcards"}
          </button>
        </div>
      )}

      {summaryFailed && (
        <div className="mt-3">
          <p className="text-sm text-amber-800">Summary generation failed.</p>
          <button
            type="button"
            onClick={() => retrySummary.mutate()}
            disabled={retrySummary.isPending}
            className="mt-2 text-sm font-medium text-amber-900 underline"
          >
            {retrySummary.isPending ? "Retrying…" : "Retry summary"}
          </button>
        </div>
      )}
    </div>
  );
}
