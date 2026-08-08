import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PillTag } from "@/components/ui/PillTag";
import { useRetrySource } from "@/features/sources/hooks";
import type { CourseSource } from "@/types/api";
import {
  sourceStatusLabel,
  sourceTypeLabel,
} from "@/lib/status-labels";

export function SourceItem({
  courseId,
  source,
}: {
  courseId: string;
  source: CourseSource;
}) {
  const retry = useRetrySource(courseId);
  const isDone = source.status === "done";
  const isFailed =
    source.status === "failed" || source.status === "failed_permanent";

  return (
    <li>
      <Card className={isFailed ? "border-charcoal/35" : undefined}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium text-ink-black">
              {sourceTypeLabel(source.type)} source
            </p>
            <p className="mt-1 font-micro text-caption text-charcoal">
              {source.id.slice(0, 8)}…
            </p>
          </div>
          <PillTag accent={isDone}>
            {sourceStatusLabel(source.status)}
          </PillTag>
        </div>

        {source.last_error && (
          <p className="mt-3 text-body-sm text-charcoal">{source.last_error}</p>
        )}

        {source.status === "failed_permanent" && (
          <Button
            variant="text"
            className="mt-3 !p-0"
            onClick={() => retry.mutate(source.id)}
            disabled={retry.isPending}
          >
            {retry.isPending ? "Retrying…" : "Retry source"}
          </Button>
        )}
      </Card>
    </li>
  );
}
