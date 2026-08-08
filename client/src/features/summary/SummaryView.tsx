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
        title="Learning modules not available yet"
        description="Generate the course to create modules."
      />
    );
  }

  if (isLoading) {
    return <LoadingMessage>Loading modules…</LoadingMessage>;
  }

  if (isError) {
    return <ErrorMessage error={error} onRetry={() => refetch()} />;
  }

  if (!data || data.modules.length === 0) {
    return (
      <EmptyState
        title="Modules not generated yet"
        description="Content will appear when artifact generation completes."
      />
    );
  }

  return (
    <div className="mx-auto max-w-prose space-y-12">
      {data.modules.map((module) => (
        <section key={module.position}>
          <h3 className="font-display text-subheading-sm font-semibold text-ink-black">
            Module {module.position}: {module.title}
          </h3>
          <div className="body-copy mt-4 space-y-4">
            {module.paragraphs.map((paragraph, index) => (
              <p key={`${module.position}-${index}`}>{paragraph}</p>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
