import { createClient } from "@supabase/supabase-js";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { env } from "../../config/index.js";
import {
  buildStoragePath,
  FILE_SIZE_LIMIT_BYTES,
  SOURCE_UPLOADS_BUCKET,
} from "../../lib/source-file-policy.js";
import { INITIAL_SOURCE_STATUS } from "../../lib/source-state.js";
import {
  createUserSupabaseClient,
  getServiceSupabaseClient,
} from "../../lib/supabase.js";
import {
  createTestIdentity,
  deleteTestIdentity,
  type TestIdentity,
} from "../../test/helpers.js";

const hasSupabaseAuthConfig = Boolean(
  env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY,
);

async function uploadSourceFile(
  accessToken: string,
  storagePath: string,
  content: Buffer,
  contentType: string,
): Promise<void> {
  const client = createUserSupabaseClient(accessToken);
  const { error } = await client.storage
    .from(SOURCE_UPLOADS_BUCKET)
    .upload(storagePath, content, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw error;
  }
}

describe("source endpoints require authentication", () => {
  const app = createApp();

  it("returns 401 for POST /api/v1/courses/:id/sources without a token", async () => {
    const response = await request(app)
      .post("/api/v1/courses/00000000-0000-4000-8000-000000000001/sources")
      .send({ type: "text", raw_text: "hello" });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });
});

describe.skipIf(!hasSupabaseAuthConfig)("source management", () => {
  const app = createApp();
  let userA: TestIdentity;
  let userB: TestIdentity;
  let courseAId: string;
  let courseBId: string;

  beforeAll(async () => {
    userA = await createTestIdentity("source-user-a");
    userB = await createTestIdentity("source-user-b");

    const createA = await request(app)
      .post("/api/v1/courses")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ title: "Source Course A" });

    const createB = await request(app)
      .post("/api/v1/courses")
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .send({ title: "Source Course B" });

    courseAId = createA.body.id;
    courseBId = createB.body.id;
  });

  afterAll(async () => {
    const serviceClient = getServiceSupabaseClient();
    await serviceClient.from("courses").delete().in("id", [courseAId, courseBId]);
    await deleteTestIdentity(userA.id);
    await deleteTestIdentity(userB.id);
  });

  it("creates a pending text source", async () => {
    const response = await request(app)
      .post(`/api/v1/courses/${courseAId}/sources`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ type: "text", raw_text: "React Hooks let you..." });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String),
      type: "text",
      status: INITIAL_SOURCE_STATUS,
    });

    const serviceClient = getServiceSupabaseClient();
    const { count } = await serviceClient
      .from("source_chunks")
      .select("id", { count: "exact", head: true })
      .eq("source_id", response.body.id);

    expect(count).toBe(0);
  });

  it("rejects empty text and invalid source types", async () => {
    const emptyText = await request(app)
      .post(`/api/v1/courses/${courseAId}/sources`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ type: "text", raw_text: "   " });

    const invalidType = await request(app)
      .post(`/api/v1/courses/${courseAId}/sources`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ type: "audio", raw_text: "hello" });

    expect(emptyText.status).toBe(400);
    expect(emptyText.body.error.code).toBe("VALIDATION_ERROR");
    expect(invalidType.status).toBe(400);
    expect(invalidType.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("creates pending file sources from uploaded storage paths", async () => {
    const uploadId = crypto.randomUUID();
    const docPath = buildStoragePath(
      userA.id,
      courseAId,
      uploadId,
      "notes.pdf",
    );
    const imagePath = buildStoragePath(
      userA.id,
      courseAId,
      uploadId,
      "diagram.png",
    );
    const videoPath = buildStoragePath(
      userA.id,
      courseAId,
      uploadId,
      "clip.mp4",
    );

    await uploadSourceFile(
      userA.accessToken,
      docPath,
      Buffer.from("%PDF-1.4"),
      "application/pdf",
    );
    await uploadSourceFile(
      userA.accessToken,
      imagePath,
      Buffer.from("png"),
      "image/png",
    );
    await uploadSourceFile(
      userA.accessToken,
      videoPath,
      Buffer.from("mp4"),
      "video/mp4",
    );

    const docResponse = await request(app)
      .post(`/api/v1/courses/${courseAId}/sources`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({
        type: "doc",
        storage_path: docPath,
        mime_type: "application/pdf",
        file_size_bytes: 1024,
      });

    const imageResponse = await request(app)
      .post(`/api/v1/courses/${courseAId}/sources`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({
        type: "image",
        storage_path: imagePath,
        mime_type: "image/png",
        file_size_bytes: 2048,
      });

    const videoResponse = await request(app)
      .post(`/api/v1/courses/${courseAId}/sources`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({
        type: "video",
        storage_path: videoPath,
        mime_type: "video/mp4",
        file_size_bytes: 4096,
        duration_sec: 120,
      });

    expect(docResponse.status).toBe(201);
    expect(imageResponse.status).toBe(201);
    expect(videoResponse.status).toBe(201);
    expect(docResponse.body.status).toBe(INITIAL_SOURCE_STATUS);
    expect(imageResponse.body.status).toBe(INITIAL_SOURCE_STATUS);
    expect(videoResponse.body.status).toBe(INITIAL_SOURCE_STATUS);
  });

  it("rejects invalid file metadata", async () => {
    const uploadId = crypto.randomUUID();
    const videoPath = buildStoragePath(
      userA.id,
      courseAId,
      uploadId,
      "long.mp4",
    );

    await uploadSourceFile(
      userA.accessToken,
      videoPath,
      Buffer.from("mp4"),
      "video/mp4",
    );

    const tooLong = await request(app)
      .post(`/api/v1/courses/${courseAId}/sources`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({
        type: "video",
        storage_path: videoPath,
        mime_type: "video/mp4",
        file_size_bytes: 1024,
        duration_sec: 181,
      });

    const badMime = await request(app)
      .post(`/api/v1/courses/${courseAId}/sources`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({
        type: "doc",
        storage_path: videoPath,
        mime_type: "text/plain",
        file_size_bytes: 1024,
      });

    const tooLarge = await request(app)
      .post(`/api/v1/courses/${courseAId}/sources`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({
        type: "image",
        storage_path: videoPath,
        mime_type: "image/png",
        file_size_bytes: FILE_SIZE_LIMIT_BYTES.image + 1,
      });

    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.code).toBe("VIDEO_TOO_LONG");
    expect(badMime.status).toBe(400);
    expect(badMime.body.error.code).toBe("INVALID_FILE_TYPE");
    expect(tooLarge.status).toBe(400);
    expect(tooLarge.body.error.code).toBe("SOURCE_TOO_LARGE");
  });

  it("denies source creation for another user's course", async () => {
    const response = await request(app)
      .post(`/api/v1/courses/${courseBId}/sources`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ type: "text", raw_text: "cross-user attempt" });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("COURSE_NOT_FOUND");
  });

  it("denies attaching another user's storage path", async () => {
    const uploadId = crypto.randomUUID();
    const foreignPath = buildStoragePath(
      userB.id,
      courseBId,
      uploadId,
      "secret.pdf",
    );

    await uploadSourceFile(
      userB.accessToken,
      foreignPath,
      Buffer.from("%PDF-1.4"),
      "application/pdf",
    );

    const response = await request(app)
      .post(`/api/v1/courses/${courseAId}/sources`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({
        type: "doc",
        storage_path: foreignPath,
        mime_type: "application/pdf",
        file_size_bytes: 1024,
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("blocks cross-user storage reads", async () => {
    const uploadId = crypto.randomUUID();
    const foreignPath = buildStoragePath(
      userB.id,
      courseBId,
      uploadId,
      "private.pdf",
    );

    await uploadSourceFile(
      userB.accessToken,
      foreignPath,
      Buffer.from("%PDF-1.4"),
      "application/pdf",
    );

    const clientA = createUserSupabaseClient(userA.accessToken);
    const { data, error } = await clientA.storage
      .from(SOURCE_UPLOADS_BUCKET)
      .download(foreignPath);

    expect(error).toBeTruthy();
    expect(data).toBeNull();
  });

  it("cancels pending sources and processing sources safely", async () => {
    const createPending = await request(app)
      .post(`/api/v1/courses/${courseAId}/sources`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ type: "text", raw_text: "cancel me" });

    const deletePending = await request(app)
      .delete(
        `/api/v1/courses/${courseAId}/sources/${createPending.body.id}`,
      )
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(deletePending.status).toBe(200);
    expect(deletePending.body).toEqual({
      id: createPending.body.id,
      status: "cancelled",
    });

    const createProcessing = await request(app)
      .post(`/api/v1/courses/${courseAId}/sources`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ type: "text", raw_text: "processing cancel" });

    const serviceClient = getServiceSupabaseClient();
    await serviceClient
      .from("sources")
      .update({ status: "processing" })
      .eq("id", createProcessing.body.id);

    const deleteProcessing = await request(app)
      .delete(
        `/api/v1/courses/${courseAId}/sources/${createProcessing.body.id}`,
      )
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(deleteProcessing.status).toBe(200);
    expect(deleteProcessing.body.status).toBe("cancelled");
  });

  it("blocks cross-user source deletion", async () => {
    const createB = await request(app)
      .post(`/api/v1/courses/${courseBId}/sources`)
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .send({ type: "text", raw_text: "belongs to B" });

    const deleteForeign = await request(app)
      .delete(`/api/v1/courses/${courseBId}/sources/${createB.body.id}`)
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(deleteForeign.status).toBe(404);
    expect(deleteForeign.body.error.code).toBe("COURSE_NOT_FOUND");
  });

  it("retries failed_permanent sources and rejects invalid retry states", async () => {
    const createSource = await request(app)
      .post(`/api/v1/courses/${courseAId}/sources`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ type: "text", raw_text: "retry me" });

    const serviceClient = getServiceSupabaseClient();
    await serviceClient
      .from("sources")
      .update({ status: "failed_permanent", attempt_count: 4 })
      .eq("id", createSource.body.id);

    const retryOk = await request(app)
      .post(
        `/api/v1/courses/${courseAId}/sources/${createSource.body.id}/retry`,
      )
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(retryOk.status).toBe(200);
    expect(retryOk.body).toEqual({
      id: createSource.body.id,
      status: INITIAL_SOURCE_STATUS,
    });

    const retryInvalid = await request(app)
      .post(
        `/api/v1/courses/${courseAId}/sources/${createSource.body.id}/retry`,
      )
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(retryInvalid.status).toBe(400);
    expect(retryInvalid.body.error.code).toBe("INVALID_STATE");
  });
});
