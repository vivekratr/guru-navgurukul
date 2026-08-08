import { useRetrySource } from "@/features/sources/hooks";
import type { CourseSource } from "@/types/api";
import {
  sourceStatusLabel,
  sourceTypeLabel,
} from "@/lib/status-labels";

function statusClassName(status: string): string {
  switch (status) {
    case "failed":
      return "text-amber-700";
    case "failed_permanent":
      return "text-red-700 font-medium";
    case "done":
      return "text-emerald-700";
    case "processing":
      return "text-blue-700";
    default:
      return "text-slate-600";
  }
}

export function SourceItem({
  courseId,
  source,
}: {
  courseId: string;
  source: CourseSource;
}) {
  const retry = useRetrySource(courseId);

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-slate-900">
            {sourceTypeLabel(source.type)} source
          </p>
          <p className="text-xs text-slate-500">{source.id.slice(0, 8)}…</p>
        </div>
        <p className={`text-sm ${statusClassName(source.status)}`}>
          {sourceStatusLabel(source.status)}
        </p>
      </div>

      {source.last_error && (
        <p className="mt-2 text-sm text-red-600">{source.last_error}</p>
      )}

      {source.status === "failed_permanent" && (
        <button
          type="button"
          onClick={() => retry.mutate(source.id)}
          disabled={retry.isPending}
          className="mt-2 text-sm font-medium text-slate-900 underline"
        >
          {retry.isPending ? "Retrying…" : "Retry source"}
        </button>
      )}
    </li>
  );
}
