import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { env } from "../../config/index.js";
import { getServiceSupabaseClient } from "../../lib/supabase.js";
import {
  createTestIdentity,
  deleteTestIdentity,
  type TestIdentity,
} from "../../test/helpers.js";

const hasSupabaseAuthConfig = Boolean(
  env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY,
);

type SeededCourse = {
  id: string;
  title: string;
};

async function seedCourse(
  userId: string,
  title: string,
  status: string,
  options?: {
    sources?: Array<{ type: string; status: string; last_error?: string | null }>;
    artifactStatuses?: Array<{ artifact_type: string; status: string }>;
    summaries?: Array<{ kind: string; content: string }>;
    flashcards?: Array<{
      front: string;
      back: string;
      concept_id?: string | null;
    }>;
    concepts?: Array<{
      name: string;
      difficulty: string;
      relationships?: Array<{
        targetIndex: number;
        type: string;
      }>;
    }>;
  },
): Promise<SeededCourse> {
  const serviceClient = getServiceSupabaseClient();

  const { data: course, error: courseError } = await serviceClient
    .from("courses")
    .insert({ user_id: userId, title, status })
    .select("id, title")
    .single();

  if (courseError || !course) {
    throw courseError ?? new Error("Failed to seed course");
  }

  if (options?.sources) {
    const { error } = await serviceClient.from("sources").insert(
      options.sources.map((source) => ({
        course_id: course.id,
        type: source.type,
        status: source.status,
        last_error: source.last_error ?? null,
        raw_text: source.type === "text" ? "seed text" : null,
      })),
    );

    if (error) {
      throw error;
    }
  }

  if (options?.artifactStatuses) {
    const { error } = await serviceClient
      .from("artifact_generation_status")
      .insert(
        options.artifactStatuses.map((row) => ({
          course_id: course.id,
          artifact_type: row.artifact_type,
          status: row.status,
        })),
      );

    if (error) {
      throw error;
    }
  }

  let conceptIds: string[] = [];

  if (options?.concepts) {
    const { data: concepts, error } = await serviceClient
      .from("concepts")
      .insert(
        options.concepts.map((concept) => ({
          course_id: course.id,
          name: concept.name,
          difficulty: concept.difficulty,
        })),
      )
      .select("id");

    if (error || !concepts) {
      throw error ?? new Error("Failed to seed concepts");
    }

    conceptIds = concepts.map((concept) => concept.id);

    const relationships = options.concepts.flatMap((concept, index) =>
      (concept.relationships ?? []).map((relationship) => ({
        course_id: course.id,
        source_concept_id: conceptIds[index]!,
        target_concept_id: conceptIds[relationship.targetIndex]!,
        type: relationship.type,
      })),
    );

    if (relationships.length > 0) {
      const { error: relationshipError } = await serviceClient
        .from("concept_relationships")
        .insert(relationships);

      if (relationshipError) {
        throw relationshipError;
      }
    }
  }

  if (options?.summaries) {
    const { error } = await serviceClient.from("summaries").insert(
      options.summaries.map((summary) => ({
        course_id: course.id,
        kind: summary.kind,
        content: summary.content,
      })),
    );

    if (error) {
      throw error;
    }
  }

  if (options?.flashcards) {
    const { error } = await serviceClient.from("flashcards").insert(
      options.flashcards.map((card, index) => ({
        course_id: course.id,
        front: card.front,
        back: card.back,
        concept_id:
          card.concept_id === undefined
            ? conceptIds[index] ?? null
            : card.concept_id,
      })),
    );

    if (error) {
      throw error;
    }
  }

  return course;
}

async function snapshotCourseState(courseId: string) {
  const serviceClient = getServiceSupabaseClient();

  const [
    { data: course },
    { data: sources },
    { data: artifacts },
    { data: concepts },
    { data: flashcards },
    { data: summaries },
    { count: queueCount },
  ] = await Promise.all([
    serviceClient.from("courses").select("*").eq("id", courseId).single(),
    serviceClient.from("sources").select("*").eq("course_id", courseId),
    serviceClient
      .from("artifact_generation_status")
      .select("*")
      .eq("course_id", courseId),
    serviceClient.from("concepts").select("*").eq("course_id", courseId),
    serviceClient.from("flashcards").select("*").eq("course_id", courseId),
    serviceClient.from("summaries").select("*").eq("course_id", courseId),
    serviceClient
      .from("job_log")
      .select("*", { count: "exact", head: true })
      .contains("payload", { course_id: courseId }),
  ]);

  return JSON.stringify({
    course,
    sources,
    artifacts,
    concepts,
    flashcards,
    summaries,
    queueCount,
  });
}

describe.skipIf(!hasSupabaseAuthConfig)("API read layer", () => {
  const app = createApp();
  let userA: TestIdentity;
  let userB: TestIdentity;
  const courseIds: string[] = [];

  let draftCourse: SeededCourse;
  let ingestingCourse: SeededCourse;
  let extractingCourse: SeededCourse;
  let generatingCourse: SeededCourse;
  let readyCourse: SeededCourse;
  let partialCourse: SeededCourse;
  let readArtifactsCourse: SeededCourse;
  let conceptAId: string;
  let conceptBId: string;
  let flashcardAId: string;
  let flashcardBId: string;

  beforeAll(async () => {
    userA = await createTestIdentity("read-user-a");
    userB = await createTestIdentity("read-user-b");

    draftCourse = await seedCourse(userA.id, "Draft Course", "draft", {
      sources: [{ type: "text", status: "pending" }],
      artifactStatuses: [
        { artifact_type: "flashcards", status: "pending" },
        { artifact_type: "summary", status: "pending" },
      ],
    });

    ingestingCourse = await seedCourse(userA.id, "Ingesting Course", "ingesting", {
      sources: [
        { type: "doc", status: "done" },
        { type: "video", status: "processing" },
      ],
    });

    extractingCourse = await seedCourse(
      userA.id,
      "Extracting Course",
      "extracting_knowledge",
      {
        sources: [{ type: "text", status: "done" }],
      },
    );

    generatingCourse = await seedCourse(
      userA.id,
      "Generating Course",
      "generating_artifacts",
      {
        sources: [{ type: "text", status: "done" }],
        artifactStatuses: [
          { artifact_type: "flashcards", status: "processing" },
          { artifact_type: "summary", status: "done" },
        ],
        summaries: [
          { kind: "short", content: "Short while generating" },
          { kind: "detailed", content: "Detailed while generating" },
        ],
        concepts: [
          { name: "Hooks", difficulty: "beginner" },
          { name: "State", difficulty: "intermediate" },
        ],
      },
    );

    readyCourse = await seedCourse(userA.id, "Ready Course", "ready", {
      artifactStatuses: [
        { artifact_type: "flashcards", status: "done" },
        { artifact_type: "summary", status: "done" },
      ],
      summaries: [
        { kind: "short", content: "Ready short" },
        { kind: "detailed", content: "Ready detailed" },
      ],
      flashcards: [
        { front: "Ready Q1", back: "Ready A1", concept_id: null },
        { front: "Ready Q2", back: "Ready A2", concept_id: null },
      ],
      concepts: [{ name: "Ready Concept", difficulty: "beginner" }],
    });

    partialCourse = await seedCourse(
      userA.id,
      "Partial Course",
      "partially_ready",
      {
        artifactStatuses: [
          { artifact_type: "flashcards", status: "done" },
          { artifact_type: "summary", status: "failed_permanent" },
        ],
        summaries: [
          { kind: "short", content: "Should not be returned" },
          { kind: "detailed", content: "Should not be returned" },
        ],
        flashcards: [{ front: "Partial Q", back: "Partial A", concept_id: null }],
        concepts: [{ name: "Partial Concept", difficulty: "advanced" }],
      },
    );

    readArtifactsCourse = await seedCourse(
      userA.id,
      'Course "Export" / Test',
      "ready",
      {
        artifactStatuses: [
          { artifact_type: "flashcards", status: "done" },
          { artifact_type: "summary", status: "done" },
        ],
        summaries: [
          { kind: "short", content: "Export short" },
          { kind: "detailed", content: "Export detailed" },
        ],
        concepts: [
          {
            name: "Alpha",
            difficulty: "beginner",
            relationships: [{ targetIndex: 1, type: "prerequisite" }],
          },
          { name: "Beta", difficulty: "intermediate" },
        ],
        flashcards: [
          { front: 'What is "Alpha"?', back: "First\nconcept", concept_id: null },
          { front: "No concept", back: "Still valid", concept_id: null },
        ],
      },
    );

    const serviceClient = getServiceSupabaseClient();
    const { data: concepts } = await serviceClient
      .from("concepts")
      .select("id")
      .eq("course_id", readArtifactsCourse.id)
      .order("created_at", { ascending: true });

    conceptAId = concepts![0]!.id;
    conceptBId = concepts![1]!.id;

    await serviceClient
      .from("flashcards")
      .update({ concept_id: conceptAId })
      .eq("course_id", readArtifactsCourse.id)
      .eq("front", 'What is "Alpha"?');

    const { data: flashcards } = await serviceClient
      .from("flashcards")
      .select("id, front")
      .eq("course_id", readArtifactsCourse.id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    flashcardAId =
      flashcards!.find((card) => card.front === 'What is "Alpha"?')!.id;
    flashcardBId =
      flashcards!.find((card) => card.front === "No concept")!.id;

    const foreignCourse = await seedCourse(userB.id, "Foreign Course", "ready", {
      artifactStatuses: [
        { artifact_type: "flashcards", status: "done" },
        { artifact_type: "summary", status: "done" },
      ],
      summaries: [
        { kind: "short", content: "Foreign short" },
        { kind: "detailed", content: "Foreign detailed" },
      ],
      flashcards: [{ front: "Foreign", back: "Secret", concept_id: null }],
      concepts: [{ name: "Foreign Concept", difficulty: "beginner" }],
    });

    courseIds.push(
      draftCourse.id,
      ingestingCourse.id,
      extractingCourse.id,
      generatingCourse.id,
      readyCourse.id,
      partialCourse.id,
      readArtifactsCourse.id,
      foreignCourse.id,
    );
  });

  afterAll(async () => {
    const serviceClient = getServiceSupabaseClient();
    await serviceClient.from("courses").delete().in("id", courseIds);
    await deleteTestIdentity(userA.id);
    await deleteTestIdentity(userB.id);
  });

  it("returns course detail snapshots across lifecycle states", async () => {
    const draft = await request(app)
      .get(`/api/v1/courses/${draftCourse.id}`)
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(draft.status).toBe(200);
    expect(draft.body.status).toBe("draft");
    expect(draft.body.sources).toEqual([
      expect.objectContaining({ type: "text", status: "pending", last_error: null }),
    ]);
    expect(draft.body.artifact_status).toEqual({
      flashcards: "pending",
      summary: "pending",
    });

    const ingesting = await request(app)
      .get(`/api/v1/courses/${ingestingCourse.id}`)
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(ingesting.body.status).toBe("ingesting");
    expect(ingesting.body.sources).toHaveLength(2);

    const extracting = await request(app)
      .get(`/api/v1/courses/${extractingCourse.id}`)
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(extracting.body.status).toBe("extracting_knowledge");

    const generating = await request(app)
      .get(`/api/v1/courses/${generatingCourse.id}`)
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(generating.body.status).toBe("generating_artifacts");
    expect(generating.body.artifact_status).toEqual({
      flashcards: "processing",
      summary: "done",
    });

    const ready = await request(app)
      .get(`/api/v1/courses/${readyCourse.id}`)
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(ready.body.status).toBe("ready");

    const partial = await request(app)
      .get(`/api/v1/courses/${partialCourse.id}`)
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(partial.body.status).toBe("partially_ready");
    expect(partial.body.artifact_status).toEqual({
      flashcards: "done",
      summary: "failed_permanent",
    });
  });

  it("lists courses without artifact bodies", async () => {
    const response = await request(app)
      .get("/api/v1/courses")
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.courses[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        title: expect.any(String),
        status: expect.any(String),
        updated_at: expect.any(String),
      }),
    );
    expect(response.body.courses[0]).not.toHaveProperty("sources");
    expect(response.body.courses[0]).not.toHaveProperty("artifact_status");
  });

  it("blocks cross-user reads with COURSE_NOT_FOUND", async () => {
    const endpoints = [
      `/api/v1/courses/${partialCourse.id}`,
      `/api/v1/courses/${partialCourse.id}/summary`,
      `/api/v1/courses/${partialCourse.id}/flashcards`,
      `/api/v1/courses/${partialCourse.id}/concept-graph`,
      `/api/v1/courses/${partialCourse.id}/flashcards/export?format=json`,
      `/api/v1/courses/${partialCourse.id}/flashcards/export?format=csv`,
    ];

    for (const endpoint of endpoints) {
      const response = await request(app)
        .get(endpoint)
        .set("Authorization", `Bearer ${userB.accessToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("COURSE_NOT_FOUND");
      expect(response.body).not.toHaveProperty("title");
      expect(response.body).not.toHaveProperty("flashcards");
      expect(response.body).not.toHaveProperty("nodes");
    }
  });

  it("returns summary when generated", async () => {
    const response = await request(app)
      .get(`/api/v1/courses/${readArtifactsCourse.id}/summary`)
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      short: "Export short",
      detailed: "Export detailed",
    });
    expect(response.body).not.toHaveProperty("created_at");
  });

  it("rejects unavailable summary states", async () => {
    const generating = await request(app)
      .get(`/api/v1/courses/${generatingCourse.id}/summary`)
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(generating.status).toBe(200);

    const draft = await request(app)
      .get(`/api/v1/courses/${draftCourse.id}/summary`)
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(draft.status).toBe(400);
    expect(draft.body.error.code).toBe("INVALID_STATE");
    expect(draft.body.error.retryable).toBe(true);

    const partialSummary = await request(app)
      .get(`/api/v1/courses/${partialCourse.id}/summary`)
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(partialSummary.status).toBe(400);
    expect(partialSummary.body.error.code).toBe("INVALID_STATE");
    expect(partialSummary.body.error.retryable).toBe(false);
  });

  it("returns flashcards with deterministic ordering and nullable concept_id", async () => {
    const response = await request(app)
      .get(`/api/v1/courses/${readArtifactsCourse.id}/flashcards`)
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.flashcards).toHaveLength(2);
    expect(response.body.flashcards).toEqual(
      expect.arrayContaining([
        {
          id: flashcardAId,
          concept_id: conceptAId,
          front: 'What is "Alpha"?',
          back: "First\nconcept",
        },
        {
          id: flashcardBId,
          concept_id: null,
          front: "No concept",
          back: "Still valid",
        },
      ]),
    );
    expect(response.body.flashcards[0]!.id < response.body.flashcards[1]!.id).toBe(
      true,
    );
  });

  it("allows flashcards when summary failed in partially_ready", async () => {
    const response = await request(app)
      .get(`/api/v1/courses/${partialCourse.id}/flashcards`)
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.flashcards).toHaveLength(1);
  });

  it("rejects flashcards while still processing", async () => {
    const response = await request(app)
      .get(`/api/v1/courses/${generatingCourse.id}/flashcards`)
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_STATE");
    expect(response.body.error.retryable).toBe(true);
  });

  it("returns concept graph nodes and edges", async () => {
    const response = await request(app)
      .get(`/api/v1/courses/${readArtifactsCourse.id}/concept-graph`)
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.nodes).toEqual([
      { id: conceptAId, name: "Alpha", difficulty: "beginner" },
      { id: conceptBId, name: "Beta", difficulty: "intermediate" },
    ]);
    expect(response.body.edges).toEqual([
      { from: conceptAId, to: conceptBId, type: "prerequisite" },
    ]);
  });

  it("rejects concept graph before knowledge extraction completes", async () => {
    const response = await request(app)
      .get(`/api/v1/courses/${extractingCourse.id}/concept-graph`)
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_STATE");
    expect(response.body.error.retryable).toBe(true);
  });

  it("exports flashcards as JSON with download headers", async () => {
    const response = await request(app)
      .get(
        `/api/v1/courses/${readArtifactsCourse.id}/flashcards/export?format=json`,
      )
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.headers["content-disposition"]).toContain("attachment");
    expect(response.headers["content-disposition"]).toContain(
      "Course-Export-Test-flashcards.json",
    );

    expect(response.body.flashcards).toHaveLength(2);
    expect(response.body.flashcards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: flashcardAId,
          concept_id: conceptAId,
          front: 'What is "Alpha"?',
          back: "First\nconcept",
        }),
      ]),
    );
  });

  it("exports flashcards as CSV with escaped values and concept names", async () => {
    const response = await request(app)
      .get(
        `/api/v1/courses/${readArtifactsCourse.id}/flashcards/export?format=csv`,
      )
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/text\/csv/);
    expect(response.headers["content-disposition"]).toContain(
      "Course-Export-Test-flashcards.csv",
    );

    const csv = response.text.trim();
    expect(csv.startsWith("front,back,concept\n")).toBe(true);
    expect(csv).toContain('"What is ""Alpha""?","First\nconcept",Alpha');
    expect(csv).toContain("No concept,Still valid,");
  });

  it("validates export format and course id", async () => {
    const invalidFormat = await request(app)
      .get(
        `/api/v1/courses/${readArtifactsCourse.id}/flashcards/export?format=xml`,
      )
      .set("Authorization", `Bearer ${userA.accessToken}`);

    const invalidCourseId = await request(app)
      .get("/api/v1/courses/not-a-uuid/flashcards")
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(invalidFormat.status).toBe(400);
    expect(invalidFormat.body.error.code).toBe("VALIDATION_ERROR");
    expect(invalidCourseId.status).toBe(400);
    expect(invalidCourseId.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("does not mutate durable state on GET requests", async () => {
    const before = await snapshotCourseState(readArtifactsCourse.id);

    await request(app)
      .get(`/api/v1/courses/${readArtifactsCourse.id}`)
      .set("Authorization", `Bearer ${userA.accessToken}`);
    await request(app)
      .get(`/api/v1/courses/${readArtifactsCourse.id}/summary`)
      .set("Authorization", `Bearer ${userA.accessToken}`);
    await request(app)
      .get(`/api/v1/courses/${readArtifactsCourse.id}/flashcards`)
      .set("Authorization", `Bearer ${userA.accessToken}`);
    await request(app)
      .get(`/api/v1/courses/${readArtifactsCourse.id}/concept-graph`)
      .set("Authorization", `Bearer ${userA.accessToken}`);
    await request(app)
      .get(
        `/api/v1/courses/${readArtifactsCourse.id}/flashcards/export?format=csv`,
      )
      .set("Authorization", `Bearer ${userA.accessToken}`);

    const after = await snapshotCourseState(readArtifactsCourse.id);
    expect(after).toBe(before);
  });

  it("requires authentication for read endpoints", async () => {
    const response = await request(app).get(
      `/api/v1/courses/${readyCourse.id}/flashcards`,
    );

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });
});

describe("read layer has no LLM imports", () => {
  it("read-service does not import call-role", async () => {
    const module = await import("../../services/read-service.js");
    expect(module).not.toHaveProperty("callRole");
  });
});
