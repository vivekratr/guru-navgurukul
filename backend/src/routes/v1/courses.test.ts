import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { env } from "../../config/index.js";
import { INITIAL_COURSE_STATUS } from "../../lib/course-state.js";
import { getServiceSupabaseClient } from "../../lib/supabase.js";
import {
  createTestIdentity,
  deleteTestIdentity,
  type TestIdentity,
} from "../../test/helpers.js";

const hasSupabaseAuthConfig = Boolean(
  env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY,
);

describe("course endpoints require authentication", () => {
  const app = createApp();

  it("returns 401 for POST /api/v1/courses without a token", async () => {
    const response = await request(app)
      .post("/api/v1/courses")
      .send({ title: "Unauthorized course" });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });
});

describe.skipIf(!hasSupabaseAuthConfig)("course management", () => {
  const app = createApp();
  let userA: TestIdentity;
  let userB: TestIdentity;
  let courseA1Id: string;
  let courseA2Id: string;
  let courseB1Id: string;

  beforeAll(async () => {
    userA = await createTestIdentity("course-user-a");
    userB = await createTestIdentity("course-user-b");

    const createA1 = await request(app)
      .post("/api/v1/courses")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ title: "Course A1" });

    const createA2 = await request(app)
      .post("/api/v1/courses")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ title: "Course A2" });

    const createB1 = await request(app)
      .post("/api/v1/courses")
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .send({ title: "Course B1" });

    courseA1Id = createA1.body.id;
    courseA2Id = createA2.body.id;
    courseB1Id = createB1.body.id;
  });

  afterAll(async () => {
    const serviceClient = getServiceSupabaseClient();
    await serviceClient.from("courses").delete().in("id", [
      courseA1Id,
      courseA2Id,
      courseB1Id,
    ]);
    await deleteTestIdentity(userA.id);
    await deleteTestIdentity(userB.id);
  });

  it("creates a draft course for the authenticated user", async () => {
    const response = await request(app)
      .post("/api/v1/courses")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ title: "New Draft Course" });

    expect(response.status).toBe(201);
    expect(response.body.title).toBe("New Draft Course");
    expect(response.body.status).toBe(INITIAL_COURSE_STATUS);
    expect(response.body.created_at).toBeTruthy();
    expect(response.body.id).toBeTruthy();

    const serviceClient = getServiceSupabaseClient();
    const { data: row } = await serviceClient
      .from("courses")
      .select("user_id")
      .eq("id", response.body.id)
      .single();

    expect(row?.user_id).toBe(userA.id);

    await serviceClient.from("courses").delete().eq("id", response.body.id);
  });

  it("rejects missing or blank titles", async () => {
    const missingTitle = await request(app)
      .post("/api/v1/courses")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({});

    const blankTitle = await request(app)
      .post("/api/v1/courses")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ title: "   " });

    expect(missingTitle.status).toBe(400);
    expect(missingTitle.body.error.code).toBe("VALIDATION_ERROR");
    expect(blankTitle.status).toBe(400);
    expect(blankTitle.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("lists only the authenticated user's courses", async () => {
    const responseA = await request(app)
      .get("/api/v1/courses")
      .set("Authorization", `Bearer ${userA.accessToken}`);

    const responseB = await request(app)
      .get("/api/v1/courses")
      .set("Authorization", `Bearer ${userB.accessToken}`);

    expect(responseA.status).toBe(200);
    expect(responseB.status).toBe(200);

    const idsA = responseA.body.courses.map((course: { id: string }) => course.id);
    const idsB = responseB.body.courses.map((course: { id: string }) => course.id);

    expect(idsA).toEqual(expect.arrayContaining([courseA1Id, courseA2Id]));
    expect(idsA).not.toContain(courseB1Id);
    expect(idsB).toEqual([courseB1Id]);
  });

  it("returns course detail for owned courses with empty nested collections", async () => {
    const response = await request(app)
      .get(`/api/v1/courses/${courseA1Id}`)
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: courseA1Id,
      title: "Course A1",
      status: INITIAL_COURSE_STATUS,
      last_error: null,
      sources: [],
      artifact_status: {},
    });
  });

  it("returns 404 when accessing another user's course", async () => {
    const response = await request(app)
      .get(`/api/v1/courses/${courseB1Id}`)
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("COURSE_NOT_FOUND");
  });

  it("deletes owned courses and blocks cross-user deletion", async () => {
    const createResponse = await request(app)
      .post("/api/v1/courses")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ title: "Delete Me" });

    const deleteOwned = await request(app)
      .delete(`/api/v1/courses/${createResponse.body.id}`)
      .set("Authorization", `Bearer ${userA.accessToken}`);

    const deleteForeign = await request(app)
      .delete(`/api/v1/courses/${courseB1Id}`)
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(deleteOwned.status).toBe(204);
    expect(deleteForeign.status).toBe(404);
    expect(deleteForeign.body.error.code).toBe("COURSE_NOT_FOUND");
  });

  it("cascades dependent rows when a course is deleted", async () => {
    const serviceClient = getServiceSupabaseClient();

    const createResponse = await request(app)
      .post("/api/v1/courses")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ title: "Cascade Course" });

    const courseId = createResponse.body.id;

    const { data: source, error: sourceError } = await serviceClient
      .from("sources")
      .insert({
        course_id: courseId,
        type: "text",
        raw_text: "cascade test",
      })
      .select("id")
      .single();

    expect(sourceError).toBeNull();

    const deleteResponse = await request(app)
      .delete(`/api/v1/courses/${courseId}`)
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(deleteResponse.status).toBe(204);

    const { data: remainingSource } = await serviceClient
      .from("sources")
      .select("id")
      .eq("id", source!.id)
      .maybeSingle();

    expect(remainingSource).toBeNull();
  });
});
