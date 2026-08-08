import type { SupabaseClient } from "@supabase/supabase-js";

import { throwMappedRpcError } from "../lib/rpc-errors.js";

export type GenerateCourseResult = {
  id: string;
  status: string;
  enqueued: number;
};

export type RetrySourceIngestionResult = {
  id: string;
  status: string;
};

export async function startCourseIngestion(
  supabase: SupabaseClient,
  courseId: string,
): Promise<GenerateCourseResult> {
  const { data, error } = await supabase.rpc("start_course_ingestion", {
    p_course_id: courseId,
  });

  if (error) {
    throwMappedRpcError(error);
  }

  return data as GenerateCourseResult;
}

export async function retrySourceIngestion(
  supabase: SupabaseClient,
  courseId: string,
  sourceId: string,
): Promise<RetrySourceIngestionResult> {
  const { data, error } = await supabase.rpc("retry_source_ingestion", {
    p_course_id: courseId,
    p_source_id: sourceId,
  });

  if (error) {
    throwMappedRpcError(error);
  }

  return data as RetrySourceIngestionResult;
}

export async function countIngestQueueMessages(
  supabase: SupabaseClient,
): Promise<number> {
  const { data, error } = await supabase.rpc("count_ingest_queue_messages");

  if (error) {
    throw error;
  }

  return Number(data);
}

export async function peekIngestQueueMessages(
  supabase: SupabaseClient,
): Promise<Array<{ msg_id: number; message: { source_id: string } }>> {
  const { data, error } = await supabase.rpc("peek_ingest_queue_messages");

  if (error) {
    throw error;
  }

  return (data ?? []) as Array<{ msg_id: number; message: { source_id: string } }>;
}

export async function purgeIngestQueueMessages(
  supabase: SupabaseClient,
): Promise<void> {
  const { error } = await supabase.rpc("purge_ingest_queue_messages");

  if (error) {
    throw error;
  }
}

export type RetryKnowledgeExtractionResult = {
  id: string;
  status: string;
  enqueued: boolean;
};

export async function retryKnowledgeExtraction(
  supabase: SupabaseClient,
  courseId: string,
): Promise<RetryKnowledgeExtractionResult> {
  const { data, error } = await supabase.rpc("retry_knowledge_extraction", {
    p_course_id: courseId,
  });

  if (error) {
    throwMappedRpcError(error);
  }

  return data as RetryKnowledgeExtractionResult;
}

export async function countExtractKnowledgeMessages(
  supabase: SupabaseClient,
): Promise<number> {
  const { data, error } = await supabase.rpc("count_extract_knowledge_messages");

  if (error) {
    throw error;
  }

  return Number(data);
}

export async function peekExtractKnowledgeMessages(
  supabase: SupabaseClient,
): Promise<Array<{ msg_id: number; message: { course_id: string } }>> {
  const { data, error } = await supabase.rpc("peek_extract_knowledge_messages");

  if (error) {
    throw error;
  }

  return (data ?? []) as Array<{
    msg_id: number;
    message: { course_id: string };
  }>;
}

export async function purgeExtractKnowledgeMessages(
  supabase: SupabaseClient,
): Promise<void> {
  const { error } = await supabase.rpc("purge_extract_knowledge_messages");

  if (error) {
    throw error;
  }
}

export async function countGenerateArtifactsMessages(
  supabase: SupabaseClient,
): Promise<number> {
  const { data, error } = await supabase.rpc("count_generate_artifacts_messages");

  if (error) {
    throw error;
  }

  return Number(data);
}

export async function peekGenerateArtifactsMessages(
  supabase: SupabaseClient,
): Promise<
  Array<{ msg_id: number; message: { course_id: string; artifact_type: string } }>
> {
  const { data, error } = await supabase.rpc("peek_generate_artifacts_messages");

  if (error) {
    throw error;
  }

  return (data ?? []) as Array<{
    msg_id: number;
    message: { course_id: string; artifact_type: string };
  }>;
}

export async function purgeGenerateArtifactsMessages(
  supabase: SupabaseClient,
): Promise<void> {
  const { error } = await supabase.rpc("purge_generate_artifacts_messages");

  if (error) {
    throw error;
  }
}

export type RetryArtifactGenerationResult = {
  id: string;
  artifact_type: string;
  status: string;
  enqueued: boolean;
};

export async function retryArtifactGeneration(
  supabase: SupabaseClient,
  courseId: string,
  artifactType: string,
): Promise<RetryArtifactGenerationResult> {
  const { data, error } = await supabase.rpc("retry_artifact_generation", {
    p_course_id: courseId,
    p_artifact_type: artifactType,
  });

  if (error) {
    throwMappedRpcError(error);
  }

  return data as RetryArtifactGenerationResult;
}

export async function enqueueGenerateArtifactsMessage(
  supabase: SupabaseClient,
  courseId: string,
  artifactType: string,
): Promise<void> {
  const { error } = await supabase.rpc("enqueue_generate_artifacts_message", {
    p_course_id: courseId,
    p_artifact_type: artifactType,
  });

  if (error) {
    throw error;
  }
}
