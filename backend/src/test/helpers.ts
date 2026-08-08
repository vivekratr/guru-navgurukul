import {
  getAnonSupabaseClient,
  getServiceSupabaseClient,
} from "../lib/supabase.js";

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
