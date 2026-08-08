import { Card } from "@/components/ui/Card";
import { PillTag } from "@/components/ui/PillTag";
import { ProcessQueueButton } from "@/features/courses/ProcessQueueButton";
import type { CourseDetail } from "@/types/api";
import {
  artifactStatusLabel,
  courseStatusLabel,
  sourceStatusLabel,
  sourceTypeLabel,
} from "@/lib/status-labels";

function sourceProgressLabel(status: string): string {
  switch (status) {
    case "done":
      return "Done";
    case "processing":
      return "Processing";
    case "failed":
      return "Failed";
    case "failed_permanent":
      return "Failed permanently";
    case "cancelled":
      return "Cancelled";
    default:
      return "Pending";
  }
}

export function GenerationProgress({ course }: { course: CourseDetail }) {
  const doneCount = course.sources.filter((s) => s.status === "done").length;
  const totalCount = course.sources.length;

  return (
    <Card>
      <p className="text-caption font-medium uppercase tracking-wide text-charcoal">
        Generation progress
      </p>
      <p className="mt-2 font-display text-subheading-sm font-semibold text-ink-black">
        {courseStatusLabel(course.status)}
      </p>

      {course.last_error && (
        <p className="mt-3 text-body-sm text-charcoal">{course.last_error}</p>
      )}

      {course.status === "ingesting" && totalCount > 0 && (
        <div className="mt-6 space-y-4">
          <p className="text-body-sm text-charcoal">
            {doneCount} of {totalCount} sources processed
          </p>
          <ul className="space-y-2">
            {course.sources.map((source) => (
              <li
                key={source.id}
                className="flex flex-wrap items-center gap-2 text-body-sm"
              >
                <span className="font-medium text-ink-black">
                  {sourceTypeLabel(source.type)}
                </span>
                <PillTag
                  accent={source.status === "done"}
                >
                  {sourceProgressLabel(source.status)}
                </PillTag>
                <span className="sr-only">
                  {sourceStatusLabel(source.status)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {course.status === "generating_artifacts" && (
        <div className="mt-6 space-y-3">
          {(["flashcards", "summary"] as const).map((artifact) => {
            const status = course.artifact_status[artifact] ?? "pending";
            const label = artifact === "summary" ? "modules" : artifact;

            return (
              <div
                key={artifact}
                className="flex items-center justify-between gap-4 text-body-sm"
              >
                <span className="font-medium capitalize text-ink-black">
                  {label}
                </span>
                <PillTag accent={status === "done"}>
                  {artifactStatusLabel(status)}
                </PillTag>
              </div>
            );
          })}
        </div>
      )}

      <ProcessQueueButton courseId={course.id} courseStatus={course.status} />
    </Card>
  );
}
