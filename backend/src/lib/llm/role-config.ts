import { z } from "zod";

import { ConfigurationError } from "./errors.js";
import { MODEL_ROLES, type ModelRole, type RoleConfig } from "./types.js";

const roleConfigSchema = z.object({
  role: z.enum(MODEL_ROLES),
  chain: z.array(z.string().min(1)).min(1),
  max_tokens: z.number().int().positive(),
  timeout_ms: z.number().int().positive(),
});

type ModelRoleRow = {
  role: string;
  chain: unknown;
  max_tokens: number;
  timeout_ms: number;
};

export function isModelRole(value: string): value is ModelRole {
  return (MODEL_ROLES as readonly string[]).includes(value);
}

export function parseRoleConfig(row: ModelRoleRow): RoleConfig {
  const chain = Array.isArray(row.chain)
    ? row.chain.filter((item): item is string => typeof item === "string")
    : [];

  const result = roleConfigSchema.safeParse({
    role: row.role,
    chain,
    max_tokens: row.max_tokens,
    timeout_ms: row.timeout_ms,
  });

  if (!result.success) {
    throw new ConfigurationError(
      `Invalid model_roles configuration for role "${row.role}": ${result.error.message}`,
    );
  }

  return result.data;
}
