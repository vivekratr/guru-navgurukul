import type { SupabaseClient } from "@supabase/supabase-js";

import {
  callRole,
  type CallRoleDependencies,
  validateVisionIngestSemantics,
  visionIngestOutputSchema,
} from "../lib/llm/index.js";
import { getRetryBackoffSeconds } from "./ingest/backoff.js";
import { classifyIngestFailure } from "./ingest/failure.js";
import { decideIdempotency } from "./ingest/idempotency.js";
import { parseIngestQueueMessage } from "./ingest/message.js";
import { INGEST_BATCH_SIZE } from "./ingest/constants.js";

export type QueueMessage = {
  msg_id: number;
  read_ct: number;
  message: unknown;
};

export type WorkerTickSummary = {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
};

export type SourceRecord = {
  id: string;
  course_id: string;
  type: "text" | "doc" | "image" | "video";
  title: string | null;
  storage_path: string | null;
  raw_text: string | null;
  duration_sec: number | null;
  status?: string;
  attempt_count?: number;
};

export type IngestWorkerDependencies = {
  callRoleDeps?: Partial<CallRoleDependencies>;
  callVisionIngest?: (
    supabase: SupabaseClient,
    source: SourceRecord,
    deps?: Partial<CallRoleDependencies>,
  ) => Promise<{
    data: { chunks: Array<{ heading?: string; text: string; position: number }> };
    model_used: string;
  }>;
};

async function defaultCallVisionIngest(
  supabase: SupabaseClient,
  source: SourceRecord,
  deps?: Partial<CallRoleDependencies>,
) {
  if (!source.raw_text?.trim()) {
    throw new Error("Text source is missing raw_text");
  }

  return callRole(
    {
      role: "vision_ingest",
      messages: [
        {
          role: "system",
          content:
            "Return JSON with chunks: [{ heading?, text, position }]. At least one non-empty chunk.",
        },
        {
          role: "user",
          content: source.raw_text,
        },
      ],
      outputSchema: visionIngestOutputSchema,
      validateOutput: validateVisionIngestSemantics,
    },
    deps,
  );
}

async function getVisibilityTimeoutSeconds(
  supabase: SupabaseClient,
): Promise<number> {
  const { data, error } = await supabase.rpc(
    "get_vision_ingest_visibility_timeout_seconds",
  );

  if (error || typeof data !== "number") {
    return 90;
  }

  return data;
}

async function readQueueMessages(
  supabase: SupabaseClient,
  vtSeconds: number,
): Promise<QueueMessage[]> {
  const { data, error } = await supabase.rpc("read_ingest_queue_messages", {
    p_vt_seconds: vtSeconds,
    p_batch_size: INGEST_BATCH_SIZE,
  });

  if (error) {
    throw error;
  }

  return (data ?? []) as QueueMessage[];
}

async function loadSource(
  supabase: SupabaseClient,
  sourceId: string,
): Promise<SourceRecord | null> {
  const { data, error } = await supabase
    .from("sources")
    .select(
      "id, course_id, type, title, storage_path, raw_text, duration_sec, status, attempt_count",
    )
    .eq("id", sourceId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as SourceRecord | null;
}

export async function processIngestMessage(
  supabase: SupabaseClient,
  queueMessage: QueueMessage,
  workerDeps: IngestWorkerDependencies = {},
): Promise<"succeeded" | "failed" | "skipped"> {
  const parsed = parseIngestQueueMessage(queueMessage.message);

  if (!parsed) {
    await supabase.rpc("archive_malformed_ingest_message", {
      p_msg_id: queueMessage.msg_id,
      p_payload: { message: queueMessage.message },
      p_error: "Malformed ingest queue payload",
    });
    return "failed";
  }

  const jobPayload = { source_id: parsed.source_id };
  const source = await loadSource(supabase, parsed.source_id);

  if (!source) {
    await supabase.rpc("skip_ingest_message", {
      p_source_id: parsed.source_id,
      p_course_id: null,
      p_msg_id: queueMessage.msg_id,
      p_reason: "source not found",
      p_job_payload: jobPayload,
    });
    return "skipped";
  }

  const idempotency = decideIdempotency({
    status: source.status ?? "pending",
  });

  if (idempotency.action === "skip") {
    await supabase.rpc("skip_ingest_message", {
      p_source_id: source.id,
      p_course_id: source.course_id,
      p_msg_id: queueMessage.msg_id,
      p_reason: idempotency.reason,
      p_job_payload: jobPayload,
    });
    return "skipped";
  }

  let activeSource = source;

  if (idempotency.action === "claim") {
    const { data: claim, error } = await supabase.rpc(
      "claim_source_for_processing",
      { p_source_id: source.id },
    );

    if (error) {
      throw error;
    }

    if (!claim?.claimed || !claim.source) {
      await supabase.rpc("skip_ingest_message", {
        p_source_id: source.id,
        p_course_id: source.course_id,
        p_msg_id: queueMessage.msg_id,
        p_reason: claim?.reason ?? "claim failed",
        p_job_payload: jobPayload,
      });
      return "skipped";
    }

    activeSource = claim.source as SourceRecord;
  }

  const callVision = workerDeps.callVisionIngest ?? defaultCallVisionIngest;

  try {
    const result = await callVision(supabase, activeSource, workerDeps.callRoleDeps);

    const { error } = await supabase.rpc("complete_source_ingestion", {
      p_source_id: activeSource.id,
      p_course_id: activeSource.course_id,
      p_chunks: result.data.chunks,
      p_msg_id: queueMessage.msg_id,
      p_model_used: result.model_used,
      p_job_payload: jobPayload,
    });

    if (error) {
      throw error;
    }

    return "succeeded";
  } catch (error) {
    const failure = classifyIngestFailure(error);
    const attemptCount = Number(activeSource.attempt_count ?? 1);

    await supabase.rpc("fail_source_ingestion", {
      p_source_id: activeSource.id,
      p_course_id: activeSource.course_id,
      p_msg_id: queueMessage.msg_id,
      p_error: failure.message,
      p_model_used: null,
      p_retryable: failure.retryable,
      p_job_payload: jobPayload,
      p_backoff_seconds: getRetryBackoffSeconds(attemptCount),
    });

    return "failed";
  }
}

export async function runIngestWorkerTick(
  supabase: SupabaseClient,
  workerDeps: IngestWorkerDependencies = {},
): Promise<WorkerTickSummary> {
  const vtSeconds = await getVisibilityTimeoutSeconds(supabase);
  const messages = await readQueueMessages(supabase, vtSeconds);
  const summary: WorkerTickSummary = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
  };

  for (const message of messages) {
    summary.processed += 1;

    try {
      const outcome = await processIngestMessage(
        supabase,
        message,
        workerDeps,
      );
      summary[outcome] += 1;
    } catch {
      summary.failed += 1;
    }
  }

  return summary;
}
