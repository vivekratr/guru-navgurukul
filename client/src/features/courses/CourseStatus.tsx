import { Card } from "@/components/ui/Card";
import type { CourseStatus } from "@/types/api";
import { courseStatusLabel } from "@/lib/status-labels";

export function CourseStatusBadge({ status }: { status: CourseStatus }) {
  return (
    <Card>
      <p className="text-caption font-medium uppercase tracking-wide text-charcoal">
        Course status
      </p>
      <p className="mt-2 font-display text-subheading-sm font-semibold text-ink-black">
        {courseStatusLabel(status)}
      </p>
    </Card>
  );
}
