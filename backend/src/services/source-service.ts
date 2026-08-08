import type { SupabaseClient } from "@supabase/supabase-js";

import { AppError } from "../lib/errors.js";
import {
  assertStoragePathOwnership,
  removeStorageObject,
  validateFileSize,
  validateMimeType,
  validateVideoDuration,
  verifyStorageObjectExists,
} from "../lib/storage.js";
import {
  API_CANCELLABLE_SOURCE_STATUSES,
} from "../lib/source-state.js";
import * as courseRepository from "../repositories/course-repository.js";
import * as queueRepository from "../repositories/queue-repository.js";
import * as sourceRepository from "../repositories/source-repository.js";
import type { CreateSourceBody } from "../schemas/source.js";

function courseNotFound(): never {
  throw new AppError(404, "COURSE_NOT_FOUND", "Course not found", false);
}

function sourceNotFound(): never {
  throw new AppError(404, "SOURCE_NOT_FOUND", "Source not found", false);
}

function invalidSourceState(message: string): never {
  throw new AppError(400, "INVALID_STATE", message, false);
}

async function assertCourseAccessible(
  supabase: SupabaseClient,
  courseId: string,
): Promise<void> {
  const course = await courseRepository.findCourseById(supabase, courseId);

  if (!course) {
    courseNotFound();
  }
}

async function validateFileSource(
  supabase: SupabaseClient,
  userId: string,
  courseId: string,
  body: Extract<CreateSourceBody, { type: "doc" | "image" | "video" }>,
): Promise<void> {
  assertStoragePathOwnership(body.storage_path, userId, courseId);
  await verifyStorageObjectExists(supabase, body.storage_path);
  validateMimeType(body.type, body.mime_type);
  validateFileSize(body.type, body.file_size_bytes);

  if (body.type === "video") {
    validateVideoDuration(body.duration_sec);
  }
}

export async function createSource(
  supabase: SupabaseClient,
  userId: string,
  courseId: string,
  body: CreateSourceBody,
) {
  await assertCourseAccessible(supabase, courseId);

  if (body.type !== "text") {
    await validateFileSource(supabase, userId, courseId, body);
  }

  return sourceRepository.insertSource(supabase, { courseId, body });
}

export async function cancelSource(
  supabase: SupabaseClient,
  courseId: string,
  sourceId: string,
) {
  await assertCourseAccessible(supabase, courseId);

  const source = await sourceRepository.findSourceInCourse(
    supabase,
    courseId,
    sourceId,
  );

  if (!source) {
    sourceNotFound();
  }

  if (source.status === "cancelled") {
    return { id: source.id, status: source.status };
  }

  if (source.status === "done") {
    invalidSourceState("Source cannot be cancelled after processing completed");
  }

  if (
    !API_CANCELLABLE_SOURCE_STATUSES.includes(
      source.status as (typeof API_CANCELLABLE_SOURCE_STATUSES)[number],
    )
  ) {
    invalidSourceState("Source cannot be cancelled in its current state");
  }

  const updated = await sourceRepository.updateSourceStatus(
    supabase,
    source.id,
    "cancelled",
  );

  if (source.storage_path) {
    try {
      await removeStorageObject(supabase, source.storage_path);
    } catch {
      // Storage cleanup failure must not roll back the cancelled state.
    }
  }

  return updated;
}

export async function retrySource(
  supabase: SupabaseClient,
  courseId: string,
  sourceId: string,
) {
  await assertCourseAccessible(supabase, courseId);

  const source = await sourceRepository.findSourceInCourse(
    supabase,
    courseId,
    sourceId,
  );

  if (!source) {
    sourceNotFound();
  }

  if (source.status !== "failed_permanent") {
    invalidSourceState("Source is not in a failed state");
  }

  return queueRepository.retrySourceIngestion(supabase, courseId, sourceId);
}
