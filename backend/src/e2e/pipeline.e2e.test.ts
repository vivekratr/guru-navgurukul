import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import { env } from "../config/index.js";
import { getServiceSupabaseClient } from "../lib/supabase.js";
import {
  countGenerateArtifactsMessages,
  countIngestQueueMessages,
  purgeGenerateArtifactsMessages,
  purgeIngestQueueMessages,
} from "../repositories/queue-repository.js";
import {
  createTestCourse,
  createTestIdentity,
  createTestTextSource,
  deleteTestIdentity,
  waitForCourseStatus,
  type TestIdentity,
} from "../test/helpers.js";
import { runArtifactWorkerTick } from "../workers/artifact-worker.js";
import { runIngestWorkerTick } from "../workers/ingest-worker.js";
import { runKnowledgeWorkerTick } from "../workers/knowledge-worker.js";

const hasSupabaseConfig = Boolean(
  env.SUPABASE_URL &&
    env.SUPABASE_ANON_KEY &&
    env.SUPABASE_SERVICE_ROLE_KEY,
);

const mockVisionSuccess = {
  data: {
    chunks: [{ heading: "Intro", text: "E2E chunk content", position: 0 }],
  },
  model_used: "e2e-model",
};

const mockKnowledgeSuccess = {
  data: {
    concepts: [
      {
        id: "concept-1",
        name: "Hooks",
        description: "Stateful logic",
        difficulty: "beginner" as const,
      },
    ],
    relationships: [],
  },
  model_used: "e2e-model",
};

const mockFlashcardsSuccess = {
  data: {
    flashcards: [
      {
        front: "What are hooks?",
        back: "Stateful logic",
        concept_id: "concept-1",
      },
    ],
  },
  model_used: "e2e-model",
};

const mockSummarySuccess = {
  data: {
    short: "Short summary",
    detailed: "Detailed summary",
  },
  model_used: "e2e-model",
};

async function drainIngestQueue(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  workerDeps?: Parameters<typeof runIngestWorkerTick>[1],
): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const remaining = await countIngestQueueMessages(supabase);
    if (remaining === 0) {
      return;
    }

    await runIngestWorkerTick(supabase, workerDeps);
  }

  throw new Error("ingest queue did not drain");
}

async function drainArtifactQueue(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const remaining = await countGenerateArtifactsMessages(supabase);
    if (remaining === 0) {
      return;
    }

    await runArtifactWorkerTick(supabase, {
      callFlashcardsGeneration: async () => mockFlashcardsSuccess,
      callSummaryGeneration: async () => mockSummarySuccess,
    });
  }

  throw new Error("artifact queue did not drain");
}

describe.skipIf(!hasSupabaseConfig)("pipeline e2e", () => {
  const app = createApp();
  const supabase = getServiceSupabaseClient();
  let user: TestIdentity;

  beforeAll(async () => {
    user = await createTestIdentity("pipeline-e2e");
    await purgeIngestQueueMessages(supabase);
    await purgeGenerateArtifactsMessages(supabase);
  });

  afterAll(async () => {
    await purgeIngestQueueMessages(supabase);
    await purgeGenerateArtifactsMessages(supabase);
    await deleteTestIdentity(user.id);
  });

  it("runs signup through ready with mocked LLM boundaries", async () => {
    const courseId = await createTestCourse(user.accessToken, "E2E Happy Path");
    await createTestTextSource(
      user.accessToken,
      courseId,
      "End-to-end pipeline content",
    );

    const generate = await request(app)
      .post(`/api/v1/courses/${courseId}/generate`)
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(generate.status).toBe(202);
    expect(generate.body.status).toBe("ingesting");

    await drainIngestQueue(supabase, {
      callVisionIngest: async () => mockVisionSuccess,
    });

    await waitForCourseStatus(courseId, "extracting_knowledge");

    await runKnowledgeWorkerTick(supabase, {
      callKnowledgeExtraction: async () => mockKnowledgeSuccess,
    });

    await waitForCourseStatus(courseId, "generating_artifacts");
    await drainArtifactQueue(supabase);
    await waitForCourseStatus(courseId, "ready");

    const detail = await request(app)
      .get(`/api/v1/courses/${courseId}`)
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(detail.status).toBe(200);
    expect(detail.body.status).toBe("ready");
    expect(detail.body.sources[0]?.status).toBe("done");

    const summary = await request(app)
      .get(`/api/v1/courses/${courseId}/summary`)
      .set("Authorization", `Bearer ${user.accessToken}`);

    const flashcards = await request(app)
      .get(`/api/v1/courses/${courseId}/flashcards`)
      .set("Authorization", `Bearer ${user.accessToken}`);

    const graph = await request(app)
      .get(`/api/v1/courses/${courseId}/concept-graph`)
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(summary.status).toBe(200);
    expect(flashcards.status).toBe(200);
    expect(graph.status).toBe(200);
    expect(graph.body.concepts.length).toBeGreaterThan(0);

    await supabase.from("courses").delete().eq("id", courseId);
  });

  it("recovers from a forced ingest failure and completes the pipeline", async () => {
    vi.stubEnv("TEST_FORCE_INGEST_FAILURE_ONCE", "true");

    const courseId = await createTestCourse(user.accessToken, "E2E Failure Path");
    const sourceId = await createTestTextSource(
      user.accessToken,
      courseId,
      "Failure then success content",
    );

    await request(app)
      .post(`/api/v1/courses/${courseId}/generate`)
      .set("Authorization", `Bearer ${user.accessToken}`);

    await drainIngestQueue(supabase, {
      callVisionIngest: async () => mockVisionSuccess,
    });

    const { data: failedSource } = await supabase
      .from("sources")
      .select("status, last_error")
      .eq("id", sourceId)
      .single();

    expect(failedSource?.status).toBe("failed");

    vi.stubEnv("TEST_FORCE_INGEST_FAILURE_ONCE", "false");

    await request(app)
      .post(`/api/v1/courses/${courseId}/sources/${sourceId}/retry`)
      .set("Authorization", `Bearer ${user.accessToken}`);

    await drainIngestQueue(supabase, {
      callVisionIngest: async () => mockVisionSuccess,
    });

    const { data: recoveredSource } = await supabase
      .from("sources")
      .select("status")
      .eq("id", sourceId)
      .single();

    expect(recoveredSource?.status).toBe("done");

    await waitForCourseStatus(courseId, "extracting_knowledge");

    await runKnowledgeWorkerTick(supabase, {
      callKnowledgeExtraction: async () => mockKnowledgeSuccess,
    });

    await waitForCourseStatus(courseId, "generating_artifacts");
    await drainArtifactQueue(supabase);
    await waitForCourseStatus(courseId, "ready");

    vi.stubEnv("TEST_FORCE_INGEST_FAILURE_ONCE", "false");

    await supabase.from("courses").delete().eq("id", courseId);
  });
});
