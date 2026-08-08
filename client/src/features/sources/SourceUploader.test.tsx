import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SourceUploader } from "@/features/sources/SourceUploader";

const registerMutateAsync = vi.fn();
const uploadToStorage = vi.fn();

vi.mock("@/features/sources/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/sources/hooks")>();
  return {
    ...actual,
    uploadFileToStorage: (...args: unknown[]) => uploadToStorage(...args),
    useRegisterFileSource: () => ({
      mutateAsync: registerMutateAsync,
      isPending: false,
    }),
  };
});

describe("SourceUploader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerMutateAsync.mockResolvedValue({ id: "source-1" });
  });

  function renderUploader() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    return render(
      <QueryClientProvider client={queryClient}>
        <SourceUploader courseId="course-1" />
      </QueryClientProvider>,
    );
  }

  it("retains the File object and retries upload without re-selection", async () => {
    const user = userEvent.setup();
    uploadToStorage
      .mockRejectedValueOnce(new Error("network failed"))
      .mockResolvedValueOnce({
        type: "doc",
        storage_path: "user/course/file.pdf",
        mime_type: "application/pdf",
        file_size_bytes: 100,
      });

    renderUploader();

    const file = new File(["pdf"], "notes.pdf", { type: "application/pdf" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText("notes.pdf")).toBeInTheDocument();
    });

    expect(uploadToStorage).toHaveBeenCalledTimes(1);
    expect(uploadToStorage).toHaveBeenCalledWith("course-1", file);

    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(uploadToStorage).toHaveBeenCalledTimes(2);
    });

    expect(uploadToStorage).toHaveBeenLastCalledWith("course-1", file);
    expect(registerMutateAsync).toHaveBeenCalledTimes(1);
  });

  it("retries registration without re-uploading when storage succeeded", async () => {
    const user = userEvent.setup();
    const payload = {
      type: "doc" as const,
      storage_path: "user/course/file.pdf",
      mime_type: "application/pdf",
      file_size_bytes: 100,
    };

    uploadToStorage.mockResolvedValue(payload);
    registerMutateAsync
      .mockRejectedValueOnce(new Error("api failed"))
      .mockResolvedValueOnce({ id: "source-1" });

    renderUploader();

    const file = new File(["pdf"], "notes.pdf", { type: "application/pdf" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText(/register the source without re-uploading/i))
        .toBeInTheDocument();
    });

    expect(uploadToStorage).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(registerMutateAsync).toHaveBeenCalledTimes(2);
    });

    expect(uploadToStorage).toHaveBeenCalledTimes(1);
    expect(registerMutateAsync).toHaveBeenLastCalledWith(payload);
  });
});
