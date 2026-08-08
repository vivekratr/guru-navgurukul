import {
  EmptyState,
  ErrorMessage,
  LoadingMessage,
} from "@/components/ui/StateMessages";
import { LeafDecoration } from "@/components/ui/LeafDecoration";
import { PillTag } from "@/components/ui/PillTag";
import { CourseCard } from "@/features/courses/CourseCard";
import { CreateCourseForm } from "@/features/courses/CreateCourseForm";
import { useCourses } from "@/features/courses/hooks";

const FEATURES = [
  {
    title: "Upload any source",
    description: "PDFs, images, video, or pasted text — all in one course.",
  },
  {
    title: "Automatic extraction",
    description: "Ingestion and knowledge extraction run in the background.",
  },
  {
    title: "Ready to study",
    description: "Summaries, flashcards, and concept maps when generation completes.",
  },
] as const;

export function CoursesPage() {
  const { data, isLoading, isError, error, refetch } = useCourses();
  const courseCount = data?.courses.length ?? 0;
  const readyCount =
    data?.courses.filter((course) => course.status === "ready").length ?? 0;

  return (
    <div className="space-y-section">
      <header className="text-center">
        <h1 className="display-heading">Your courses</h1>
        <p className="body-copy-muted mx-auto mt-6">
          Create a course, add sources, and generate summaries, flashcards, and
          concept maps.
        </p>
        {!isLoading && data && (
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <PillTag accent={courseCount > 0}>
              {courseCount} {courseCount === 1 ? "course" : "courses"}
            </PillTag>
            {readyCount > 0 && (
              <PillTag accent>{readyCount} ready to study</PillTag>
            )}
          </div>
        )}
      </header>

      <div className="relative">
        <LeafDecoration className="absolute -left-20 top-1/2 hidden h-24 w-32 -translate-y-1/2 opacity-70 xl:block" />
        <LeafDecoration className="absolute -right-16 top-8 hidden h-20 w-28 rotate-45 opacity-50 xl:block" />
        <CreateCourseForm />
      </div>

      <section aria-label="How it works">
        <div className="grid gap-10 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="text-center">
              <h3 className="font-display text-subheading-sm font-semibold text-ink-black">
                {feature.title}
              </h3>
              <p className="body-copy-muted mx-auto mt-3">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="section-heading mb-8 text-center">All courses</h2>

        {isLoading && <LoadingMessage>Loading courses…</LoadingMessage>}

        {isError && <ErrorMessage error={error} onRetry={() => refetch()} />}

        {!isLoading && !isError && data?.courses.length === 0 && (
          <EmptyState
            title="You don't have any courses yet."
            description="Create your first course above."
          />
        )}

        {!isLoading && !isError && data && data.courses.length > 0 && (
          <ul className="grid gap-element md:grid-cols-2">
            {data.courses.map((course) => (
              <li key={course.id}>
                <CourseCard course={course} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
