import { EmptyState } from "@/components/ui/StateMessages";
import { SourceItem } from "@/features/sources/SourceItem";
import type { CourseSource } from "@/types/api";

export function SourceList({
  courseId,
  sources,
}: {
  courseId: string;
  sources: CourseSource[];
}) {
  if (sources.length === 0) {
    return (
      <EmptyState
        title="Add a source to start building this course."
        description="Upload a document, image, or video — or paste text."
      />
    );
  }

  return (
    <ul className="space-y-3">
      {sources.map((source) => (
        <SourceItem key={source.id} courseId={courseId} source={source} />
      ))}
    </ul>
  );
}
