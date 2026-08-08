import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createClient } from "@supabase/supabase-js";

import { env } from "../config/index.js";
import { getServiceSupabaseClient } from "../lib/supabase.js";
import {
  countExtractKnowledgeMessages,
  countGenerateArtifactsMessages,
  peekGenerateArtifactsMessages,
  purgeExtractKnowledgeMessages,
  purgeGenerateArtifactsMessages,
} from "../repositories/queue-repository.js";
import {
  createTestIdentity,
  deleteTestIdentity,
  type TestIdentity,
} from "../test/helpers.js";
import {
  processKnowledgeMessage,
  runKnowledgeWorkerTick,
} from "./knowledge-worker.js";

const hasSupabaseConfig = Boolean(
  env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_ANON_KEY,
);

const mockKnowledgeSuccess = {
  data: {
    concepts: [
      {
        id: "concept-1",
        name: "React Hooks",
        description: "Stateful logic in functions",
        difficulty: "beginner",
      },
      {
        id: "concept-2",
        name: "useState",
        description: "State hook",
        difficulty: "beginner",
      },
    ],
    relationships: [
      {
        from: "concept-1",
        to: "concept-2",
        type: "contains",
      },
    ],
  },
  model_used: "model-b",
};

async function createCourseWithChunks(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  userId: string,
  options: {
    status?: string;
    sources: Array<{
      status: string;
      chunks: Array<{ heading?: string; text: string; position: number }>;
    }>;
  },
): Promise<{ courseId: string; sourceIds: string[] }> {
  const { data: course, error: courseError } = await supabase
    .from("courses")
    .insert({
      user_id: userId,
      title: "Knowledge Worker Course",
      status: options.status ?? "ingesting",
    })
    .select("id")
    .single();

  if (courseError || !course) {
    throw courseError ?? new Error("Failed to create course");
  }

  const sourceIds: string[] = [];

  for (const source of options.sources) {
    const { data: created, error } = await supabase
      .from("sources")
      .insert({
        course_id: course.id,
        type: "text",
        raw_text: "seed",
        status: source.status,
      })
      .select("id")
      .single();

    if (error || !created) {
      throw error ?? new Error("Failed to create source");
    }

    sourceIds.push(created.id);

    if (source.chunks.length > 0) {
      const { error: chunkError } = await supabase.from("source_chunks").insert(
        source.chunks.map((chunk) => ({
          source_id: created.id,
          course_id: course.id,
          heading: chunk.heading ?? null,
          text: chunk.text,
          position: chunk.position,
        })),
      );

      if (chunkError) {
        throw chunkError;
      }
    }
  }

  return { courseId: course.id, sourceIds };
}

async function enqueueKnowledge(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  courseId: string,
): Promise<void> {
  const { error } = await supabase.rpc("maybe_enqueue_knowledge_extraction", {
    p_course_id: courseId,
  });

  if (error) {
    throw error;
  }
}

async function enqueueKnowledgeDirect(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  courseId: string,
): Promise<void> {
  const { error } = await supabase.rpc("enqueue_extract_knowledge_message", {
    p_course_id: courseId,
  });

  if (error) {
    throw error;
  }
}

async function readKnowledgeMessage(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
): Promise<{ msg_id: number; read_ct: number; message: { course_id: string } } | null> {
  const { data, error } = await supabase.rpc(
    "read_extract_knowledge_queue_messages",
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
    message: { course_id: string };
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

describe.skipIf(!hasSupabaseConfig)("knowledge worker integration", () => {
  const supabase = getServiceSupabaseClient();
  let user: TestIdentity;

  beforeAll(async () => {
    user = await createTestIdentity("knowledge-worker");
    await purgeExtractKnowledgeMessages(supabase);
    await purgeGenerateArtifactsMessages(supabase);
  });

  afterEach(async () => {
    await purgeExtractKnowledgeMessages(supabase);
    await purgeGenerateArtifactsMessages(supabase);
  });

  afterAll(async () => {
    await purgeExtractKnowledgeMessages(supabase);
    await purgeGenerateArtifactsMessages(supabase);
    await deleteTestIdentity(user.id);
  });

  it("processes ingesting course through generating_artifacts with artifact jobs", async () => {
    const { courseId } = await createCourseWithChunks(supabase, user.id, {
      sources: [
        {
          status: "done",
          chunks: [
            { heading: "A1", text: "Chunk A1", position: 0 },
            { heading: "A2", text: "Chunk A2", position: 1 },
          ],
        },
        {
          status: "done",
          chunks: [
            { heading: "B1", text: "Chunk B1", position: 0 },
            { heading: "B2", text: "Chunk B2", position: 1 },
          ],
        },
        {
          status: "failed_permanent",
          chunks: [],
        },
      ],
    });

    await enqueueKnowledge(supabase, courseId);

    const callKnowledge = vi.fn().mockResolvedValue(mockKnowledgeSuccess);

    const summary = await runKnowledgeWorkerTick(supabase, {
      callKnowledgeExtraction: callKnowledge,
    });

    expect(summary.succeeded).toBe(1);
    expect(callKnowledge).toHaveBeenCalledTimes(1);
    expect(callKnowledge.mock.calls[0]?.[1]).toHaveLength(4);

    const { data: course } = await supabase
      .from("courses")
      .select("status")
      .eq("id", courseId)
      .single();

    expect(course?.status).toBe("generating_artifacts");

    const { count: conceptCount } = await supabase
      .from("concepts")
      .select("*", { count: "exact", head: true })
      .eq("course_id", courseId);

    expect(conceptCount).toBe(2);

    const { count: relationshipCount } = await supabase
      .from("concept_relationships")
      .select("*", { count: "exact", head: true })
      .eq("course_id", courseId);

    expect(relationshipCount).toBe(1);

    expect(await countExtractKnowledgeMessages(supabase)).toBe(0);
    expect(await countGenerateArtifactsMessages(supabase)).toBe(2);

    const artifactMessages = await peekGenerateArtifactsMessages(supabase);
    const artifactTypes = artifactMessages.map(
      (message) => message.message.artifact_type,
    );

    expect(artifactTypes).toEqual(expect.arrayContaining(["flashcards", "summary"]));
    expect(artifactTypes).toHaveLength(2);
  });

  it("does not call LLM when no usable chunks exist", async () => {
    const { courseId } = await createCourseWithChunks(supabase, user.id, {
      sources: [
        { status: "done", chunks: [] },
        { status: "failed_permanent", chunks: [] },
      ],
    });

    await enqueueKnowledge(supabase, courseId);

    const callKnowledge = vi.fn();

    const message = await readKnowledgeMessage(supabase);
    expect(message).not.toBeNull();

    const outcome = await processKnowledgeMessage(supabase, message!, {
      callKnowledgeExtraction: callKnowledge,
    });

    expect(outcome).toBe("failed");
    expect(callKnowledge).not.toHaveBeenCalled();

    const { data: course } = await supabase
      .from("courses")
      .select("status")
      .eq("id", courseId)
      .single();

    expect(course?.status).toBe("knowledge_extraction_failed");
  });

  it("skips duplicate delivery after knowledge extraction succeeded", async () => {
    const { courseId } = await createCourseWithChunks(supabase, user.id, {
      sources: [
        {
          status: "done",
          chunks: [{ text: "Only chunk", position: 0 }],
        },
      ],
    });

    await enqueueKnowledge(supabase, courseId);

    const callKnowledge = vi.fn().mockResolvedValue(mockKnowledgeSuccess);

    await runKnowledgeWorkerTick(supabase, { callKnowledgeExtraction: callKnowledge });

    await enqueueKnowledgeDirect(supabase, courseId);

    const duplicateMessage = await readKnowledgeMessage(supabase);
    expect(duplicateMessage).not.toBeNull();

    const outcome = await processKnowledgeMessage(
      supabase,
      duplicateMessage!,
      { callKnowledgeExtraction: callKnowledge },
    );

    expect(outcome).toBe("skipped");
    expect(callKnowledge).toHaveBeenCalledTimes(1);

    const { count: conceptCount } = await supabase
      .from("concepts")
      .select("*", { count: "exact", head: true })
      .eq("course_id", courseId);

    expect(conceptCount).toBe(2);
    expect(await countGenerateArtifactsMessages(supabase)).toBe(2);
  });

  it("marks knowledge_extraction_failed after exhausting retries and preserves chunks", async () => {
    const { courseId } = await createCourseWithChunks(supabase, user.id, {
      sources: [
        {
          status: "done",
          chunks: [{ text: "Persist me", position: 0 }],
        },
      ],
    });

    await enqueueKnowledge(supabase, courseId);

    const message = await readKnowledgeMessage(supabase);
    expect(message).not.toBeNull();

    const failingCall = vi.fn().mockRejectedValue(new Error("All models failed"));

    await processKnowledgeMessage(
      supabase,
      { ...message!, read_ct: 4 },
      { callKnowledgeExtraction: failingCall },
    );

    const { data: course } = await supabase
      .from("courses")
      .select("status, last_error")
      .eq("id", courseId)
      .single();

    expect(course?.status).toBe("knowledge_extraction_failed");
    expect(course?.last_error).toBeTruthy();

    const { count: chunkCount } = await supabase
      .from("source_chunks")
      .select("*", { count: "exact", head: true })
      .eq("course_id", courseId);

    expect(chunkCount).toBe(1);

    const { count: conceptCount } = await supabase
      .from("concepts")
      .select("*", { count: "exact", head: true })
      .eq("course_id", courseId);

    expect(conceptCount).toBe(0);
  });

  it("retries knowledge extraction without re-ingesting after manual retry", async () => {
    const { courseId } = await createCourseWithChunks(supabase, user.id, {
      sources: [
        {
          status: "done",
          chunks: [{ text: "Retry chunk", position: 0 }],
        },
      ],
    });

    await enqueueKnowledge(supabase, courseId);

    const message = await readKnowledgeMessage(supabase);
    expect(message).not.toBeNull();

    await processKnowledgeMessage(
      supabase,
      { ...message!, read_ct: 4 },
      {
        callKnowledgeExtraction: vi
          .fn()
          .mockRejectedValue(new Error("All models failed")),
      },
    );

    const authedClient = createAuthedClient(user.accessToken);
    const { error: retryError } = await authedClient.rpc(
      "retry_knowledge_extraction",
      { p_course_id: courseId },
    );

    expect(retryError).toBeNull();

    const retryMessage = await readKnowledgeMessage(supabase);
    expect(retryMessage).not.toBeNull();

    const callKnowledge = vi.fn().mockResolvedValue(mockKnowledgeSuccess);
    const outcome = await processKnowledgeMessage(supabase, retryMessage!, {
      callKnowledgeExtraction: callKnowledge,
    });

    expect(outcome).toBe("succeeded");
    expect(callKnowledge).toHaveBeenCalledTimes(1);

    const { data: course } = await supabase
      .from("courses")
      .select("status")
      .eq("id", courseId)
      .single();

    expect(course?.status).toBe("generating_artifacts");

    const { data: sources } = await supabase
      .from("sources")
      .select("status")
      .eq("course_id", courseId);

    expect(sources?.every((source) => source.status === "done")).toBe(true);

    const { count: chunkCount } = await supabase
      .from("source_chunks")
      .select("*", { count: "exact", head: true })
      .eq("course_id", courseId);

    expect(chunkCount).toBe(1);
  });
});
