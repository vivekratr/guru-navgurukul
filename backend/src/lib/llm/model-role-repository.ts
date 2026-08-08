import type { SupabaseClient } from "@supabase/supabase-js";

import { ConfigurationError } from "./errors.js";
import { isModelRole, parseRoleConfig } from "./role-config.js";
import type { ModelRole, RoleConfig } from "./types.js";

export async function loadModelRoleConfig(
  supabase: SupabaseClient,
  role: ModelRole,
): Promise<RoleConfig> {
  if (!isModelRole(role)) {
    throw new ConfigurationError(`Unsupported role: ${role}`);
  }

  const { data, error } = await supabase
    .from("model_roles")
    .select("role, chain, max_tokens, timeout_ms")
    .eq("role", role)
    .maybeSingle();

  if (error) {
    throw new ConfigurationError(
      `Failed to load model_roles for "${role}": ${error.message}`,
    );
  }

  if (!data) {
    throw new ConfigurationError(`Role "${role}" not found in model_roles`);
  }

  return parseRoleConfig(data);
}
