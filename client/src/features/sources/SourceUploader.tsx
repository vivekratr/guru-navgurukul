import { useRef, useState } from "react";

import { ErrorMessage } from "@/components/ui/StateMessages";
import { useUploadFileSource } from "@/features/sources/hooks";

type UploadState = "idle" | "uploading" | "success" | "error";

export function SourceUploader({ courseId }: { courseId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [error, setError] = useState<unknown>(null);
  const upload = useUploadFileSource(courseId);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setUploadState("uploading");
    setError(null);

    try {
      await upload.mutateAsync(file);
      setUploadState("success");
    } catch (uploadError) {
      setUploadState("error");
      setError(uploadError);
    } finally {
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="font-medium text-slate-900">Upload file source</h3>
      <p className="mt-1 text-sm text-slate-600">
        PDF documents, images, or short videos (max 180s).
      </p>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,image/*,video/*"
        onChange={handleFileChange}
        disabled={uploadState === "uploading"}
        className="mt-3 block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-700"
      />

      {uploadState === "uploading" && (
        <p className="mt-2 text-sm text-slate-600">Uploading…</p>
      )}

      {uploadState === "success" && (
        <p className="mt-2 text-sm text-emerald-700">Upload successful.</p>
      )}

      {uploadState === "error" && (
        <div className="mt-2">
          <ErrorMessage
            error={error}
            onRetry={() => {
              setUploadState("idle");
              setError(null);
              inputRef.current?.click();
            }}
          />
        </div>
      )}
    </div>
  );
}
