import { useState } from "react";

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
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <h3 className="font-medium text-slate-900">Add text source</h3>
      <textarea
        value={rawText}
        onChange={(event) => setRawText(event.target.value)}
        rows={5}
        className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        placeholder="Paste or type learning content…"
      />

      {validationError && (
        <p className="mt-2 text-sm text-red-600">{validationError}</p>
      )}

      {createText.isError && (
        <div className="mt-2">
          <ErrorMessage
            error={createText.error}
            onRetry={() => createText.reset()}
          />
        </div>
      )}

      <button
        type="submit"
        disabled={createText.isPending}
        className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {createText.isPending ? "Adding…" : "Add text source"}
      </button>
    </form>
  );
}
