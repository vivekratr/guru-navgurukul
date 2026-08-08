import { Link } from "react-router-dom";

import type { CourseListItem } from "@/types/api";
import { courseStatusLabel } from "@/lib/status-labels";

export function CourseCard({ course }: { course: CourseListItem }) {
  return (
    <Link
      to={`/courses/${course.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-400"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-slate-900">{course.title}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {courseStatusLabel(course.status)}
          </p>
        </div>
        <time className="text-xs text-slate-500">
          {new Date(course.updated_at).toLocaleString()}
        </time>
      </div>
    </Link>
  );
}
