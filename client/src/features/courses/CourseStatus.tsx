import type { CourseStatus } from "@/types/api";
import { courseStatusLabel } from "@/lib/status-labels";

export function CourseStatusBadge({ status }: { status: CourseStatus }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm font-medium text-slate-500">Course status</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">
        {courseStatusLabel(status)}
      </p>
    </div>
  );
}
