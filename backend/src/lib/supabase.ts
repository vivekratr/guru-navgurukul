import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { env } from "../config/index.js";

let anonClient: SupabaseClient | null = null;
let serviceClient: SupabaseClient | null = null;

function requireSupabaseUrl(): string {
  if (!env.SUPABASE_URL) {
    throw new Error("SUPABASE_URL is required for Supabase client access");
  }
  return env.SUPABASE_URL;
}

export function getAnonSupabaseClient(): SupabaseClient {
  if (!env.SUPABASE_ANON_KEY) {
    throw new Error("SUPABASE_ANON_KEY is required for authenticated API access");
  }

  anonClient ??= createClient(requireSupabaseUrl(), env.SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return anonClient;
}

export function createUserSupabaseClient(accessToken: string): SupabaseClient {
  if (!env.SUPABASE_ANON_KEY) {
    throw new Error("SUPABASE_ANON_KEY is required for authenticated API access");
  }

  return createClient(requireSupabaseUrl(), env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function getServiceSupabaseClient(): SupabaseClient {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required for privileged database access",
    );
  }

  serviceClient ??= createClient(
    requireSupabaseUrl(),
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  return serviceClient;
}
