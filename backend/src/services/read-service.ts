import type { SupabaseClient } from "@supabase/supabase-js";

import { toCsvRow } from "../lib/csv.js";
import { AppError } from "../lib/errors.js";
import * as artifactReadRepository from "../repositories/artifact-read-repository.js";
import * as courseRepository from "../repositories/course-repository.js";
import {
  conceptGraphResponseSchema,
  flashcardsResponseSchema,
  modulesResponseSchema,
} from "../schemas/artifact-read.js";

const POST_KNOWLEDGE_COURSE_STATUSES = new Set([
  "generating_artifacts",
  "ready",
  "partially_ready",
]);

type ArtifactType = "flashcards" | "summary";

function courseNotFound(): never {
  throw new AppError(404, "COURSE_NOT_FOUND", "Course not found", false);
}

function artifactUnavailable(
  artifactType: ArtifactType,
  status: string | undefined,
): never {
  if (status === "pending" || status === "processing") {
    throw new AppError(
      400,
      "INVALID_STATE",
      `${artifactType} is not ready yet`,
      true,
    );
  }

  if (status === "failed_permanent") {
    throw new AppError(
      400,
      "INVALID_STATE",
      `${artifactType} generation failed`,
      false,
    );
  }

  throw new AppError(
    400,
    "INVALID_STATE",
    `${artifactType} is not available`,
    false,
  );
}

function conceptGraphUnavailable(): never {
  throw new AppError(
    400,
    "INVALID_STATE",
    "Concept graph is not available yet",
    true,
  );
}

async function assertCourseAccessible(
  supabase: SupabaseClient,
  courseId: string,
) {
  const course = await courseRepository.findCourseById(supabase, courseId);

  if (!course) {
    courseNotFound();
  }

  return course;
}

async function getArtifactStatus(
  supabase: SupabaseClient,
  courseId: string,
  artifactType: ArtifactType,
): Promise<string | undefined> {
  const rows = await courseRepository.listArtifactStatuses(supabase, courseId);
  return rows.find((row) => row.artifact_type === artifactType)?.status;
}

async function assertArtifactDone(
  supabase: SupabaseClient,
  courseId: string,
  artifactType: ArtifactType,
): Promise<void> {
  const status = await getArtifactStatus(supabase, courseId, artifactType);

  if (status !== "done") {
    artifactUnavailable(artifactType, status);
  }
}

export async function getCourseModules(
  supabase: SupabaseClient,
  courseId: string,
) {
  await assertCourseAccessible(supabase, courseId);
  await assertArtifactDone(supabase, courseId, "summary");

  const rows = await artifactReadRepository.listCourseModules(
    supabase,
    courseId,
  );

  if (rows.length === 0) {
    throw new AppError(
      500,
      "INTERNAL_ERROR",
      "Module data is incomplete",
      true,
    );
  }

  const response = { modules: rows };
  return modulesResponseSchema.parse(response);
}

/** @deprecated Use getCourseModules */
export const getCourseSummary = getCourseModules;

export async function getCourseFlashcards(
  supabase: SupabaseClient,
  courseId: string,
) {
  await assertCourseAccessible(supabase, courseId);
  await assertArtifactDone(supabase, courseId, "flashcards");

  const rows = await artifactReadRepository.listFlashcards(supabase, courseId);
  const response = {
    flashcards: rows.map((row) => ({
      id: row.id,
      concept_id: row.concept_id,
      front: row.front,
      back: row.back,
    })),
  };

  return flashcardsResponseSchema.parse(response);
}

export async function getCourseConceptGraph(
  supabase: SupabaseClient,
  courseId: string,
) {
  const course = await assertCourseAccessible(supabase, courseId);

  if (!POST_KNOWLEDGE_COURSE_STATUSES.has(course.status)) {
    conceptGraphUnavailable();
  }

  const [concepts, relationships] = await Promise.all([
    artifactReadRepository.listConcepts(supabase, courseId),
    artifactReadRepository.listConceptRelationships(supabase, courseId),
  ]);

  const nodeIds = new Set(concepts.map((concept) => concept.id));
  const nodes = concepts.map((concept) => ({
    id: concept.id,
    name: concept.name,
    difficulty: concept.difficulty as
      | "beginner"
      | "intermediate"
      | "advanced"
      | null,
  }));

  const edges = relationships
    .filter(
      (relationship) =>
        nodeIds.has(relationship.source_concept_id) &&
        nodeIds.has(relationship.target_concept_id),
    )
    .map((relationship) => ({
      from: relationship.source_concept_id,
      to: relationship.target_concept_id,
      type: relationship.type as "contains" | "prerequisite" | "related",
    }));

  const response = { nodes, edges };
  return conceptGraphResponseSchema.parse(response);
}

export function sanitizeExportFilename(title: string): string {
  const sanitized = title
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);

  return sanitized || "flashcards";
}

export async function exportCourseFlashcardsJson(
  supabase: SupabaseClient,
  courseId: string,
) {
  const course = await assertCourseAccessible(supabase, courseId);
  const payload = await getCourseFlashcards(supabase, courseId);

  return {
    filename: `${sanitizeExportFilename(course.title)}-flashcards.json`,
    body: JSON.stringify(payload),
  };
}

export async function exportCourseFlashcardsCsv(
  supabase: SupabaseClient,
  courseId: string,
) {
  const course = await assertCourseAccessible(supabase, courseId);
  await assertArtifactDone(supabase, courseId, "flashcards");

  const [flashcards, concepts] = await Promise.all([
    artifactReadRepository.listFlashcards(supabase, courseId),
    artifactReadRepository.listConcepts(supabase, courseId),
  ]);

  const conceptNames = new Map(
    concepts.map((concept) => [concept.id, concept.name]),
  );

  const lines = ["front,back,concept"];
  for (const card of flashcards) {
    const conceptName = card.concept_id
      ? (conceptNames.get(card.concept_id) ?? "")
      : "";
    lines.push(toCsvRow([card.front, card.back, conceptName]));
  }

  return {
    filename: `${sanitizeExportFilename(course.title)}-flashcards.csv`,
    body: lines.join("\n"),
  };
}
