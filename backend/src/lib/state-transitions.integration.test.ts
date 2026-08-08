import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import { env } from "../config/index.js";
import { getServiceSupabaseClient } from "../lib/supabase.js";
import {
  createTestCourse,
  createTestIdentity,
  createTestTextSource,
  deleteTestIdentity,
  type TestIdentity,
} from "../test/helpers.js";

const hasSupabaseAuthConfig = Boolean(
  env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY,
);

describe.skipIf(!hasSupabaseAuthConfig)("course status transition guards", () => {
  const app = createApp();
  const serviceClient = getServiceSupabaseClient();
  let user: TestIdentity;

  beforeAll(async () => {
    user = await createTestIdentity("state-machine");
  });

  afterAll(async () => {
    await deleteTestIdentity(user.id);
  });

  async function expectGenerateRejected(courseId: string): Promise<void> {
    const response = await request(app)
      .post(`/api/v1/courses/${courseId}/generate`)
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_STATE");
    expect(response.body.error.retryable).toBe(false);
  }

  it("allows draft to ingesting via generate", async () => {
    const courseId = await createTestCourse(user.accessToken, "Legal draft");
    await createTestTextSource(user.accessToken, courseId, "content");

    const response = await request(app)
      .post(`/api/v1/courses/${courseId}/generate`)
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(response.status).toBe(202);
    expect(response.body.status).toBe("ingesting");

    await serviceClient.from("courses").delete().eq("id", courseId);
  });

  it("rejects draft to ready via generate", async () => {
    const courseId = await createTestCourse(user.accessToken, "Illegal ready");
    await createTestTextSource(user.accessToken, courseId, "content");

    await serviceClient
      .from("courses")
      .update({ status: "ready" })
      .eq("id", courseId);

    await expectGenerateRejected(courseId);
    await serviceClient.from("courses").delete().eq("id", courseId);
  });

  it("rejects draft to generating_artifacts via generate", async () => {
    const courseId = await createTestCourse(user.accessToken, "Illegal artifacts");
    await createTestTextSource(user.accessToken, courseId, "content");

    await serviceClient
      .from("courses")
      .update({ status: "generating_artifacts" })
      .eq("id", courseId);

    await expectGenerateRejected(courseId);
    await serviceClient.from("courses").delete().eq("id", courseId);
  });

  it("rejects ready to ingesting via generate", async () => {
    const courseId = await createTestCourse(user.accessToken, "Ready course");
    await createTestTextSource(user.accessToken, courseId, "content");

    await serviceClient
      .from("courses")
      .update({ status: "ready" })
      .eq("id", courseId);

    await expectGenerateRejected(courseId);
    await serviceClient.from("courses").delete().eq("id", courseId);
  });

  it("rejects knowledge_extraction_failed to ingesting via generate", async () => {
    const courseId = await createTestCourse(user.accessToken, "Failed knowledge");
    await createTestTextSource(user.accessToken, courseId, "content");

    await serviceClient
      .from("courses")
      .update({ status: "knowledge_extraction_failed" })
      .eq("id", courseId);

    await expectGenerateRejected(courseId);
    await serviceClient.from("courses").delete().eq("id", courseId);
  });

  it("allows knowledge_extraction_failed to extracting_knowledge via retry", async () => {
    const courseId = await createTestCourse(user.accessToken, "Retry knowledge");
    const sourceId = await createTestTextSource(
      user.accessToken,
      courseId,
      "content",
    );

    await serviceClient
      .from("sources")
      .update({ status: "done" })
      .eq("id", sourceId);

    await serviceClient.from("source_chunks").insert({
      source_id: sourceId,
      course_id: courseId,
      text: "preserved chunk",
      position: 0,
    });

    await serviceClient
      .from("courses")
      .update({ status: "knowledge_extraction_failed" })
      .eq("id", courseId);

    const response = await request(app)
      .post(`/api/v1/courses/${courseId}/retry-knowledge-extraction`)
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("extracting_knowledge");

    const { data: chunks } = await serviceClient
      .from("source_chunks")
      .select("id")
      .eq("course_id", courseId);

    expect(chunks).toHaveLength(1);

    await serviceClient.from("courses").delete().eq("id", courseId);
  });
});

describe("source status idempotency guards", () => {
  it("skips done sources without reprocessing", async () => {
    const { decideIdempotency } = await import(
      "../workers/ingest/idempotency.js"
    );

    expect(decideIdempotency({ status: "done" }).action).toBe("skip");
    expect(decideIdempotency({ status: "cancelled" }).action).toBe("skip");
    expect(decideIdempotency({ status: "failed_permanent" }).action).toBe(
      "skip",
    );
    expect(decideIdempotency({ status: "pending" }).action).toBe("claim");
    expect(decideIdempotency({ status: "failed" }).action).toBe("claim");
    expect(decideIdempotency({ status: "processing" }).action).toBe(
      "resume_processing",
    );
  });
});
