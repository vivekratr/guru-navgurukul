import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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
    <Card className="min-h-[200px]">
      <p className="font-display text-subheading-sm font-semibold text-ink-black">
        {front}
      </p>
      {showAnswer ? (
        <p className="body-copy mt-6 border-t border-charcoal/15 pt-6">{back}</p>
      ) : (
        <Button
          variant="text"
          className="mt-6 !p-0"
          onClick={() => setShowAnswer(true)}
        >
          Show answer
        </Button>
      )}
    </Card>
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
    <div className="mx-auto max-w-2xl space-y-6">
      <FlashcardCard front={current.front} back={current.back} />

      <div className="flex flex-wrap items-center justify-between gap-4 text-body-sm text-charcoal">
        <span>
          Card {index + 1} of {flashcards.length}
        </span>
        <div className="flex gap-3">
          <Button
            variant="ghost"
            className="!px-5 !py-2 !text-body-sm"
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
            disabled={index === 0}
          >
            Previous
          </Button>
          <Button
            variant="ghost"
            className="!px-5 !py-2 !text-body-sm"
            onClick={() =>
              setIndex((value) => Math.min(flashcards.length - 1, value + 1))
            }
            disabled={index >= flashcards.length - 1}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
