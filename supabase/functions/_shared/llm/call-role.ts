import type { z } from "npm:zod@3.24.1";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.47.10";

import {
  AllModelsExhaustedError,
  ConfigurationError,
  ProviderError,
  RateLimitError,
  TimeoutError,
} from "./errors.ts";
import { loadModelRoleConfig } from "./model-role-repository.ts";
import { createOpenRouterClient } from "./openrouter-client.ts";
import type {
  CallRoleResult,
  ChatMessage,
  ModelAttemptDiagnostic,
  ModelRole,
  OpenRouterClient,
  RoleConfig,
} from "./types.ts";

export type CallRoleParams<T> = {
  role: ModelRole;
  messages: ChatMessage[];
  outputSchema: z.ZodType<T>;
  validateOutput?: (data: T) => string | undefined;
};

export type CallRoleDependencies = {
  loadRoleConfig: (role: ModelRole) => Promise<RoleConfig>;
  openRouter: OpenRouterClient;
};

export function createCallRoleDependencies(
  supabase: SupabaseClient,
  apiKey: string,
): CallRoleDependencies {
  if (!apiKey) {
    throw new ConfigurationError("OPENROUTER_API_KEY is not configured");
  }

  return {
    loadRoleConfig: (role) => loadModelRoleConfig(supabase, role),
    openRouter: createOpenRouterClient(apiKey),
  };
}

function recordAttempt(
  attempts: ModelAttemptDiagnostic[],
  model: string,
  outcome: ModelAttemptDiagnostic["outcome"],
  detail?: string,
): void {
  attempts.push({ model, outcome, detail });
}

function classifyProviderFailure(error: unknown): {
  outcome: ModelAttemptDiagnostic["outcome"];
  detail: string;
  rethrow?: ConfigurationError;
} {
  if (error instanceof ConfigurationError) {
    return {
      outcome: "provider_error",
      detail: error.message,
      rethrow: error,
    };
  }

  if (error instanceof RateLimitError) {
    return { outcome: "rate_limited", detail: error.message };
  }

  if (error instanceof TimeoutError) {
    return { outcome: "timeout", detail: error.message };
  }

  if (error instanceof ProviderError) {
    return { outcome: "provider_error", detail: error.message };
  }

  const detail =
    error instanceof Error ? error.message : "Unknown provider failure";
  return { outcome: "provider_error", detail };
}

function resolveDependencies(
  supabase: SupabaseClient,
  apiKey: string,
  dependencies?: Partial<CallRoleDependencies>,
): CallRoleDependencies {
  if (dependencies?.loadRoleConfig && dependencies.openRouter) {
    return {
      loadRoleConfig: dependencies.loadRoleConfig,
      openRouter: dependencies.openRouter,
    };
  }

  const defaults = createCallRoleDependencies(supabase, apiKey);
  return {
    loadRoleConfig: dependencies?.loadRoleConfig ?? defaults.loadRoleConfig,
    openRouter: dependencies?.openRouter ?? defaults.openRouter,
  };
}

export async function callRole<T>(
  supabase: SupabaseClient,
  apiKey: string,
  params: CallRoleParams<T>,
  dependencies?: Partial<CallRoleDependencies>,
): Promise<CallRoleResult<T>> {
  const resolvedDependencies = resolveDependencies(supabase, apiKey, dependencies);
  const config = await resolvedDependencies.loadRoleConfig(params.role);
  const attempts: ModelAttemptDiagnostic[] = [];

  for (const modelId of config.chain) {
    try {
      const response = await resolvedDependencies.openRouter.chatCompletion({
        model: modelId,
        messages: params.messages,
        max_tokens: config.max_tokens,
        timeout_ms: config.timeout_ms,
      });

      let parsed: unknown;
      try {
        parsed = JSON.parse(response.content);
      } catch {
        recordAttempt(attempts, modelId, "invalid_output", "malformed JSON");
        continue;
      }

      const schemaResult = params.outputSchema.safeParse(parsed);
      if (!schemaResult.success) {
        recordAttempt(
          attempts,
          modelId,
          "invalid_output",
          schemaResult.error.message,
        );
        continue;
      }

      if (params.validateOutput) {
        const semanticError = params.validateOutput(schemaResult.data);
        if (semanticError) {
          recordAttempt(attempts, modelId, "invalid_output", semanticError);
          continue;
        }
      }

      return {
        data: schemaResult.data,
        model_used: modelId,
      };
    } catch (error) {
      const failure = classifyProviderFailure(error);
      if (failure.rethrow) {
        throw failure.rethrow;
      }

      recordAttempt(attempts, modelId, failure.outcome, failure.detail);
    }
  }

  throw new AllModelsExhaustedError(params.role, attempts);
}
