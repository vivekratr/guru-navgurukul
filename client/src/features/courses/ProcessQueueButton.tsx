import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/StateMessages";
import { usePipelineTick } from "@/features/courses/hooks";
import { isCourseProcessing } from "@/lib/course-processing";
import type { CourseStatus } from "@/types/api";

export function ProcessQueueButton({
  courseId,
  courseStatus,
}: {
  courseId: string;
  courseStatus: CourseStatus;
}) {
  const tick = usePipelineTick(courseId);

  if (!isCourseProcessing(courseStatus)) {
    return null;
  }

  return (
    <div className="mt-6 border-t border-charcoal/10 pt-4">
      <p className="text-body-sm text-charcoal">
        Processing runs on the server queue. Click below to process one worker
        tick if progress is stuck.
      </p>
      <Button
        variant="ghost"
        className="mt-3"
        onClick={() => tick.mutate()}
        disabled={tick.isPending}
      >
        {tick.isPending ? "Processing…" : "Process queue"}
      </Button>

      {tick.isSuccess && (
        <p className="mt-3 text-body-sm text-ink-black">
          Ingest: {tick.data.ingest.processed} processed · Knowledge:{" "}
          {tick.data.knowledge.processed} processed · Artifacts:{" "}
          {tick.data.artifacts.processed} processed
        </p>
      )}

      {tick.isError && (
        <div className="mt-3">
          <ErrorMessage error={tick.error} onRetry={() => tick.mutate()} />
        </div>
      )}
    </div>
  );
}
