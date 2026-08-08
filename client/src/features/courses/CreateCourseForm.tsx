import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FieldInput, FieldLabel } from "@/components/ui/Field";
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
    <Card className="mx-auto max-w-2xl">
      <h2 className="font-display text-subheading font-semibold text-ink-black">
        Create course
      </h2>
      <p className="body-copy-muted mt-2">
        Give your course a clear title — you can add sources next.
      </p>

      <form onSubmit={handleSubmit} className="mt-6">
        <FieldLabel htmlFor="course-title">Course title</FieldLabel>
        <FieldInput
          id="course-title"
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="React Hooks Fundamentals"
        />

        {validationError && (
          <p className="mt-2 text-body-sm text-charcoal">{validationError}</p>
        )}

        {createCourse.isError && (
          <div className="mt-4">
            <ErrorMessage
              error={createCourse.error}
              onRetry={() => createCourse.reset()}
            />
          </div>
        )}

        <Button
          type="submit"
          disabled={createCourse.isPending}
          className="mt-6"
        >
          {createCourse.isPending ? "Creating…" : "Create course"}
        </Button>
      </form>
    </Card>
  );
}
