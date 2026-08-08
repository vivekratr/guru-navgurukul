import type { SupabaseClient } from "@supabase/supabase-js";

import {
  callRole,
  type CallRoleDependencies,
  knowledgeExtractionOutputSchema,
  validateKnowledgeExtractionSemantics,
} from "../lib/llm/index.js";
import { getRetryBackoffSeconds } from "./ingest/backoff.js";
import { KNOWLEDGE_BATCH_SIZE } from "./knowledge/constants.js";
import { classifyKnowledgeFailure } from "./knowledge/failure.js";
import { decideKnowledgeIdempotency } from "./knowledge/idempotency.js";
import { parseKnowledgeQueueMessage } from "./knowledge/message.js";
import {
  buildKnowledgeExtractionPrompt,
  type SourceChunkInput,
} from "./knowledge/prompt.js";

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

export type CourseRecord = {
  id: string;
  title: string;
  status?: string;
};

export type SourceRecord = {
  id: string;
  title: string | null;
  created_at: string;
};

export type ChunkRecord = {
  source_id: string;
  heading: string | null;
  text: string;
  position: number;
};

export type KnowledgeWorkerDependencies = {
  callRoleDeps?: Partial<CallRoleDependencies>;
  callKnowledgeExtraction?: (
    courseTitle: string,
    chunks: SourceChunkInput[],
    deps?: Partial<CallRoleDependencies>,
  ) => Promise<{
    data: {
      concepts: Array<{
        id: string;
        name: string;
        description: string;
        difficulty: string;
      }>;
      relationships: Array<{
        from: string;
        to: string;
        type: string;
      }>;
    };
    model_used: string;
  }>;
};

async function defaultCallKnowledgeExtraction(
  courseTitle: string,
  chunks: SourceChunkInput[],
  deps?: Partial<CallRoleDependencies>,
) {
  const prompt = buildKnowledgeExtractionPrompt(courseTitle, chunks);

  return callRole(
    {
      role: "knowledge_extraction",
      messages: [
        {
          role: "system",
          content:
            "You extract structured learning concepts and relationships as JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      outputSchema: knowledgeExtractionOutputSchema,
      validateOutput: validateKnowledgeExtractionSemantics,
    },
    deps,
  );
}

async function getVisibilityTimeoutSeconds(
  supabase: SupabaseClient,
): Promise<number> {
  const { data, error } = await supabase.rpc(
    "get_knowledge_extraction_visibility_timeout_seconds",
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
  const { data, error } = await supabase.rpc(
    "read_extract_knowledge_queue_messages",
    {
      p_vt_seconds: vtSeconds,
      p_batch_size: KNOWLEDGE_BATCH_SIZE,
    },
  );

  if (error) {
    throw error;
  }

  return (data ?? []) as QueueMessage[];
}

async function loadCourse(
  supabase: SupabaseClient,
  courseId: string,
): Promise<CourseRecord | null> {
  const { data, error } = await supabase
    .from("courses")
    .select("id, title, status")
    .eq("id", courseId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as CourseRecord | null;
}

async function loadDoneSources(
  supabase: SupabaseClient,
  courseId: string,
): Promise<SourceRecord[]> {
  const { data, error } = await supabase
    .from("sources")
    .select("id, title, created_at")
    .eq("course_id", courseId)
    .eq("status", "done")
    .order("created_at");

  if (error) {
    throw error;
  }

  return (data ?? []) as SourceRecord[];
}

async function loadChunksForSources(
  supabase: SupabaseClient,
  courseId: string,
  sourceIds: string[],
): Promise<ChunkRecord[]> {
  if (sourceIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("source_chunks")
    .select("source_id, heading, text, position")
    .eq("course_id", courseId)
    .in("source_id", sourceIds)
    .order("position");

  if (error) {
    throw error;
  }

  return (data ?? []) as ChunkRecord[];
}

function buildChunkInputs(
  sources: SourceRecord[],
  chunks: ChunkRecord[],
): SourceChunkInput[] {
  const sourceIndexById = new Map(
    sources.map((source, index) => [source.id, index + 1]),
  );
  const titleById = new Map(sources.map((source) => [source.id, source.title]));

  const orderedChunks = [...chunks].sort((left, right) => {
    const leftIndex = sourceIndexById.get(left.source_id) ?? 0;
    const rightIndex = sourceIndexById.get(right.source_id) ?? 0;

    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    return left.position - right.position;
  });

  return orderedChunks.map((chunk) => ({
    sourceIndex: sourceIndexById.get(chunk.source_id) ?? 0,
    sourceTitle: titleById.get(chunk.source_id) ?? null,
    heading: chunk.heading,
    text: chunk.text,
    position: chunk.position,
  }));
}

export async function processKnowledgeMessage(
  supabase: SupabaseClient,
  queueMessage: QueueMessage,
  workerDeps: KnowledgeWorkerDependencies = {},
): Promise<"succeeded" | "failed" | "skipped"> {
  const parsed = parseKnowledgeQueueMessage(queueMessage.message);

  if (!parsed) {
    await supabase.rpc("archive_malformed_knowledge_message", {
      p_msg_id: queueMessage.msg_id,
      p_payload: { message: queueMessage.message },
      p_error: "Malformed extract_knowledge queue payload",
    });
    return "failed";
  }

  const jobPayload = { course_id: parsed.course_id };
  const course = await loadCourse(supabase, parsed.course_id);

  if (!course) {
    await supabase.rpc("skip_knowledge_message", {
      p_course_id: parsed.course_id,
      p_msg_id: queueMessage.msg_id,
      p_reason: "course not found",
      p_job_payload: jobPayload,
    });
    return "skipped";
  }

  const idempotency = decideKnowledgeIdempotency({
    status: course.status ?? "draft",
  });

  if (idempotency.action === "skip") {
    await supabase.rpc("skip_knowledge_message", {
      p_course_id: parsed.course_id,
      p_msg_id: queueMessage.msg_id,
      p_reason: idempotency.reason,
      p_job_payload: jobPayload,
    });
    return "skipped";
  }

  let activeCourse = course;

  if (idempotency.action === "claim") {
    const { data: claim, error } = await supabase.rpc(
      "claim_course_for_knowledge_extraction",
      { p_course_id: parsed.course_id },
    );

    if (error) {
      throw error;
    }

    if (!claim?.claimed || !claim.course) {
      await supabase.rpc("skip_knowledge_message", {
        p_course_id: parsed.course_id,
        p_msg_id: queueMessage.msg_id,
        p_reason: claim?.reason ?? "claim failed",
        p_job_payload: jobPayload,
      });
      return "skipped";
    }

    activeCourse = claim.course as CourseRecord;
  }

  const sources = await loadDoneSources(supabase, parsed.course_id);
  const chunks = await loadChunksForSources(
    supabase,
    parsed.course_id,
    sources.map((source) => source.id),
  );
  const chunkInputs = buildChunkInputs(sources, chunks);

  if (chunkInputs.length === 0) {
    await supabase.rpc("fail_knowledge_extraction", {
      p_course_id: parsed.course_id,
      p_msg_id: queueMessage.msg_id,
      p_error: "NO_USABLE_CHUNKS: no chunks from done sources",
      p_model_used: null,
      p_retryable: false,
      p_job_payload: jobPayload,
      p_backoff_seconds: 0,
      p_read_ct: queueMessage.read_ct,
    });
    return "failed";
  }

  const callKnowledge =
    workerDeps.callKnowledgeExtraction ?? defaultCallKnowledgeExtraction;

  try {
    const result = await callKnowledge(
      activeCourse.title,
      chunkInputs,
      workerDeps.callRoleDeps,
    );

    const { error } = await supabase.rpc("complete_knowledge_extraction", {
      p_course_id: parsed.course_id,
      p_concepts: result.data.concepts,
      p_relationships: result.data.relationships,
      p_msg_id: queueMessage.msg_id,
      p_model_used: result.model_used,
      p_job_payload: jobPayload,
    });

    if (error) {
      throw error;
    }

    return "succeeded";
  } catch (error) {
    const failure = classifyKnowledgeFailure(error);

    await supabase.rpc("fail_knowledge_extraction", {
      p_course_id: parsed.course_id,
      p_msg_id: queueMessage.msg_id,
      p_error: failure.message,
      p_model_used: null,
      p_retryable: failure.retryable,
      p_job_payload: jobPayload,
      p_backoff_seconds: getRetryBackoffSeconds(queueMessage.read_ct),
      p_read_ct: queueMessage.read_ct,
    });

    return "failed";
  }
}

export async function runKnowledgeWorkerTick(
  supabase: SupabaseClient,
  workerDeps: KnowledgeWorkerDependencies = {},
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
      const outcome = await processKnowledgeMessage(
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
