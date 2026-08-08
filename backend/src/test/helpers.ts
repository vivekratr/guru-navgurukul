import {
  getAnonSupabaseClient,
  getServiceSupabaseClient,
} from "../lib/supabase.js";
import request from "supertest";
import { createApp } from "../app.js";

export type TestIdentity = {
  id: string;
  email: string;
  password: string;
  accessToken: string;
};

export async function createTestIdentity(
  label: string,
): Promise<TestIdentity> {
  const serviceClient = getServiceSupabaseClient();
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

export async function deleteTestIdentity(userId: string): Promise<void> {
  const serviceClient = getServiceSupabaseClient();
  await serviceClient.auth.admin.deleteUser(userId);
}

export async function createTestCourse(
  accessToken: string,
  title: string,
): Promise<string> {
  const app = createApp();
  const response = await request(app)
    .post("/api/v1/courses")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title });

  if (response.status !== 201) {
    throw new Error(`Failed to create course: ${response.body?.error?.message}`);
  }

  return response.body.id as string;
}

export async function createTestTextSource(
  accessToken: string,
  courseId: string,
  rawText: string,
): Promise<string> {
  const app = createApp();
  const response = await request(app)
    .post(`/api/v1/courses/${courseId}/sources`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ type: "text", raw_text: rawText });

  if (response.status !== 201) {
    throw new Error(`Failed to create source: ${response.body?.error?.message}`);
  }

  return response.body.id as string;
}

export async function waitForCourseStatus(
  courseId: string,
  expectedStatus: string,
  timeoutMs = 30_000,
): Promise<void> {
  const serviceClient = getServiceSupabaseClient();
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const { data } = await serviceClient
      .from("courses")
      .select("status")
      .eq("id", courseId)
      .single();

    if (data?.status === expectedStatus) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const { data } = await serviceClient
    .from("courses")
    .select("status")
    .eq("id", courseId)
    .single();

  throw new Error(
    `Timed out waiting for course ${courseId} to reach ${expectedStatus}; last status=${data?.status}`,
  );
}
