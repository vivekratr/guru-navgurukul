import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { env } from "../config/index.js";

let serviceClient: SupabaseClient | null = null;

export function getServiceSupabaseClient(): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for database access",
    );
  }

  serviceClient ??= createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return serviceClient;
}
