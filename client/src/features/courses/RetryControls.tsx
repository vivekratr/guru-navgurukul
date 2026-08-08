import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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
    <Card className="border-charcoal/30 bg-sage-mint/15">
      <h3 className="font-display text-subheading-sm font-semibold text-ink-black">
        Retry options
      </h3>

      {course.status === "knowledge_extraction_failed" && (
        <div className="mt-4">
          <p className="text-body-sm text-charcoal">
            Knowledge extraction failed. Retry without re-uploading sources.
          </p>
          <Button
            variant="text"
            className="mt-2 !p-0"
            onClick={() => retryKnowledge.mutate()}
            disabled={retryKnowledge.isPending}
          >
            {retryKnowledge.isPending
              ? "Retrying…"
              : "Retry knowledge extraction"}
          </Button>
        </div>
      )}

      {flashcardsFailed && (
        <div className="mt-4">
          <p className="text-body-sm text-charcoal">
            Flashcard generation failed.
          </p>
          <Button
            variant="text"
            className="mt-2 !p-0"
            onClick={() => retryFlashcards.mutate()}
            disabled={retryFlashcards.isPending}
          >
            {retryFlashcards.isPending ? "Retrying…" : "Retry flashcards"}
          </Button>
        </div>
      )}

      {summaryFailed && (
        <div className="mt-4">
          <p className="text-body-sm text-charcoal">Summary generation failed.</p>
          <Button
            variant="text"
            className="mt-2 !p-0"
            onClick={() => retrySummary.mutate()}
            disabled={retrySummary.isPending}
          >
            {retrySummary.isPending ? "Retrying…" : "Retry modules"}
          </Button>
        </div>
      )}
    </Card>
  );
}
