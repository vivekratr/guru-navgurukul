import { useState } from "react";
import { Link, useParams } from "react-router-dom";

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
  const { data: course, isLoading, isError, error, refetch } = useCourse(
    courseId,
  );

  if (isLoading) {
    return <LoadingMessage>Loading course…</LoadingMessage>;
  }

  if (isError) {
    return <ErrorMessage error={error} onRetry={() => refetch()} />;
  }

  if (!course) {
    return <ErrorMessage error={new Error("Course not found")} />;
  }

  const contentUnlocked = isWorkspaceContentUnlocked(course.status);

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/courses"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back to courses
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          {course.title}
        </h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <CourseStatusBadge status={course.status} />
        <GenerationProgress course={course} />
      </div>

      <RetryControls course={course} />

      <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
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
              className={`rounded-lg px-3 py-2 text-sm font-medium ${
                activeTab === tab.id
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              {tab.label}
              {failedArtifact && contentUnlocked && (
                <span className="ml-1 text-amber-400">!</span>
              )}
            </button>
          );
        })}
      </nav>

      {activeTab === "sources" && (
        <div className="space-y-6">
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
