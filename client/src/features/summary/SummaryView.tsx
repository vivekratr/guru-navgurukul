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
    <div className="space-y-6">
      <section>
        <h3 className="text-lg font-semibold text-slate-900">Short summary</h3>
        <p className="mt-2 leading-relaxed text-slate-700">{data.short}</p>
      </section>
      <section>
        <h3 className="text-lg font-semibold text-slate-900">Detailed summary</h3>
        <p className="mt-2 leading-relaxed text-slate-700">{data.detailed}</p>
      </section>
    </div>
  );
}
