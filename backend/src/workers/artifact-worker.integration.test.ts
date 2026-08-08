import { createClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { env } from "../config/index.js";
import { getServiceSupabaseClient } from "../lib/supabase.js";
import {
  enqueueGenerateArtifactsMessage,
  purgeGenerateArtifactsMessages,
} from "../repositories/queue-repository.js";
import {
  createTestIdentity,
  deleteTestIdentity,
  type TestIdentity,
} from "../test/helpers.js";
import {
  processArtifactMessage,
  runArtifactWorkerTick,
} from "./artifact-worker.js";

const hasSupabaseConfig = Boolean(
  env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_ANON_KEY,
);

async function createCourseWithKnowledge(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  userId: string,
  courseStatus: string = "generating_artifacts",
): Promise<{ courseId: string; conceptIds: string[] }> {
  const { data: course, error: courseError } = await supabase
    .from("courses")
    .insert({
      user_id: userId,
      title: "Artifact Worker Course",
      status: courseStatus,
    })
    .select("id")
    .single();

  if (courseError || !course) {
    throw courseError ?? new Error("Failed to create course");
  }

  const { data: concepts, error: conceptError } = await supabase
    .from("concepts")
    .insert([
      {
        course_id: course.id,
        name: "Hooks",
        description: "Stateful logic",
        difficulty: "beginner",
      },
      {
        course_id: course.id,
        name: "useState",
        description: "State hook",
        difficulty: "beginner",
      },
    ])
    .select("id");

  if (conceptError || !concepts) {
    throw conceptError ?? new Error("Failed to create concepts");
  }

  const conceptIds = concepts.map((concept) => concept.id);

  const { error: artifactError } = await supabase
    .from("artifact_generation_status")
    .insert([
      {
        course_id: course.id,
        artifact_type: "flashcards",
        status: "pending",
      },
      {
        course_id: course.id,
        artifact_type: "summary",
        status: "pending",
      },
    ]);

  if (artifactError) {
    throw artifactError;
  }

  return { courseId: course.id, conceptIds };
}

function mockFlashcardsFor(conceptIds: string[]) {
  return {
    data: {
      flashcards: [
        {
          front: "What are hooks?",
          back: "Stateful logic in functions",
          concept_id: conceptIds[0],
        },
        {
          front: "What is useState?",
          back: "A state hook",
          concept_id: conceptIds[1],
        },
      ],
    },
    model_used: "model-b",
  };
}

const mockSummary = {
  data: {
    short: "Short course summary",
    detailed: "Detailed course summary with more context",
  },
  model_used: "model-b",
};

async function readArtifactMessage(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
): Promise<{
  msg_id: number;
  read_ct: number;
  message: { course_id: string; artifact_type: string };
} | null> {
  const { data, error } = await supabase.rpc(
    "read_generate_artifacts_queue_messages",
    {
      p_vt_seconds: 90,
      p_batch_size: 1,
    },
  );

  if (error) {
    throw error;
  }

  const messages = (data ?? []) as Array<{
    msg_id: number;
    read_ct: number;
    message: { course_id: string; artifact_type: string };
  }>;

  return messages[0] ?? null;
}

function createAuthedClient(accessToken: string) {
  return createClient(env.SUPABASE_URL!, env.SUPABASE_ANON_KEY!, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

describe.skipIf(!hasSupabaseConfig)("artifact worker integration", () => {
  const supabase = getServiceSupabaseClient();
  let user: TestIdentity;

  beforeAll(async () => {
    user = await createTestIdentity("artifact-worker");
    await purgeGenerateArtifactsMessages(supabase);
  });

  afterEach(async () => {
    await purgeGenerateArtifactsMessages(supabase);
  });

  afterAll(async () => {
    await purgeGenerateArtifactsMessages(supabase);
    await deleteTestIdentity(user.id);
  });

  it("generates flashcards and marks artifact done", async () => {
    const { courseId, conceptIds } = await createCourseWithKnowledge(
      supabase,
      user.id,
    );
    await enqueueGenerateArtifactsMessage(supabase, courseId, "flashcards");

    const callFlashcards = vi
      .fn()
      .mockResolvedValue(mockFlashcardsFor(conceptIds));
    const summary = await runArtifactWorkerTick(supabase, {
      callFlashcardsGeneration: callFlashcards,
    });

    expect(summary.succeeded).toBe(1);
    expect(callFlashcards).toHaveBeenCalledTimes(1);

    const { data: artifact } = await supabase
      .from("artifact_generation_status")
      .select("status")
      .eq("course_id", courseId)
      .eq("artifact_type", "flashcards")
      .single();

    expect(artifact?.status).toBe("done");

    const { count } = await supabase
      .from("flashcards")
      .select("*", { count: "exact", head: true })
      .eq("course_id", courseId);

    expect(count).toBe(2);
  });

  it("aggregates to ready when both artifacts succeed", async () => {
    const { courseId, conceptIds } = await createCourseWithKnowledge(
      supabase,
      user.id,
    );
    await enqueueGenerateArtifactsMessage(supabase, courseId, "flashcards");
    await enqueueGenerateArtifactsMessage(supabase, courseId, "summary");

    await runArtifactWorkerTick(supabase, {
      callFlashcardsGeneration: vi
        .fn()
        .mockResolvedValue(mockFlashcardsFor(conceptIds)),
      callSummaryGeneration: vi.fn().mockResolvedValue(mockSummary),
    });

    const { data: course } = await supabase
      .from("courses")
      .select("status")
      .eq("id", courseId)
      .single();

    expect(course?.status).toBe("ready");

    const { count: summaryCount } = await supabase
      .from("summaries")
      .select("*", { count: "exact", head: true })
      .eq("course_id", courseId);

    expect(summaryCount).toBe(2);
  });

  it("sets partially_ready when flashcards succeed and summary fails permanently", async () => {
    const { courseId, conceptIds } = await createCourseWithKnowledge(
      supabase,
      user.id,
    );
    await enqueueGenerateArtifactsMessage(supabase, courseId, "flashcards");
    await enqueueGenerateArtifactsMessage(supabase, courseId, "summary");

    await runArtifactWorkerTick(supabase, {
      callFlashcardsGeneration: vi
        .fn()
        .mockResolvedValue(mockFlashcardsFor(conceptIds)),
      callSummaryGeneration: vi
        .fn()
        .mockRejectedValue(new Error("All models failed")),
    });

    const summaryMessage = await readArtifactMessage(supabase);
    expect(summaryMessage).not.toBeNull();

    await processArtifactMessage(
      supabase,
      { ...summaryMessage!, read_ct: 4 },
      {
        callSummaryGeneration: vi
          .fn()
          .mockRejectedValue(new Error("All models failed")),
      },
    );

    const { data: course } = await supabase
      .from("courses")
      .select("status")
      .eq("id", courseId)
      .single();

    expect(course?.status).toBe("partially_ready");

    const { data: flashcardsArtifact } = await supabase
      .from("artifact_generation_status")
      .select("status")
      .eq("course_id", courseId)
      .eq("artifact_type", "flashcards")
      .single();

    const { data: summaryArtifact } = await supabase
      .from("artifact_generation_status")
      .select("status")
      .eq("course_id", courseId)
      .eq("artifact_type", "summary")
      .single();

    expect(flashcardsArtifact?.status).toBe("done");
    expect(summaryArtifact?.status).toBe("failed_permanent");
  });

  it("skips duplicate flashcards delivery without duplicate rows", async () => {
    const { courseId, conceptIds } = await createCourseWithKnowledge(
      supabase,
      user.id,
    );
    await enqueueGenerateArtifactsMessage(supabase, courseId, "flashcards");

    const callFlashcards = vi
      .fn()
      .mockResolvedValue(mockFlashcardsFor(conceptIds));

    await runArtifactWorkerTick(supabase, {
      callFlashcardsGeneration: callFlashcards,
    });

    await enqueueGenerateArtifactsMessage(supabase, courseId, "flashcards");

    const duplicateMessage = await readArtifactMessage(supabase);
    expect(duplicateMessage).not.toBeNull();

    const outcome = await processArtifactMessage(supabase, duplicateMessage!, {
      callFlashcardsGeneration: callFlashcards,
    });

    expect(outcome).toBe("skipped");
    expect(callFlashcards).toHaveBeenCalledTimes(1);

    const { count } = await supabase
      .from("flashcards")
      .select("*", { count: "exact", head: true })
      .eq("course_id", courseId);

    expect(count).toBe(2);
  });

  it("retries summary without regenerating flashcards", async () => {
    const { courseId, conceptIds } = await createCourseWithKnowledge(
      supabase,
      user.id,
      "partially_ready",
    );

    await supabase
      .from("artifact_generation_status")
      .update({ status: "done" })
      .eq("course_id", courseId)
      .eq("artifact_type", "flashcards");

    await supabase
      .from("artifact_generation_status")
      .update({ status: "failed_permanent", last_error: "failed" })
      .eq("course_id", courseId)
      .eq("artifact_type", "summary");

    await supabase.from("flashcards").insert({
      course_id: courseId,
      concept_id: conceptIds[0],
      front: "Existing",
      back: "Card",
    });

    const authedClient = createAuthedClient(user.accessToken);
    const { error: retryError } = await authedClient.rpc(
      "retry_artifact_generation",
      {
        p_course_id: courseId,
        p_artifact_type: "summary",
      },
    );

    expect(retryError).toBeNull();

    const retryMessage = await readArtifactMessage(supabase);
    expect(retryMessage?.message.artifact_type).toBe("summary");

    const callSummary = vi.fn().mockResolvedValue(mockSummary);
    const outcome = await processArtifactMessage(supabase, retryMessage!, {
      callSummaryGeneration: callSummary,
    });

    expect(outcome).toBe("succeeded");
    expect(callSummary).toHaveBeenCalledTimes(1);

    const { count: flashcardCount } = await supabase
      .from("flashcards")
      .select("*", { count: "exact", head: true })
      .eq("course_id", courseId);

    expect(flashcardCount).toBe(1);

    const { count: conceptCount } = await supabase
      .from("concepts")
      .select("*", { count: "exact", head: true })
      .eq("course_id", courseId);

    expect(conceptCount).toBe(2);

    const { data: course } = await supabase
      .from("courses")
      .select("status")
      .eq("id", courseId)
      .single();

    expect(course?.status).toBe("ready");
  });

  it("recovers crash after persistence without duplicate summaries", async () => {
    const { courseId } = await createCourseWithKnowledge(supabase, user.id);
    await enqueueGenerateArtifactsMessage(supabase, courseId, "summary");

    const callSummary = vi.fn().mockResolvedValue(mockSummary);
    await runArtifactWorkerTick(supabase, { callSummaryGeneration: callSummary });

    await enqueueGenerateArtifactsMessage(supabase, courseId, "summary");

    const duplicateMessage = await readArtifactMessage(supabase);
    const outcome = await processArtifactMessage(supabase, duplicateMessage!, {
      callSummaryGeneration: callSummary,
    });

    expect(outcome).toBe("skipped");
    expect(callSummary).toHaveBeenCalledTimes(1);

    const { count } = await supabase
      .from("summaries")
      .select("*", { count: "exact", head: true })
      .eq("course_id", courseId);

    expect(count).toBe(2);
  });
});
