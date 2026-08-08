import {
  EmptyState,
  ErrorMessage,
  LoadingMessage,
} from "@/components/ui/StateMessages";
import { useSummary } from "@/features/courses/hooks";
import type { CourseStatus } from "@/types/api";

export function SummaryView({
  courseId,
  courseStatus,
}: {
  courseId: string;
  courseStatus: CourseStatus;
}) {
  const enabled =
    courseStatus === "ready" ||
    courseStatus === "partially_ready" ||
    courseStatus === "generating_artifacts";

  const { data, isLoading, isError, error, refetch } = useSummary(
    courseId,
    enabled,
  );

  if (!enabled) {
    return (
      <EmptyState
        title="Summary not available yet"
        description="Generate the course to create a summary."
      />
    );
  }

  if (isLoading) {
    return <LoadingMessage>Loading summary…</LoadingMessage>;
  }

  if (isError) {
    return <ErrorMessage error={error} onRetry={() => refetch()} />;
  }

  if (!data) {
    return (
      <EmptyState
        title="Summary not generated yet"
        description="Content will appear when artifact generation completes."
      />
    );
  }

  return (
    <div className="mx-auto max-w-prose space-y-12">
      <section>
        <h3 className="font-display text-subheading-sm font-semibold text-ink-black">
          Short summary
        </h3>
        <p className="body-copy mt-4">{data.short}</p>
      </section>
      <section>
        <h3 className="font-display text-subheading-sm font-semibold text-ink-black">
          Detailed summary
        </h3>
        <p className="body-copy mt-4">{data.detailed}</p>
      </section>
    </div>
  );
}
