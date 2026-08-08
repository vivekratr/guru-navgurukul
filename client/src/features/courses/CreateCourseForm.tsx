import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { ErrorMessage } from "@/components/ui/StateMessages";
import { useCreateCourse } from "@/features/courses/hooks";
import { createCourseSchema } from "@/schemas/forms";

export function CreateCourseForm() {
  const [title, setTitle] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const navigate = useNavigate();
  const createCourse = useCreateCourse();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setValidationError(null);

    const parsed = createCourseSchema.safeParse({ title });

    if (!parsed.success) {
      setValidationError(parsed.error.errors[0]?.message ?? "Invalid title");
      return;
    }

    try {
      const course = await createCourse.mutateAsync(parsed.data.title);
      navigate(`/courses/${course.id}`);
    } catch {
      // mutation error rendered below
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h2 className="font-semibold text-slate-900">Create course</h2>
      <label className="mt-3 block">
        <span className="text-sm text-slate-700">Course title</span>
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="React Hooks Fundamentals"
        />
      </label>

      {validationError && (
        <p className="mt-2 text-sm text-red-600">{validationError}</p>
      )}

      {createCourse.isError && (
        <div className="mt-2">
          <ErrorMessage
            error={createCourse.error}
            onRetry={() => createCourse.reset()}
          />
        </div>
      )}

      <button
        type="submit"
        disabled={createCourse.isPending}
        className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {createCourse.isPending ? "Creating…" : "Create course"}
      </button>
    </form>
  );
}
