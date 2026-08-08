import type { SupabaseClient } from "npm:@supabase/supabase-js@2.47.10";

import { getRetryBackoffSeconds } from "../_shared/ingest/backoff.ts";
import { buildVisionIngestMessages, type SourceRecord } from "../_shared/ingest/content.ts";
import { classifyIngestFailure } from "../_shared/ingest/failure.ts";
import { decideIdempotency } from "../_shared/ingest/idempotency.ts";
import { parseIngestQueueMessage } from "../_shared/ingest/message.ts";
import {
  callRole,
  type CallRoleDependencies,
  validateVisionIngestSemantics,
  visionIngestOutputSchema,
} from "../_shared/llm/index.ts";
import { INGEST_BATCH_SIZE } from "../_shared/ingest/constants.ts";

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

type ClaimResult = {
  claimed: boolean;
  reason?: string;
  source?: SourceRecord & { status: string; attempt_count: number };
};

export type IngestWorkerDependencies = {
  callRole?: CallRoleDependencies;
  callVisionIngest?: (
    supabase: SupabaseClient,
    apiKey: string,
    source: SourceRecord,
    deps?: Partial<CallRoleDependencies>,
  ) => Promise<{ data: { chunks: Array<{ heading?: string; text: string; position: number }> }; model_used: string }>;
};

async function defaultCallVisionIngest(
  supabase: SupabaseClient,
  apiKey: string,
  source: SourceRecord,
  deps?: Partial<CallRoleDependencies>,
) {
  const messages = await buildVisionIngestMessages(supabase, source);
  return callRole(
    supabase,
    apiKey,
    {
      role: "vision_ingest",
      messages,
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

async function claimSource(
  supabase: SupabaseClient,
  sourceId: string,
): Promise<ClaimResult> {
  const { data, error } = await supabase.rpc("claim_source_for_processing", {
    p_source_id: sourceId,
  });

  if (error) {
    throw error;
  }

  return data as ClaimResult;
}

async function completeIngestion(
  supabase: SupabaseClient,
  params: {
    sourceId: string;
    courseId: string;
    chunks: Array<{ heading?: string; text: string; position: number }>;
    msgId: number;
    modelUsed: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.rpc("complete_source_ingestion", {
    p_source_id: params.sourceId,
    p_course_id: params.courseId,
    p_chunks: params.chunks,
    p_msg_id: params.msgId,
    p_model_used: params.modelUsed,
    p_job_payload: params.payload,
  });

  if (error) {
    throw error;
  }
}

async function failIngestion(
  supabase: SupabaseClient,
  params: {
    sourceId: string;
    courseId: string;
    msgId: number;
    errorMessage: string;
    modelUsed: string | null;
    retryable: boolean;
    backoffSeconds: number;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.rpc("fail_source_ingestion", {
    p_source_id: params.sourceId,
    p_course_id: params.courseId,
    p_msg_id: params.msgId,
    p_error: params.errorMessage,
    p_model_used: params.modelUsed,
    p_retryable: params.retryable,
    p_job_payload: params.payload,
    p_backoff_seconds: params.backoffSeconds,
  });

  if (error) {
    throw error;
  }
}

async function skipMessage(
  supabase: SupabaseClient,
  params: {
    sourceId: string;
    courseId: string | null;
    msgId: number;
    reason: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.rpc("skip_ingest_message", {
    p_source_id: params.sourceId,
    p_course_id: params.courseId,
    p_msg_id: params.msgId,
    p_reason: params.reason,
    p_job_payload: params.payload,
  });

  if (error) {
    throw error;
  }
}

export async function processIngestMessage(
  supabase: SupabaseClient,
  apiKey: string,
  queueMessage: QueueMessage,
  workerDeps: IngestWorkerDependencies = {},
): Promise<"succeeded" | "failed" | "skipped"> {
  const payload = { source_id: undefined as string | undefined };
  const parsed = parseIngestQueueMessage(queueMessage.message);

  if (!parsed) {
    await supabase.rpc("archive_malformed_ingest_message", {
      p_msg_id: queueMessage.msg_id,
      p_payload: { message: queueMessage.message },
      p_error: "Malformed ingest queue payload",
    });
    return "failed";
  }

  payload.source_id = parsed.source_id;
  const jobPayload = { source_id: parsed.source_id };

  const source = await loadSource(supabase, parsed.source_id);

  if (!source) {
    await skipMessage(supabase, {
      sourceId: parsed.source_id,
      courseId: null,
      msgId: queueMessage.msg_id,
      reason: "source not found",
      payload: jobPayload,
    });
    return "skipped";
  }

  const idempotency = decideIdempotency({
    status: source.status ?? "pending",
  });

  if (idempotency.action === "skip") {
    await skipMessage(supabase, {
      sourceId: source.id,
      courseId: source.course_id,
      msgId: queueMessage.msg_id,
      reason: idempotency.reason,
      payload: jobPayload,
    });
    return "skipped";
  }

  let activeSource = source;

  if (idempotency.action === "claim") {
    const claim = await claimSource(supabase, source.id);

    if (!claim.claimed || !claim.source) {
      await skipMessage(supabase, {
        sourceId: source.id,
        courseId: source.course_id,
        msgId: queueMessage.msg_id,
        reason: claim.reason ?? "claim failed",
        payload: jobPayload,
      });
      return "skipped";
    }

    activeSource = claim.source as SourceRecord & {
      status: string;
      attempt_count: number;
    };
  }

  const callVision =
    workerDeps.callVisionIngest ?? defaultCallVisionIngest;

  try {
    const result = await callVision(
      supabase,
      apiKey,
      activeSource,
      workerDeps.callRole,
    );

    await completeIngestion(supabase, {
      sourceId: activeSource.id,
      courseId: activeSource.course_id,
      chunks: result.data.chunks,
      msgId: queueMessage.msg_id,
      modelUsed: result.model_used,
      payload: jobPayload,
    });

    return "succeeded";
  } catch (error) {
    const failure = classifyIngestFailure(error);
    const attemptCount =
      "attempt_count" in activeSource
        ? Number(activeSource.attempt_count)
        : 1;

    await failIngestion(supabase, {
      sourceId: activeSource.id,
      courseId: activeSource.course_id,
      msgId: queueMessage.msg_id,
      errorMessage: failure.message,
      modelUsed: null,
      retryable: failure.retryable,
      backoffSeconds: getRetryBackoffSeconds(attemptCount),
      payload: jobPayload,
    });

    return "failed";
  }
}

export async function runIngestWorkerTick(
  supabase: SupabaseClient,
  apiKey: string,
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
        apiKey,
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
