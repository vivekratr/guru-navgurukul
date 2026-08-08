import type { SupabaseClient } from "@supabase/supabase-js";

import {
  callRole,
  type CallRoleDependencies,
  flashcardsOutputSchema,
  summaryOutputSchema,
  validateFlashcardsSemantics,
} from "../lib/llm/index.js";
import { getRetryBackoffSeconds } from "./ingest/backoff.js";
import { ARTIFACT_BATCH_SIZE } from "./artifact/constants.js";
import { classifyArtifactFailure } from "./artifact/failure.js";
import {
  decideArtifactIdempotency,
  isValidCourseStatusForArtifacts,
} from "./artifact/idempotency.js";
import { parseArtifactQueueMessage } from "./artifact/message.js";
import {
  buildFlashcardsPrompt,
  buildSummaryPrompt,
  type ConceptInput,
  type RelationshipInput,
} from "./artifact/prompt.js";

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

export type ArtifactRecord = {
  course_id: string;
  artifact_type: string;
  status?: string;
  attempt_count?: number;
};

export type ArtifactWorkerDependencies = {
  callRoleDeps?: Partial<CallRoleDependencies>;
  callFlashcardsGeneration?: (
    courseTitle: string,
    concepts: ConceptInput[],
    relationships: RelationshipInput[],
    deps?: Partial<CallRoleDependencies>,
  ) => Promise<{
    data: {
      flashcards: Array<{
        front: string;
        back: string;
        concept_id: string;
      }>;
    };
    model_used: string;
  }>;
  callSummaryGeneration?: (
    courseTitle: string,
    concepts: ConceptInput[],
    relationships: RelationshipInput[],
    deps?: Partial<CallRoleDependencies>,
  ) => Promise<{
    data: { short: string; detailed: string };
    model_used: string;
  }>;
};

async function defaultCallFlashcardsGeneration(
  courseTitle: string,
  concepts: ConceptInput[],
  relationships: RelationshipInput[],
  deps?: Partial<CallRoleDependencies>,
) {
  const conceptIds = new Set(concepts.map((concept) => concept.id));
  const prompt = buildFlashcardsPrompt(courseTitle, concepts, relationships);

  return callRole(
    {
      role: "content_generation",
      messages: [
        {
          role: "system",
          content: "You generate structured learning flashcards as JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      outputSchema: flashcardsOutputSchema,
      validateOutput: (data) =>
        validateFlashcardsSemantics(data, conceptIds),
    },
    deps,
  );
}

async function defaultCallSummaryGeneration(
  courseTitle: string,
  concepts: ConceptInput[],
  relationships: RelationshipInput[],
  deps?: Partial<CallRoleDependencies>,
) {
  const prompt = buildSummaryPrompt(courseTitle, concepts, relationships);

  return callRole(
    {
      role: "content_generation",
      messages: [
        {
          role: "system",
          content: "You generate course summaries as JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      outputSchema: summaryOutputSchema,
    },
    deps,
  );
}

async function getVisibilityTimeoutSeconds(
  supabase: SupabaseClient,
): Promise<number> {
  const { data, error } = await supabase.rpc(
    "get_content_generation_visibility_timeout_seconds",
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
    "read_generate_artifacts_queue_messages",
    {
      p_vt_seconds: vtSeconds,
      p_batch_size: ARTIFACT_BATCH_SIZE,
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

async function loadArtifactStatus(
  supabase: SupabaseClient,
  courseId: string,
  artifactType: string,
): Promise<ArtifactRecord | null> {
  const { data, error } = await supabase
    .from("artifact_generation_status")
    .select("course_id, artifact_type, status, attempt_count")
    .eq("course_id", courseId)
    .eq("artifact_type", artifactType)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as ArtifactRecord | null;
}

async function loadKnowledgeModel(
  supabase: SupabaseClient,
  courseId: string,
): Promise<{ concepts: ConceptInput[]; relationships: RelationshipInput[] }> {
  const { data: concepts, error: conceptError } = await supabase
    .from("concepts")
    .select("id, name, description, difficulty")
    .eq("course_id", courseId);

  if (conceptError) {
    throw conceptError;
  }

  const { data: relationships, error: relationshipError } = await supabase
    .from("concept_relationships")
    .select("source_concept_id, target_concept_id, type")
    .eq("course_id", courseId);

  if (relationshipError) {
    throw relationshipError;
  }

  return {
    concepts: (concepts ?? []) as ConceptInput[],
    relationships: (relationships ?? []) as RelationshipInput[],
  };
}

export async function processArtifactMessage(
  supabase: SupabaseClient,
  queueMessage: QueueMessage,
  workerDeps: ArtifactWorkerDependencies = {},
): Promise<"succeeded" | "failed" | "skipped"> {
  const parsed = parseArtifactQueueMessage(queueMessage.message);

  if (!parsed) {
    await supabase.rpc("archive_malformed_artifact_message", {
      p_msg_id: queueMessage.msg_id,
      p_payload: { message: queueMessage.message },
      p_error: "Malformed generate_artifacts queue payload",
    });
    return "failed";
  }

  const jobPayload = {
    course_id: parsed.course_id,
    artifact_type: parsed.artifact_type,
  };

  const course = await loadCourse(supabase, parsed.course_id);

  if (!course) {
    await supabase.rpc("skip_artifact_message", {
      p_course_id: parsed.course_id,
      p_artifact_type: parsed.artifact_type,
      p_msg_id: queueMessage.msg_id,
      p_reason: "course not found",
      p_job_payload: jobPayload,
    });
    return "skipped";
  }

  if (!isValidCourseStatusForArtifacts(course.status ?? "draft")) {
    await supabase.rpc("skip_artifact_message", {
      p_course_id: parsed.course_id,
      p_artifact_type: parsed.artifact_type,
      p_msg_id: queueMessage.msg_id,
      p_reason: `course status ${course.status}`,
      p_job_payload: jobPayload,
    });
    return "skipped";
  }

  const artifact = await loadArtifactStatus(
    supabase,
    parsed.course_id,
    parsed.artifact_type,
  );

  if (!artifact) {
    await supabase.rpc("skip_artifact_message", {
      p_course_id: parsed.course_id,
      p_artifact_type: parsed.artifact_type,
      p_msg_id: queueMessage.msg_id,
      p_reason: "artifact status not found",
      p_job_payload: jobPayload,
    });
    return "skipped";
  }

  const idempotency = decideArtifactIdempotency({
    status: artifact.status ?? "pending",
  });

  if (idempotency.action === "skip") {
    await supabase.rpc("skip_artifact_message", {
      p_course_id: parsed.course_id,
      p_artifact_type: parsed.artifact_type,
      p_msg_id: queueMessage.msg_id,
      p_reason: idempotency.reason,
      p_job_payload: jobPayload,
    });
    return "skipped";
  }

  if (idempotency.action === "claim") {
    const { data: claim, error } = await supabase.rpc(
      "claim_artifact_for_processing",
      {
        p_course_id: parsed.course_id,
        p_artifact_type: parsed.artifact_type,
      },
    );

    if (error) {
      throw error;
    }

    if (!claim?.claimed) {
      await supabase.rpc("skip_artifact_message", {
        p_course_id: parsed.course_id,
        p_artifact_type: parsed.artifact_type,
        p_msg_id: queueMessage.msg_id,
        p_reason: claim?.reason ?? "claim failed",
        p_job_payload: jobPayload,
      });
      return "skipped";
    }
  }

  const knowledge = await loadKnowledgeModel(supabase, parsed.course_id);

  if (knowledge.concepts.length === 0) {
    await supabase.rpc("fail_artifact_generation", {
      p_course_id: parsed.course_id,
      p_artifact_type: parsed.artifact_type,
      p_msg_id: queueMessage.msg_id,
      p_error: "NO_CONCEPTS: knowledge model missing",
      p_model_used: null,
      p_retryable: false,
      p_job_payload: jobPayload,
      p_backoff_seconds: 0,
      p_read_ct: queueMessage.read_ct,
    });
    return "failed";
  }

  try {
    if (parsed.artifact_type === "flashcards") {
      const callFlashcards =
        workerDeps.callFlashcardsGeneration ?? defaultCallFlashcardsGeneration;
      const result = await callFlashcards(
        course.title,
        knowledge.concepts,
        knowledge.relationships,
        workerDeps.callRoleDeps,
      );

      const { error } = await supabase.rpc("complete_artifact_flashcards", {
        p_course_id: parsed.course_id,
        p_flashcards: result.data.flashcards,
        p_msg_id: queueMessage.msg_id,
        p_model_used: result.model_used,
        p_job_payload: jobPayload,
      });

      if (error) {
        throw error;
      }
    } else {
      const callSummary =
        workerDeps.callSummaryGeneration ?? defaultCallSummaryGeneration;
      const result = await callSummary(
        course.title,
        knowledge.concepts,
        knowledge.relationships,
        workerDeps.callRoleDeps,
      );

      const { error } = await supabase.rpc("complete_artifact_summary", {
        p_course_id: parsed.course_id,
        p_short: result.data.short,
        p_detailed: result.data.detailed,
        p_msg_id: queueMessage.msg_id,
        p_model_used: result.model_used,
        p_job_payload: jobPayload,
      });

      if (error) {
        throw error;
      }
    }

    return "succeeded";
  } catch (error) {
    const failure = classifyArtifactFailure(error);

    await supabase.rpc("fail_artifact_generation", {
      p_course_id: parsed.course_id,
      p_artifact_type: parsed.artifact_type,
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

export async function runArtifactWorkerTick(
  supabase: SupabaseClient,
  workerDeps: ArtifactWorkerDependencies = {},
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
      const outcome = await processArtifactMessage(
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
