import type { SupabaseClient } from "@supabase/supabase-js";

import { AppError } from "./errors.js";
import {
  allowedMimeTypesForSourceType,
  FILE_SIZE_LIMIT_BYTES,
  isStoragePathOwnedBy,
  SOURCE_UPLOADS_BUCKET,
} from "./source-file-policy.js";
import { MAX_VIDEO_DURATION_SEC, type SourceType } from "./source-state.js";

export async function verifyStorageObjectExists(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<void> {
  const parts = storagePath.split("/");
  const fileName = parts.pop();

  if (!fileName) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Invalid storage_path",
      false,
    );
  }

  const folder = parts.join("/");
  const { data, error } = await supabase.storage
    .from(SOURCE_UPLOADS_BUCKET)
    .list(folder, { limit: 100, search: fileName });

  if (error) {
    throw error;
  }

  const match = data?.find((entry) => entry.name === fileName);

  if (!match) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "storage_path does not reference an uploaded file",
      false,
    );
  }
}

export function assertStoragePathOwnership(
  storagePath: string,
  userId: string,
  courseId: string,
): void {
  if (!isStoragePathOwnedBy(storagePath, userId, courseId)) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "storage_path does not match course ownership",
      false,
    );
  }
}

export function validateMimeType(
  type: Exclude<SourceType, "text">,
  mimeType: string,
): void {
  const allowed = allowedMimeTypesForSourceType(type);

  if (!allowed.includes(mimeType)) {
    throw new AppError(
      400,
      "INVALID_FILE_TYPE",
      "Unsupported file type",
      false,
    );
  }
}

export function validateFileSize(
  type: Exclude<SourceType, "text">,
  fileSizeBytes: number,
): void {
  if (fileSizeBytes > FILE_SIZE_LIMIT_BYTES[type]) {
    throw new AppError(400, "SOURCE_TOO_LARGE", "File is too large", false);
  }
}

export function validateVideoDuration(durationSec: number): void {
  if (durationSec > MAX_VIDEO_DURATION_SEC) {
    throw new AppError(
      400,
      "VIDEO_TOO_LONG",
      "Video exceeds the 180 second limit",
      false,
    );
  }
}

export async function removeStorageObject(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<void> {
  const { error } = await supabase.storage
    .from(SOURCE_UPLOADS_BUCKET)
    .remove([storagePath]);

  if (error) {
    throw error;
  }
}
