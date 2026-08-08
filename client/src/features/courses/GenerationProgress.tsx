import type { CourseDetail } from "@/types/api";
import {
  artifactStatusLabel,
  courseStatusLabel,
  sourceStatusLabel,
  sourceTypeLabel,
} from "@/lib/status-labels";

function sourceProgressIcon(status: string): string {
  switch (status) {
    case "done":
      return "✓";
    case "processing":
      return "⟳";
    case "failed":
      return "⚠";
    case "failed_permanent":
      return "✗";
    case "cancelled":
      return "—";
    default:
      return "○";
  }
}

export function GenerationProgress({ course }: { course: CourseDetail }) {
  const doneCount = course.sources.filter((s) => s.status === "done").length;
  const totalCount = course.sources.length;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm font-medium text-slate-500">Generation progress</p>
      <p className="mt-1 font-semibold text-slate-900">
        {courseStatusLabel(course.status)}
      </p>

      {course.last_error && (
        <p className="mt-2 text-sm text-red-600">{course.last_error}</p>
      )}

      {course.status === "ingesting" && totalCount > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-sm text-slate-600">
            {doneCount} of {totalCount} sources processed
          </p>
          <ul className="space-y-1 text-sm">
            {course.sources.map((source) => (
              <li key={source.id} className="flex items-center gap-2">
                <span aria-hidden="true">
                  {sourceProgressIcon(source.status)}
                </span>
                <span className="text-slate-800">
                  {sourceTypeLabel(source.type)}
                </span>
                <span className="text-slate-500">
                  {sourceStatusLabel(source.status)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {course.status === "generating_artifacts" && (
        <div className="mt-4 space-y-2 text-sm">
          {(["flashcards", "summary"] as const).map((artifact) => {
            const status = course.artifact_status[artifact] ?? "pending";

            return (
              <div key={artifact} className="flex items-center justify-between">
                <span className="font-medium capitalize text-slate-800">
                  {artifact}
                </span>
                <span className="text-slate-600">
                  {artifactStatusLabel(status)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
