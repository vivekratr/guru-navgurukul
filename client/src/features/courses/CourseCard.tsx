import { Link } from "react-router-dom";

import { PillTag } from "@/components/ui/PillTag";
import type { CourseListItem } from "@/types/api";
import { courseStatusLabel } from "@/lib/status-labels";

export function CourseCard({ course }: { course: CourseListItem }) {
  return (
    <Link
      to={`/courses/${course.id}`}
      className="group block rounded-card border border-charcoal/20 bg-bone-card p-card transition-colors duration-200 hover:border-charcoal/50"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-subheading-sm font-semibold text-ink-black group-hover:underline">
            {course.title}
          </h2>
          <div className="mt-3">
            <PillTag accent={course.status === "ready"}>
              {courseStatusLabel(course.status)}
            </PillTag>
          </div>
        </div>
        <time className="font-micro text-caption text-charcoal">
          {new Date(course.updated_at).toLocaleDateString()}
        </time>
      </div>
    </Link>
  );
}
