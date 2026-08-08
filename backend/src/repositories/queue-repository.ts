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
