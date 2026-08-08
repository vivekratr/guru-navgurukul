import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FieldLabel, FieldTextarea } from "@/components/ui/Field";
import { ErrorMessage } from "@/components/ui/StateMessages";
import { useCreateTextSource } from "@/features/sources/hooks";
import { textSourceSchema } from "@/schemas/forms";

export function TextSourceForm({ courseId }: { courseId: string }) {
  const [rawText, setRawText] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const createText = useCreateTextSource(courseId);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setValidationError(null);

    const parsed = textSourceSchema.safeParse({ raw_text: rawText });

    if (!parsed.success) {
      setValidationError(parsed.error.errors[0]?.message ?? "Invalid text");
      return;
    }

    try {
      await createText.mutateAsync(parsed.data.raw_text);
      setRawText("");
    } catch {
      // shown below
    }
  }

  return (
    <Card>
      <h3 className="font-display text-subheading-sm font-semibold text-ink-black">
        Add text source
      </h3>
      <p className="body-copy-muted mt-2">
        Paste or type learning content directly.
      </p>

      <form onSubmit={handleSubmit} className="mt-6">
        <FieldLabel htmlFor="text-source">Content</FieldLabel>
        <FieldTextarea
          id="text-source"
          value={rawText}
          onChange={(event) => setRawText(event.target.value)}
          rows={5}
          placeholder="Paste or type learning content…"
        />

        {validationError && (
          <p className="mt-2 text-body-sm text-charcoal">{validationError}</p>
        )}

        {createText.isError && (
          <div className="mt-4">
            <ErrorMessage
              error={createText.error}
              onRetry={() => createText.reset()}
            />
          </div>
        )}

        <Button
          type="submit"
          disabled={createText.isPending}
          className="mt-4"
        >
          {createText.isPending ? "Adding…" : "Add text source"}
        </Button>
      </form>
    </Card>
  );
}
