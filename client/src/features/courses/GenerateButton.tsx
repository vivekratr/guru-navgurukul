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
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="font-medium text-slate-900">Generate course content</h3>
      <p className="mt-1 text-sm text-slate-600">
        Start ingestion and content generation for all pending sources.
      </p>

      <button
        type="button"
        onClick={() => generate.mutate()}
        disabled={!canGenerate || isProcessing || generate.isPending}
        className="mt-4 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {generate.isPending ? "Starting…" : "Generate"}
      </button>

      {!hasUsableSources(course.sources) && course.status === "draft" && (
        <p className="mt-2 text-sm text-slate-500">
          Add at least one source before generating.
        </p>
      )}

      {generate.isError && (
        <div className="mt-3">
          <ErrorMessage
            error={generate.error}
            onRetry={() => generate.mutate()}
          />
        </div>
      )}
    </div>
  );
}
