import {
  EmptyState,
  ErrorMessage,
  LoadingMessage,
} from "@/components/ui/StateMessages";
import { CourseCard } from "@/features/courses/CourseCard";
import { CreateCourseForm } from "@/features/courses/CreateCourseForm";
import { useCourses } from "@/features/courses/hooks";

export function CoursesPage() {
  const { data, isLoading, isError, error, refetch } = useCourses();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Your courses</h1>
        <p className="mt-1 text-sm text-slate-600">
          Create a course, add sources, and generate learning content.
        </p>
      </div>

      <CreateCourseForm />

      <section>
        <h2 className="mb-4 text-lg font-medium text-slate-900">All courses</h2>

        {isLoading && <LoadingMessage>Loading courses…</LoadingMessage>}

        {isError && (
          <ErrorMessage error={error} onRetry={() => refetch()} />
        )}

        {!isLoading && !isError && data?.courses.length === 0 && (
          <EmptyState
            title="You don't have any courses yet."
            description="Create your first course."
          />
        )}

        {!isLoading && !isError && data && data.courses.length > 0 && (
          <ul className="space-y-3">
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
