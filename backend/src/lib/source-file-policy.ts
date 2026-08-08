import type { SourceType } from "./source-state.js";

export const SOURCE_UPLOADS_BUCKET = "source-uploads";

const DOC_MIME_TYPES = ["application/pdf"] as const;
const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
const VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

// API contract requires SOURCE_TOO_LARGE but does not document per-type byte caps.
export const FILE_SIZE_LIMIT_BYTES: Record<Exclude<SourceType, "text">, number> =
  {
    doc: 25 * 1024 * 1024,
    image: 10 * 1024 * 1024,
    video: 200 * 1024 * 1024,
  };

export function allowedMimeTypesForSourceType(
  type: Exclude<SourceType, "text">,
): readonly string[] {
  switch (type) {
    case "doc":
      return DOC_MIME_TYPES;
    case "image":
      return IMAGE_MIME_TYPES;
    case "video":
      return VIDEO_MIME_TYPES;
    default: {
      const exhaustive: never = type;
      return exhaustive;
    }
  }
}

export function buildStoragePath(
  userId: string,
  courseId: string,
  uploadId: string,
  filename: string,
): string {
  return `${userId}/${courseId}/${uploadId}/${filename}`;
}

export function isStoragePathOwnedBy(
  storagePath: string,
  userId: string,
  courseId: string,
): boolean {
  const prefix = `${userId}/${courseId}/`;

  if (!storagePath.startsWith(prefix)) {
    return false;
  }

  const remainder = storagePath.slice(prefix.length);

  if (!remainder || remainder.includes("..")) {
    return false;
  }

  const segments = remainder.split("/");
  return segments.length >= 2 && segments.every((segment) => segment.length > 0);
}
