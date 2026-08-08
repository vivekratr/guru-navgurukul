import { useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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
    <Card>
      <h3 className="font-display text-subheading-sm font-semibold text-ink-black">
        Upload file source
      </h3>
      <p className="body-copy-muted mt-2">
        PDF documents, images, or short videos (max 180s).
      </p>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,image/*,video/*"
        multiple
        onChange={handleFileChange}
        disabled={isBusy}
        className="mt-6 block w-full cursor-pointer text-body-sm text-charcoal file:mr-4 file:cursor-pointer file:rounded-button file:border file:border-ink-black file:bg-transparent file:px-5 file:py-2 file:text-body-sm file:font-medium file:text-ink-black"
      />

      {uploads.length > 0 && (
        <ul className="mt-6 space-y-3">
          {uploads.map((upload) => (
            <li
              key={upload.id}
              className="rounded-card border border-charcoal/15 bg-pure-white p-4 text-body-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-ink-black">{upload.file.name}</p>
                <Button
                  variant="text"
                  className="!p-0 !text-caption"
                  onClick={() => removeUpload(upload.id)}
                  disabled={
                    upload.state === "uploading" ||
                    upload.state === "registering"
                  }
                >
                  Remove
                </Button>
              </div>

              {upload.state === "uploading" && (
                <p className="mt-2 text-charcoal">Uploading…</p>
              )}

              {upload.state === "registering" && (
                <p className="mt-2 text-charcoal">Registering source…</p>
              )}

              {upload.state === "done" && (
                <p className="mt-2 text-ink-black">Upload successful.</p>
              )}

              {upload.state === "failed" && (
                <div className="mt-3">
                  <ErrorMessage
                    error={upload.error}
                    onRetry={() => retryUpload(upload)}
                  />
                  {upload.failedStep === "register" && (
                    <p className="mt-2 text-caption text-charcoal">
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
    </Card>
  );
}
