import type { z } from "zod";

import { env } from "../../config/index.js";
import { getServiceSupabaseClient } from "../supabase.js";
import {
  AllModelsExhaustedError,
  ConfigurationError,
  ProviderError,
  RateLimitError,
  TimeoutError,
} from "./errors.js";
import { loadModelRoleConfig } from "./model-role-repository.js";
import { createOpenRouterClient } from "./openrouter-client.js";
import { parseLlmJson } from "./parse-llm-json.js";
import type {
  CallRoleResult,
  ChatMessage,
  ModelAttemptDiagnostic,
  ModelRole,
  OpenRouterClient,
  RoleConfig,
} from "./types.js";

export type CallRoleParams<T> = {
  role: ModelRole;
  messages: ChatMessage[];
  outputSchema: z.ZodType<T>;
  validateOutput?: (data: T) => string | undefined;
  normalizeParsed?: (parsed: unknown) => unknown;
};

export type CallRoleDependencies = {
  loadRoleConfig: (role: ModelRole) => Promise<RoleConfig>;
  openRouter: OpenRouterClient;
};

function createDefaultDependencies(): CallRoleDependencies {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new ConfigurationError("OPENROUTER_API_KEY is not configured");
  }

  const supabase = getServiceSupabaseClient();

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
  dependencies?: Partial<CallRoleDependencies>,
): CallRoleDependencies {
  if (dependencies?.loadRoleConfig && dependencies.openRouter) {
    return {
      loadRoleConfig: dependencies.loadRoleConfig,
      openRouter: dependencies.openRouter,
    };
  }

  const defaults = createDefaultDependencies();
  return {
    loadRoleConfig: dependencies?.loadRoleConfig ?? defaults.loadRoleConfig,
    openRouter: dependencies?.openRouter ?? defaults.openRouter,
  };
}

export async function callRole<T>(
  params: CallRoleParams<T>,
  dependencies?: Partial<CallRoleDependencies>,
): Promise<CallRoleResult<T>> {
  const resolvedDependencies = resolveDependencies(dependencies);

  const config = await resolvedDependencies.loadRoleConfig(params.role);
  const attempts: ModelAttemptDiagnostic[] = [];

  for (const modelId of config.chain) {
    try {
      const response = await resolvedDependencies.openRouter.chatCompletion({
        model: modelId,
        messages: params.messages,
        max_tokens: config.max_tokens,
        timeout_ms: config.timeout_ms,
        response_format: { type: "json_object" },
      });

      let parsed: unknown;
      try {
        parsed = parseLlmJson(response.content);
        if (params.normalizeParsed) {
          parsed = params.normalizeParsed(parsed);
        }
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
