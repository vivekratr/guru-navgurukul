import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/StateMessages";
import { useGenerateCourse } from "@/features/courses/hooks";
import type { CourseDetail } from "@/types/api";
import { hasUsableSources } from "@/lib/status-labels";

export function GenerateButton({ course }: { course: CourseDetail }) {
  const generate = useGenerateCourse(course.id);
  const canGenerate =
    course.status === "draft" && hasUsableSources(course.sources);
  const isProcessing = course.status !== "draft";

  return (
    <Card>
      <h3 className="font-display text-subheading-sm font-semibold text-ink-black">
        Generate course content
      </h3>
      <p className="body-copy-muted mt-2">
        Start ingestion and content generation for all pending sources.
      </p>

      <Button
        className="mt-6"
        onClick={() => generate.mutate()}
        disabled={!canGenerate || isProcessing || generate.isPending}
      >
        {generate.isPending ? "Starting…" : "Generate"}
      </Button>

      {!hasUsableSources(course.sources) && course.status === "draft" && (
        <p className="mt-3 text-body-sm text-charcoal">
          Add at least one source before generating.
        </p>
      )}

      {generate.isError && (
        <div className="mt-4">
          <ErrorMessage
            error={generate.error}
            onRetry={() => generate.mutate()}
          />
        </div>
      )}
    </Card>
  );
}
