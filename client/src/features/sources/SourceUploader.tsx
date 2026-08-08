import { useRef, useState } from "react";

import { ErrorMessage } from "@/components/ui/StateMessages";
import {
  type FileSourcePayload,
  uploadFileToStorage,
  useRegisterFileSource,
} from "@/features/sources/hooks";

type UploadUiState =
  | "idle"
  | "uploading"
  | "uploaded"
  | "registering"
  | "done"
  | "failed";

type PendingUpload = {
  id: string;
  file: File;
  state: UploadUiState;
  error: unknown;
  storagePayload: FileSourcePayload | null;
  failedStep: "upload" | "register" | null;
};

function createPendingUpload(file: File): PendingUpload {
  return {
    id: crypto.randomUUID(),
    file,
    state: "uploading",
    error: null,
    storagePayload: null,
    failedStep: null,
  };
}

export function SourceUploader({ courseId }: { courseId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const registerSource = useRegisterFileSource(courseId);

  function updateUpload(id: string, patch: Partial<PendingUpload>) {
    setUploads((current) =>
      current.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    );
  }

  function removeUpload(id: string) {
    setUploads((current) => current.filter((item) => item.id !== id));
  }

  async function registerStoredFile(
    uploadId: string,
    payload: FileSourcePayload,
  ) {
    updateUpload(uploadId, { state: "registering", error: null, failedStep: null });

    try {
      await registerSource.mutateAsync(payload);
      updateUpload(uploadId, { state: "done", failedStep: null });
    } catch (registerError) {
      updateUpload(uploadId, {
        state: "failed",
        error: registerError,
        failedStep: "register",
      });
    }
  }

  async function runStorageUpload(upload: PendingUpload) {
    updateUpload(upload.id, {
      state: "uploading",
      error: null,
      failedStep: null,
    });

    try {
      const payload = await uploadFileToStorage(courseId, upload.file);
      updateUpload(upload.id, {
        state: "uploaded",
        storagePayload: payload,
      });
      await registerStoredFile(upload.id, payload);
    } catch (uploadError) {
      updateUpload(upload.id, {
        state: "failed",
        error: uploadError,
        failedStep: "upload",
      });
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = event.target.files;

    if (!selectedFiles || selectedFiles.length === 0) {
      return;
    }

    const newUploads = Array.from(selectedFiles).map((file) =>
      createPendingUpload(file),
    );

    setUploads((current) => [...current, ...newUploads]);

    for (const upload of newUploads) {
      await runStorageUpload(upload);
    }

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  async function retryUpload(upload: PendingUpload) {
    if (upload.failedStep === "register" && upload.storagePayload) {
      await registerStoredFile(upload.id, upload.storagePayload);
      return;
    }

    await runStorageUpload(upload);
  }

  const isBusy = uploads.some(
    (upload) => upload.state === "uploading" || upload.state === "registering",
  );

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
        multiple
        onChange={handleFileChange}
        disabled={isBusy}
        className="mt-3 block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-700"
      />

      {uploads.length > 0 && (
        <ul className="mt-4 space-y-3">
          {uploads.map((upload) => (
            <li
              key={upload.id}
              className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-slate-900">{upload.file.name}</p>
                <button
                  type="button"
                  onClick={() => removeUpload(upload.id)}
                  className="text-xs text-slate-500 hover:text-slate-800"
                  disabled={
                    upload.state === "uploading" ||
                    upload.state === "registering"
                  }
                >
                  Remove
                </button>
              </div>

              {upload.state === "uploading" && (
                <p className="mt-1 text-slate-600">Uploading…</p>
              )}

              {upload.state === "registering" && (
                <p className="mt-1 text-slate-600">Registering source…</p>
              )}

              {upload.state === "done" && (
                <p className="mt-1 text-emerald-700">Upload successful.</p>
              )}

              {upload.state === "failed" && (
                <div className="mt-2">
                  <ErrorMessage
                    error={upload.error}
                    onRetry={() => retryUpload(upload)}
                  />
                  {upload.failedStep === "register" && (
                    <p className="mt-1 text-xs text-slate-600">
                      File is already in storage — retry will register the
                      source without re-uploading.
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
