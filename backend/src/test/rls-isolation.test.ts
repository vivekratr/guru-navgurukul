import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { env } from "../config/index.js";
import {
  createUserSupabaseClient,
  getAnonSupabaseClient,
  getServiceSupabaseClient,
} from "../lib/supabase.js";

const hasSupabaseAuthConfig = Boolean(
  env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY,
);

type TestIdentity = {
  id: string;
  email: string;
  password: string;
  accessToken: string;
};

type TestCourse = {
  id: string;
  title: string;
};

type TestFixture = {
  userA: TestIdentity;
  userB: TestIdentity;
  courseA: TestCourse;
  courseB: TestCourse;
  sourceBId: string;
  chunkBId: string;
  conceptBId: string;
  relationshipBId: string;
  flashcardBId: string;
  summaryBId: string;
};

async function createTestIdentity(
  label: string,
  serviceClient: ReturnType<typeof getServiceSupabaseClient>,
): Promise<TestIdentity> {
  const email = `${label}-${crypto.randomUUID()}@example.com`;
  const password = `Test-${crypto.randomUUID()}`;

  const { data: createdUser, error: createError } =
    await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (createError || !createdUser.user) {
    throw createError ?? new Error(`Failed to create ${label}`);
  }

  const signInClient = getAnonSupabaseClient();
  const { data: signInData, error: signInError } =
    await signInClient.auth.signInWithPassword({
      email,
      password,
    });

  if (signInError || !signInData.session?.access_token) {
    throw signInError ?? new Error(`Failed to sign in ${label}`);
  }

  return {
    id: createdUser.user.id,
    email,
    password,
    accessToken: signInData.session.access_token,
  };
}

async function createCourse(
  client: ReturnType<typeof createUserSupabaseClient>,
  title: string,
  userId: string,
): Promise<TestCourse> {
  const { data, error } = await client
    .from("courses")
    .insert({ title, user_id: userId })
    .select("id, title")
    .single();

  if (error || !data) {
    throw error ?? new Error(`Failed to create course ${title}`);
  }

  return data;
}

describe.skipIf(!hasSupabaseAuthConfig)("RLS isolation", () => {
  let fixture: TestFixture;
  const serviceClient = getServiceSupabaseClient();

  beforeAll(async () => {
    const userA = await createTestIdentity("user-a", serviceClient);
    const userB = await createTestIdentity("user-b", serviceClient);

    const clientA = createUserSupabaseClient(userA.accessToken);
    const clientB = createUserSupabaseClient(userB.accessToken);

    const courseA = await createCourse(clientA, "Course A", userA.id);
    const courseB = await createCourse(clientB, "Course B", userB.id);

    const { data: sourceB, error: sourceError } = await serviceClient
      .from("sources")
      .insert({
        course_id: courseB.id,
        type: "text",
        title: "Source B",
        raw_text: "B content",
      })
      .select("id")
      .single();

    if (sourceError || !sourceB) {
      throw sourceError ?? new Error("Failed to seed source B");
    }

    const { data: chunkB, error: chunkError } = await serviceClient
      .from("source_chunks")
      .insert({
        source_id: sourceB.id,
        course_id: courseB.id,
        text: "Chunk B",
        position: 1,
      })
      .select("id")
      .single();

    if (chunkError || !chunkB) {
      throw chunkError ?? new Error("Failed to seed chunk B");
    }

    const { data: conceptB, error: conceptError } = await serviceClient
      .from("concepts")
      .insert({
        course_id: courseB.id,
        name: "Concept B",
      })
      .select("id")
      .single();

    if (conceptError || !conceptB) {
      throw conceptError ?? new Error("Failed to seed concept B");
    }

    const { data: relationshipB, error: relationshipError } = await serviceClient
      .from("concept_relationships")
      .insert({
        course_id: courseB.id,
        source_concept_id: conceptB.id,
        target_concept_id: conceptB.id,
        type: "related",
      })
      .select("id")
      .single();

    if (relationshipError || !relationshipB) {
      throw relationshipError ?? new Error("Failed to seed relationship B");
    }

    const { data: flashcardB, error: flashcardError } = await serviceClient
      .from("flashcards")
      .insert({
        course_id: courseB.id,
        concept_id: conceptB.id,
        front: "Front B",
        back: "Back B",
      })
      .select("id")
      .single();

    if (flashcardError || !flashcardB) {
      throw flashcardError ?? new Error("Failed to seed flashcard B");
    }

    const { data: summaryB, error: summaryError } = await serviceClient
      .from("summaries")
      .insert({
        course_id: courseB.id,
        kind: "short",
        content: "Summary B",
      })
      .select("id")
      .single();

    if (summaryError || !summaryB) {
      throw summaryError ?? new Error("Failed to seed summary B");
    }

    const { error: artifactStatusError } = await serviceClient
      .from("artifact_generation_status")
      .insert({
        course_id: courseB.id,
        artifact_type: "flashcards",
        status: "pending",
      });

    if (artifactStatusError) {
      throw artifactStatusError;
    }

    fixture = {
      userA,
      userB,
      courseA,
      courseB,
      sourceBId: sourceB.id,
      chunkBId: chunkB.id,
      conceptBId: conceptB.id,
      relationshipBId: relationshipB.id,
      flashcardBId: flashcardB.id,
      summaryBId: summaryB.id,
    };
  });

  afterAll(async () => {
    if (!fixture) {
      return;
    }

    await serviceClient.from("courses").delete().eq("id", fixture.courseA.id);
    await serviceClient.from("courses").delete().eq("id", fixture.courseB.id);
    await serviceClient.auth.admin.deleteUser(fixture.userA.id);
    await serviceClient.auth.admin.deleteUser(fixture.userB.id);
  });

  it("lets each user read their own course", async () => {
    const clientA = createUserSupabaseClient(fixture.userA.accessToken);
    const clientB = createUserSupabaseClient(fixture.userB.accessToken);

    const { data: courseA, error: courseAError } = await clientA
      .from("courses")
      .select("id")
      .eq("id", fixture.courseA.id)
      .maybeSingle();

    const { data: courseB, error: courseBError } = await clientB
      .from("courses")
      .select("id")
      .eq("id", fixture.courseB.id)
      .maybeSingle();

    expect(courseAError).toBeNull();
    expect(courseBError).toBeNull();
    expect(courseA?.id).toBe(fixture.courseA.id);
    expect(courseB?.id).toBe(fixture.courseB.id);
  });

  it("hides another user's course from SELECT", async () => {
    const clientA = createUserSupabaseClient(fixture.userA.accessToken);
    const clientB = createUserSupabaseClient(fixture.userB.accessToken);

    const { data: crossA, error: crossAError } = await clientA
      .from("courses")
      .select("id")
      .eq("id", fixture.courseB.id)
      .maybeSingle();

    const { data: crossB, error: crossBError } = await clientB
      .from("courses")
      .select("id")
      .eq("id", fixture.courseA.id)
      .maybeSingle();

    expect(crossAError).toBeNull();
    expect(crossBError).toBeNull();
    expect(crossA).toBeNull();
    expect(crossB).toBeNull();
  });

  it("blocks UPDATE and DELETE across users", async () => {
    const clientA = createUserSupabaseClient(fixture.userA.accessToken);
    const clientB = createUserSupabaseClient(fixture.userB.accessToken);

    const { data: updateA, error: updateAError } = await clientA
      .from("courses")
      .update({ title: "Hijacked by A" })
      .eq("id", fixture.courseB.id)
      .select("id");

    const { data: deleteB, error: deleteBError } = await clientB
      .from("courses")
      .delete()
      .eq("id", fixture.courseA.id)
      .select("id");

    expect(updateAError).toBeNull();
    expect(deleteBError).toBeNull();
    expect(updateA).toEqual([]);
    expect(deleteB).toEqual([]);
  });

  it("blocks descendant access across users", async () => {
    const clientA = createUserSupabaseClient(fixture.userA.accessToken);

    const checks = await Promise.all([
      clientA
        .from("sources")
        .select("id")
        .eq("id", fixture.sourceBId)
        .maybeSingle(),
      clientA
        .from("source_chunks")
        .select("id")
        .eq("id", fixture.chunkBId)
        .maybeSingle(),
      clientA
        .from("concepts")
        .select("id")
        .eq("id", fixture.conceptBId)
        .maybeSingle(),
      clientA
        .from("concept_relationships")
        .select("id")
        .eq("id", fixture.relationshipBId)
        .maybeSingle(),
      clientA
        .from("flashcards")
        .select("id")
        .eq("id", fixture.flashcardBId)
        .maybeSingle(),
      clientA
        .from("summaries")
        .select("id")
        .eq("id", fixture.summaryBId)
        .maybeSingle(),
      clientA
        .from("artifact_generation_status")
        .select("course_id")
        .eq("course_id", fixture.courseB.id)
        .maybeSingle(),
    ]);

    for (const { data, error } of checks) {
      expect(error).toBeNull();
      expect(data).toBeNull();
    }
  });
});
