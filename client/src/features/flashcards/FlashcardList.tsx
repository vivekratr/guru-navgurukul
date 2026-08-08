import { useState } from "react";

import {
  EmptyState,
  ErrorMessage,
  LoadingMessage,
} from "@/components/ui/StateMessages";
import { useFlashcards } from "@/features/courses/hooks";
import type { CourseStatus } from "@/types/api";

export function FlashcardCard({
  front,
  back,
}: {
  front: string;
  back: string;
}) {
  const [showAnswer, setShowAnswer] = useState(false);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-lg font-medium text-slate-900">{front}</p>
      {showAnswer ? (
        <p className="mt-4 border-t border-slate-100 pt-4 text-slate-700">
          {back}
        </p>
      ) : (
        <button
          type="button"
          onClick={() => setShowAnswer(true)}
          className="mt-4 text-sm font-medium text-slate-900 underline"
        >
          Show answer
        </button>
      )}
    </div>
  );
}

export function FlashcardList({
  courseId,
  courseStatus,
}: {
  courseId: string;
  courseStatus: CourseStatus;
}) {
  const enabled =
    courseStatus === "ready" ||
    courseStatus === "partially_ready" ||
    courseStatus === "generating_artifacts";

  const { data, isLoading, isError, error, refetch } = useFlashcards(
    courseId,
    enabled,
  );
  const [index, setIndex] = useState(0);

  if (!enabled) {
    return (
      <EmptyState
        title="Flashcards not available yet"
        description="Generate the course to create flashcards."
      />
    );
  }

  if (isLoading) {
    return <LoadingMessage>Loading flashcards…</LoadingMessage>;
  }

  if (isError) {
    return <ErrorMessage error={error} onRetry={() => refetch()} />;
  }

  const flashcards = data?.flashcards ?? [];

  if (flashcards.length === 0) {
    return (
      <EmptyState
        title="No flashcards yet"
        description="Flashcards will appear when generation completes."
      />
    );
  }

  const current = flashcards[index];

  return (
    <div className="space-y-4">
      <FlashcardCard front={current.front} back={current.back} />

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>
          Card {index + 1} of {flashcards.length}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
            disabled={index === 0}
            className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() =>
              setIndex((value) => Math.min(flashcards.length - 1, value + 1))
            }
            disabled={index >= flashcards.length - 1}
            className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
