import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { env } from "../config/index.js";
import { getServiceSupabaseClient } from "../lib/supabase.js";
import {
  countIngestQueueMessages,
  peekIngestQueueMessages,
  purgeIngestQueueMessages,
} from "../repositories/queue-repository.js";
import {
  createTestIdentity,
  deleteTestIdentity,
  type TestIdentity,
} from "../test/helpers.js";
import {
  processIngestMessage,
  runIngestWorkerTick,
} from "./ingest-worker.js";

const hasSupabaseConfig = Boolean(
  env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY,
);

async function purgeExtractQueue(supabase: ReturnType<typeof getServiceSupabaseClient>) {
  await supabase.rpc("purge_extract_knowledge_messages");
}

async function countExtractQueue(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
): Promise<number> {
  const { data } = await supabase.rpc("count_extract_knowledge_messages");
  return Number(data ?? 0);
}

async function createCourseWithSources(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  userId: string,
  sources: Array<{ text: string; status?: string }>,
): Promise<{ courseId: string; sourceIds: string[] }> {
  const { data: course, error: courseError } = await supabase
    .from("courses")
    .insert({
      user_id: userId,
      title: "Worker Test Course",
      status: "ingesting",
    })
    .select("id")
    .single();

  if (courseError || !course) {
    throw courseError ?? new Error("Failed to create course");
  }

  const sourceIds: string[] = [];

  for (const source of sources) {
    const { data: created, error } = await supabase
      .from("sources")
      .insert({
        course_id: course.id,
        type: "text",
        raw_text: source.text,
        status: source.status ?? "pending",
      })
      .select("id")
      .single();

    if (error || !created) {
      throw error ?? new Error("Failed to create source");
    }

    sourceIds.push(created.id);
  }

  return { courseId: course.id, sourceIds };
}

async function enqueueSource(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  sourceId: string,
): Promise<void> {
  const { error } = await supabase.rpc("enqueue_ingest_source_message", {
    p_source_id: sourceId,
  });

  if (error) {
    throw error;
  }
}

const mockVisionSuccess = {
  data: {
    chunks: [{ heading: "Intro", text: "Chunk content", position: 0 }],
  },
  model_used: "model-a",
};

describe.skipIf(!hasSupabaseConfig)("ingest worker integration", () => {
  const supabase = getServiceSupabaseClient();
  let user: TestIdentity;

  beforeAll(async () => {
    user = await createTestIdentity("ingest-worker");
    await purgeIngestQueueMessages(supabase);
    await purgeExtractQueue(supabase);
  });

  afterEach(async () => {
    await purgeIngestQueueMessages(supabase);
    await purgeExtractQueue(supabase);
  });

  afterAll(async () => {
    await purgeIngestQueueMessages(supabase);
    await purgeExtractQueue(supabase);
    await deleteTestIdentity(user.id);
  });

  it("processes pending source through done with archived message", async () => {
    const { courseId, sourceIds } = await createCourseWithSources(supabase, user.id, [
      { text: "Hello world content for ingestion" },
    ]);
    await enqueueSource(supabase, sourceIds[0]!);

    const summary = await runIngestWorkerTick(supabase, {
      callVisionIngest: async () => mockVisionSuccess,
    });

    expect(summary.succeeded).toBe(1);

    const { data: source } = await supabase
      .from("sources")
      .select("status, attempt_count")
      .eq("id", sourceIds[0]!)
      .single();

    expect(source?.status).toBe("done");

    const { data: chunks } = await supabase
      .from("source_chunks")
      .select("text, position")
      .eq("source_id", sourceIds[0]!);

    expect(chunks).toHaveLength(1);
    expect(chunks?.[0]?.text).toBe("Chunk content");
    expect(await countIngestQueueMessages(supabase)).toBe(0);

    await supabase.from("courses").delete().eq("id", courseId);
  });

  it("skips duplicate delivery for done sources without duplicate chunks", async () => {
    const { courseId, sourceIds } = await createCourseWithSources(supabase, user.id, [
      { text: "Already done source", status: "done" },
    ]);

    await supabase.from("source_chunks").insert({
      source_id: sourceIds[0]!,
      course_id: courseId,
      text: "existing chunk",
      position: 0,
    });

    await enqueueSource(supabase, sourceIds[0]!);

    const summary = await runIngestWorkerTick(supabase, {
      callVisionIngest: async () => mockVisionSuccess,
    });

    expect(summary.skipped).toBe(1);

    const { count } = await supabase
      .from("source_chunks")
      .select("id", { count: "exact", head: true })
      .eq("source_id", sourceIds[0]!);

    expect(count).toBe(1);
    expect(await countIngestQueueMessages(supabase)).toBe(0);

    await supabase.from("courses").delete().eq("id", courseId);
  });

  it("retries retryable failures and keeps the queue message", async () => {
    const { courseId, sourceIds } = await createCourseWithSources(supabase, user.id, [
      { text: "Retry me" },
    ]);
    await enqueueSource(supabase, sourceIds[0]!);

    await runIngestWorkerTick(supabase, {
      callVisionIngest: async () => {
        throw new Error("temporary provider timeout");
      },
    });

    const { data: source } = await supabase
      .from("sources")
      .select("status, attempt_count, last_error")
      .eq("id", sourceIds[0]!)
      .single();

    expect(source?.status).toBe("failed");
    expect(source?.attempt_count).toBe(1);
    expect(source?.last_error).toContain("temporary provider timeout");
    expect(await countIngestQueueMessages(supabase)).toBe(1);

    await supabase.from("courses").delete().eq("id", courseId);
  });

  it("marks failed_permanent after max attempts and archives message", async () => {
    const { courseId, sourceIds } = await createCourseWithSources(supabase, user.id, [
      { text: "Permanent fail" },
    ]);

    await supabase
      .from("sources")
      .update({ status: "failed", attempt_count: 3 })
      .eq("id", sourceIds[0]!);

    await enqueueSource(supabase, sourceIds[0]!);

    await runIngestWorkerTick(supabase, {
      callVisionIngest: async () => {
        throw new Error("still failing");
      },
    });

    const { data: source } = await supabase
      .from("sources")
      .select("status, attempt_count")
      .eq("id", sourceIds[0]!)
      .single();

    expect(source?.status).toBe("failed_permanent");
    expect(source?.attempt_count).toBe(4);
    expect(await countIngestQueueMessages(supabase)).toBe(0);

    await supabase.from("courses").delete().eq("id", courseId);
  });

  it("skips cancelled sources without calling vision_ingest", async () => {
    const { courseId, sourceIds } = await createCourseWithSources(supabase, user.id, [
      { text: "Cancelled", status: "cancelled" },
    ]);

    const vision = vi.fn(async () => mockVisionSuccess);
    await enqueueSource(supabase, sourceIds[0]!);

    const summary = await runIngestWorkerTick(supabase, {
      callVisionIngest: vision,
    });

    expect(summary.skipped).toBe(1);
    expect(vision).not.toHaveBeenCalled();
    expect(await countIngestQueueMessages(supabase)).toBe(0);

    await supabase.from("courses").delete().eq("id", courseId);
  });

  it("enqueues extract_knowledge once when all sources are terminal with at least one done", async () => {
    const { courseId, sourceIds } = await createCourseWithSources(supabase, user.id, [
      { text: "Source A", status: "done" },
      { text: "Source B" },
    ]);

    await supabase.from("source_chunks").insert({
      source_id: sourceIds[0]!,
      course_id: courseId,
      text: "done chunk",
      position: 0,
    });

    await enqueueSource(supabase, sourceIds[1]!);

    await runIngestWorkerTick(supabase, {
      callVisionIngest: async () => mockVisionSuccess,
    });

    expect(await countExtractQueue(supabase)).toBe(1);

    const { data: peek } = await supabase.rpc("peek_extract_knowledge_messages");
    expect(peek?.[0]?.message?.course_id).toBe(courseId);

    await supabase.from("courses").delete().eq("id", courseId);
  });

  it("does not enqueue extraction while a source is still processing", async () => {
    const { courseId, sourceIds } = await createCourseWithSources(supabase, user.id, [
      { text: "Done source", status: "done" },
      { text: "Still processing", status: "processing" },
    ]);

    await supabase.from("source_chunks").insert({
      source_id: sourceIds[0]!,
      course_id: courseId,
      text: "done chunk",
      position: 0,
    });

    await supabase.rpc("maybe_enqueue_knowledge_extraction", {
      p_course_id: courseId,
    });

    expect(await countExtractQueue(supabase)).toBe(0);

    await supabase.from("courses").delete().eq("id", courseId);
  });

  it("does not enqueue extraction when all sources failed permanently", async () => {
    const { courseId } = await createCourseWithSources(supabase, user.id, [
      { text: "Fail A", status: "failed_permanent" },
      { text: "Fail B", status: "failed_permanent" },
    ]);

    await supabase.rpc("maybe_enqueue_knowledge_extraction", {
      p_course_id: courseId,
    });

    expect(await countExtractQueue(supabase)).toBe(0);

    await supabase.from("courses").delete().eq("id", courseId);
  });

  it("prevents duplicate extract_knowledge jobs under concurrent completion", async () => {
    const { courseId, sourceIds } = await createCourseWithSources(supabase, user.id, [
      { text: "Source A" },
      { text: "Source B" },
    ]);

    await supabase
      .from("sources")
      .update({ status: "done" })
      .in("id", sourceIds);

    await supabase.from("source_chunks").insert([
      {
        source_id: sourceIds[0]!,
        course_id: courseId,
        text: "chunk a",
        position: 0,
      },
      {
        source_id: sourceIds[1]!,
        course_id: courseId,
        text: "chunk b",
        position: 0,
      },
    ]);

    const [first, second] = await Promise.all([
      supabase.rpc("maybe_enqueue_knowledge_extraction", { p_course_id: courseId }),
      supabase.rpc("maybe_enqueue_knowledge_extraction", { p_course_id: courseId }),
    ]);

    expect(first.data || second.data).toBe(true);
    expect(await countExtractQueue(supabase)).toBe(1);

    await supabase.from("courses").delete().eq("id", courseId);
  });

  it("recovers claimed messages after visibility timeout without manual reinsert", async () => {
    const { courseId, sourceIds } = await createCourseWithSources(supabase, user.id, [
      { text: "Crash recovery source" },
    ]);
    await enqueueSource(supabase, sourceIds[0]!);

    const { data: claimed } = await supabase.rpc("read_ingest_queue_messages", {
      p_vt_seconds: 1,
      p_batch_size: 1,
    });

    expect(claimed?.length).toBe(1);

    await supabase
      .from("sources")
      .update({ status: "processing", attempt_count: 1 })
      .eq("id", sourceIds[0]!);

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const messages = await peekIngestQueueMessages(supabase);
    expect(messages.length).toBeGreaterThan(0);

    const outcome = await processIngestMessage(
      supabase,
      {
        msg_id: messages[0]!.msg_id,
        read_ct: 2,
        message: messages[0]!.message,
      },
      { callVisionIngest: async () => mockVisionSuccess },
    );

    expect(outcome).toBe("succeeded");

    const { data: source } = await supabase
      .from("sources")
      .select("status")
      .eq("id", sourceIds[0]!)
      .single();

    expect(source?.status).toBe("done");
    expect(await countIngestQueueMessages(supabase)).toBe(0);

    await supabase.from("courses").delete().eq("id", courseId);
  });
});
