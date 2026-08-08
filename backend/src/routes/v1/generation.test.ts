import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { env } from "../../config/index.js";
import { getServiceSupabaseClient } from "../../lib/supabase.js";
import {
  countIngestQueueMessages,
  peekIngestQueueMessages,
  purgeIngestQueueMessages,
} from "../../repositories/queue-repository.js";
import {
  createTestIdentity,
  deleteTestIdentity,
  type TestIdentity,
} from "../../test/helpers.js";

const hasSupabaseAuthConfig = Boolean(
  env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY,
);

async function createCourse(
  app: ReturnType<typeof createApp>,
  token: string,
  title: string,
): Promise<string> {
  const response = await request(app)
    .post("/api/v1/courses")
    .set("Authorization", `Bearer ${token}`)
    .send({ title });

  return response.body.id;
}

async function createTextSource(
  app: ReturnType<typeof createApp>,
  token: string,
  courseId: string,
  rawText: string,
): Promise<string> {
  const response = await request(app)
    .post(`/api/v1/courses/${courseId}/sources`)
    .set("Authorization", `Bearer ${token}`)
    .send({ type: "text", raw_text: rawText });

  return response.body.id;
}

describe.skipIf(!hasSupabaseAuthConfig)("generation trigger", () => {
  const app = createApp();
  const serviceClient = getServiceSupabaseClient();
  let user: TestIdentity;

  beforeAll(async () => {
    user = await createTestIdentity("generation-user");
    await purgeIngestQueueMessages(serviceClient);
  });

  afterEach(async () => {
    await purgeIngestQueueMessages(serviceClient);
  });

  afterAll(async () => {
    await purgeIngestQueueMessages(serviceClient);
    await deleteTestIdentity(user.id);
  });

  it("transitions draft to ingesting and enqueues one message per pending source", async () => {
    const courseId = await createCourse(app, user.accessToken, "Generate A");
    const sourceA = await createTextSource(
      app,
      user.accessToken,
      courseId,
      "A",
    );
    const sourceB = await createTextSource(
      app,
      user.accessToken,
      courseId,
      "B",
    );

    const response = await request(app)
      .post(`/api/v1/courses/${courseId}/generate`)
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      id: courseId,
      status: "ingesting",
    });

    const messages = await peekIngestQueueMessages(serviceClient);
    const sourceIds = messages.map((entry) => entry.message.source_id);

    expect(sourceIds.sort()).toEqual([sourceA, sourceB].sort());

    await serviceClient.from("courses").delete().eq("id", courseId);
  });

  it("enqueues only pending sources when some are already done", async () => {
    const courseId = await createCourse(app, user.accessToken, "Generate B");
    const sourceA = await createTextSource(
      app,
      user.accessToken,
      courseId,
      "done source",
    );
    const sourceB = await createTextSource(
      app,
      user.accessToken,
      courseId,
      "pending source",
    );
    const sourceC = await createTextSource(
      app,
      user.accessToken,
      courseId,
      "another done",
    );

    await serviceClient
      .from("sources")
      .update({ status: "done" })
      .in("id", [sourceA, sourceC]);

    const response = await request(app)
      .post(`/api/v1/courses/${courseId}/generate`)
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(response.status).toBe(202);

    const messages = await peekIngestQueueMessages(serviceClient);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message.source_id).toBe(sourceB);

    await serviceClient.from("courses").delete().eq("id", courseId);
  });

  it("rejects generation when the course has no usable sources", async () => {
    const courseId = await createCourse(app, user.accessToken, "Generate C");

    const response = await request(app)
      .post(`/api/v1/courses/${courseId}/generate`)
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_STATE");

    const { data: course } = await serviceClient
      .from("courses")
      .select("status")
      .eq("id", courseId)
      .single();

    expect(course?.status).toBe("draft");
    expect(await countIngestQueueMessages(serviceClient)).toBe(0);

    await serviceClient.from("courses").delete().eq("id", courseId);
  });

  it("is a no-op when generate is called while already ingesting", async () => {
    const courseId = await createCourse(app, user.accessToken, "Generate D");
    await createTextSource(app, user.accessToken, courseId, "only one");

    const first = await request(app)
      .post(`/api/v1/courses/${courseId}/generate`)
      .set("Authorization", `Bearer ${user.accessToken}`);

    const countAfterFirst = await countIngestQueueMessages(serviceClient);

    const second = await request(app)
      .post(`/api/v1/courses/${courseId}/generate`)
      .set("Authorization", `Bearer ${user.accessToken}`);

    const countAfterSecond = await countIngestQueueMessages(serviceClient);

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(second.body).toEqual({ id: courseId, status: "ingesting" });
    expect(countAfterSecond).toBe(countAfterFirst);

    await serviceClient.from("courses").delete().eq("id", courseId);
  });

  it("handles concurrent generate requests without duplicate queue messages", async () => {
    const courseId = await createCourse(app, user.accessToken, "Generate E");
    const sourceA = await createTextSource(
      app,
      user.accessToken,
      courseId,
      "concurrent A",
    );
    const sourceB = await createTextSource(
      app,
      user.accessToken,
      courseId,
      "concurrent B",
    );

    const [first, second] = await Promise.all([
      request(app)
        .post(`/api/v1/courses/${courseId}/generate`)
        .set("Authorization", `Bearer ${user.accessToken}`),
      request(app)
        .post(`/api/v1/courses/${courseId}/generate`)
        .set("Authorization", `Bearer ${user.accessToken}`),
    ]);

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);

    const messages = await peekIngestQueueMessages(serviceClient);
    const sourceIds = messages.map((entry) => entry.message.source_id).sort();

    expect(messages).toHaveLength(2);
    expect(sourceIds).toEqual([sourceA, sourceB].sort());

    await serviceClient.from("courses").delete().eq("id", courseId);
  });

  it("enqueues a message when retrying a failed_permanent source", async () => {
    const courseId = await createCourse(app, user.accessToken, "Generate F");
    const sourceId = await createTextSource(
      app,
      user.accessToken,
      courseId,
      "retry me",
    );

    await serviceClient
      .from("sources")
      .update({ status: "failed_permanent", attempt_count: 4 })
      .eq("id", sourceId);

    const response = await request(app)
      .post(`/api/v1/courses/${courseId}/sources/${sourceId}/retry`)
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: sourceId, status: "pending" });

    const messages = await peekIngestQueueMessages(serviceClient);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message.source_id).toBe(sourceId);

    await serviceClient.from("courses").delete().eq("id", courseId);
  });
});
