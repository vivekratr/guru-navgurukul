import type { SourceType } from "@/types/api";

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

export function buildStoragePath(
  userId: string,
  courseId: string,
  uploadId: string,
  filename: string,
): string {
  return `${userId}/${courseId}/${uploadId}/${filename}`;
}

export function detectSourceTypeFromMime(mimeType: string): SourceType | null {
  if (DOC_MIME_TYPES.includes(mimeType as (typeof DOC_MIME_TYPES)[number])) {
    return "doc";
  }

  if (
    IMAGE_MIME_TYPES.includes(mimeType as (typeof IMAGE_MIME_TYPES)[number])
  ) {
    return "image";
  }

  if (
    VIDEO_MIME_TYPES.includes(mimeType as (typeof VIDEO_MIME_TYPES)[number])
  ) {
    return "video";
  }

  return null;
}

export async function getVideoDurationSec(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";

    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };

    video.onerror = () => {
      window.URL.revokeObjectURL(video.src);
      reject(new Error("Could not read video duration"));
    };

    video.src = URL.createObjectURL(file);
  });
}
