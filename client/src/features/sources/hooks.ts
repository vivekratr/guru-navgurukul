import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { supabase } from "@/lib/supabase";
import {
  buildStoragePath,
  detectSourceTypeFromMime,
  getVideoDurationSec,
  SOURCE_UPLOADS_BUCKET,
} from "@/lib/storage";
import type { SourceType } from "@/types/api";

export function useCreateTextSource(courseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (rawText: string) => api.createTextSource(courseId, rawText),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.course(courseId) });
    },
  });
}

export function useUploadFileSource(courseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        throw new Error("Not authenticated");
      }

      const sourceType = detectSourceTypeFromMime(file.type);

      if (!sourceType || sourceType === "text") {
        throw new Error("Unsupported file type");
      }

      const uploadId = crypto.randomUUID();
      const storagePath = buildStoragePath(
        session.user.id,
        courseId,
        uploadId,
        file.name,
      );

      const { error: uploadError } = await supabase.storage
        .from(SOURCE_UPLOADS_BUCKET)
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      const payload: {
        type: Exclude<SourceType, "text">;
        storage_path: string;
        mime_type: string;
        file_size_bytes: number;
        duration_sec?: number;
      } = {
        type: sourceType,
        storage_path: storagePath,
        mime_type: file.type,
        file_size_bytes: file.size,
      };

      if (sourceType === "video") {
        payload.duration_sec = await getVideoDurationSec(file);
      }

      return api.createFileSource(courseId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.course(courseId) });
    },
  });
}

export function useRetrySource(courseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sourceId: string) => api.retrySource(courseId, sourceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.course(courseId) });
    },
  });
}
