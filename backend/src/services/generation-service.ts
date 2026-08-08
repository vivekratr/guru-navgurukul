import type { SupabaseClient } from "@supabase/supabase-js";

import * as queueRepository from "../repositories/queue-repository.js";

export async function refreshCourseContent(
  supabase: SupabaseClient,
  courseId: string,
) {
  const result = await queueRepository.refreshCourseContent(supabase, courseId);

  return {
    id: result.id,
    status: result.status,
  };
}

export async function generateCourse(
  supabase: SupabaseClient,
  courseId: string,
) {
  const result = await queueRepository.startCourseIngestion(supabase, courseId);

  return {
    id: result.id,
    status: result.status,
  };
}

export async function retryKnowledgeExtraction(
  supabase: SupabaseClient,
  courseId: string,
) {
  const result = await queueRepository.retryKnowledgeExtraction(
    supabase,
    courseId,
  );

  return {
    id: result.id,
    status: result.status,
  };
}

export async function retryArtifact(
  supabase: SupabaseClient,
  courseId: string,
  artifactType: string,
) {
  const result = await queueRepository.retryArtifactGeneration(
    supabase,
    courseId,
    artifactType,
  );

  return {
    id: result.id,
    artifact_type: result.artifact_type,
    status: result.status,
  };
}
