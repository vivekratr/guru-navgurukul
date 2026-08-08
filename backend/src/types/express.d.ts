import type { SupabaseClient } from "@supabase/supabase-js";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string };
      accessToken?: string;
      supabase?: SupabaseClient;
    }
  }
}

export {};
