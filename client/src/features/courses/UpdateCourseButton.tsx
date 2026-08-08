import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/StateMessages";
import { useRefreshCourse } from "@/features/courses/hooks";
import type { CourseDetail } from "@/types/api";
import {
  canRefreshCourse,
  hasPendingSources,
} from "@/lib/status-labels";

export function UpdateCourseButton({ course }: { course: CourseDetail }) {
  const refresh = useRefreshCourse(course.id);
  const canUpdate =
    canRefreshCourse(course.status) && hasPendingSources(course.sources);
  const pendingCount = course.sources.filter(
    (source) => source.status === "pending",
  ).length;

  if (!canRefreshCourse(course.status)) {
    return null;
  }

  return (
    <Card>
      <h3 className="font-display text-subheading-sm font-semibold text-ink-black">
        Update course
      </h3>
      <p className="body-copy-muted mt-2">
        Add new sources above, then update when you are ready. This re-processes
        all sources and refreshes modules, flashcards, and the concept graph.
      </p>

      <Button
        className="mt-6"
        onClick={() => refresh.mutate()}
        disabled={!canUpdate || refresh.isPending}
      >
        {refresh.isPending ? "Updating…" : "Update course"}
      </Button>

      {pendingCount > 0 && (
        <p className="mt-3 text-body-sm text-charcoal">
          {pendingCount} new source{pendingCount === 1 ? "" : "s"} waiting to be
          processed.
        </p>
      )}

      {pendingCount === 0 && (
        <p className="mt-3 text-body-sm text-charcoal">
          Add a new source to enable an update.
        </p>
      )}

      {refresh.isError && (
        <div className="mt-4">
          <ErrorMessage
            error={refresh.error}
            onRetry={() => refresh.mutate()}
          />
        </div>
      )}
    </Card>
  );
}
