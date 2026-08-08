import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { LeafDecoration } from "@/components/ui/LeafDecoration";
import {
  LiveStatusHint,
  NetworkStatusBanner,
  StaleDataBanner,
} from "@/components/ui/ResilienceIndicators";
import { ErrorMessage, LoadingMessage } from "@/components/ui/StateMessages";
import { ConceptGraph } from "@/features/concept-graph/ConceptGraph";
import { CourseStatusBadge } from "@/features/courses/CourseStatus";
import { GenerateButton } from "@/features/courses/GenerateButton";
import { GenerationProgress } from "@/features/courses/GenerationProgress";
import { useCourse } from "@/features/courses/hooks";
import { RetryControls } from "@/features/courses/RetryControls";
import { FlashcardList } from "@/features/flashcards/FlashcardList";
import { SourceList } from "@/features/sources/SourceList";
import { SourceUploader } from "@/features/sources/SourceUploader";
import { TextSourceForm } from "@/features/sources/TextSourceForm";
import { SummaryView } from "@/features/summary/SummaryView";
import { isCourseProcessing } from "@/lib/course-processing";
import { isWorkspaceContentUnlocked } from "@/lib/status-labels";

type WorkspaceTab = "sources" | "summary" | "flashcards" | "concept-graph";

const TABS: { id: WorkspaceTab; label: string }[] = [
  { id: "sources", label: "Sources" },
  { id: "summary", label: "Summary" },
  { id: "flashcards", label: "Flashcards" },
  { id: "concept-graph", label: "Concept Graph" },
];

export function CourseWorkspacePage() {
  const { courseId = "" } = useParams();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("sources");
  const {
    data: course,
    isLoading,
    isError,
    error,
    refetch,
    realtimeStatus,
    isOnline,
    isShowingStaleData,
    isLive,
  } = useCourse(courseId);

  if (isLoading && !course) {
    return <LoadingMessage>Loading course…</LoadingMessage>;
  }

  if (isError && !course) {
    return <ErrorMessage error={error} onRetry={() => refetch()} />;
  }

  if (!course) {
    return <ErrorMessage error={new Error("Course not found")} />;
  }

  const contentUnlocked = isWorkspaceContentUnlocked(course.status);
  const courseProcessing = isCourseProcessing(course.status);

  return (
    <div className="space-y-12">
      <header>
        <Link
          to="/courses"
          className="text-body-sm font-medium text-charcoal underline decoration-charcoal/30 underline-offset-4 transition-colors hover:text-ink-black hover:decoration-ink-black"
        >
          ← Back to courses
        </Link>
        <div className="relative mt-8">
          <LeafDecoration className="absolute -right-4 top-0 hidden h-16 w-24 opacity-60 md:block" />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <h1 className="section-heading max-w-3xl">{course.title}</h1>
            <LiveStatusHint
              isLive={isLive}
              isShowingStaleData={isShowingStaleData}
            />
          </div>
        </div>
      </header>

      <NetworkStatusBanner
        isOnline={isOnline}
        realtimeStatus={realtimeStatus}
        courseProcessing={courseProcessing}
      />

      {isShowingStaleData && <StaleDataBanner />}

      <div className="grid gap-element md:grid-cols-2">
        <CourseStatusBadge status={course.status} />
        <GenerationProgress course={course} />
      </div>

      <RetryControls course={course} />

      <nav
        className="flex flex-wrap gap-element border-b border-charcoal/15 pb-4"
        aria-label="Course workspace"
      >
        {TABS.map((tab) => {
          const artifactStatus =
            tab.id === "flashcards"
              ? course.artifact_status.flashcards
              : tab.id === "summary"
                ? course.artifact_status.summary
                : null;

          const failedArtifact =
            artifactStatus === "failed_permanent" ||
            artifactStatus === "failed";

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={
                activeTab === tab.id ? "tab-pill-active" : "tab-pill"
              }
            >
              {tab.label}
              {failedArtifact && contentUnlocked && (
                <span className="ml-1.5" aria-label="needs attention">
                  ·
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {activeTab === "sources" && (
        <div className="space-y-8">
          {course.status === "draft" && (
            <>
              <TextSourceForm courseId={course.id} />
              <SourceUploader courseId={course.id} />
              <GenerateButton course={course} />
            </>
          )}
          <SourceList courseId={course.id} sources={course.sources} />
        </div>
      )}

      {activeTab === "summary" && (
        <SummaryView courseId={course.id} courseStatus={course.status} />
      )}

      {activeTab === "flashcards" && (
        <FlashcardList courseId={course.id} courseStatus={course.status} />
      )}

      {activeTab === "concept-graph" && (
        <ConceptGraph courseId={course.id} courseStatus={course.status} />
      )}
    </div>
  );
}
