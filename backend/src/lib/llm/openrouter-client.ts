import {
  ConfigurationError,
  ProviderError,
  RateLimitError,
  TimeoutError,
} from "./errors.js";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  OpenRouterClient,
} from "./types.js";

const OPENROUTER_CHAT_COMPLETIONS_URL =
  "https://openrouter.ai/api/v1/chat/completions";

type OpenRouterChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.message.includes("aborted"))
  );
}

export function createOpenRouterClient(apiKey: string): OpenRouterClient {
  return {
    async chatCompletion(
      request: ChatCompletionRequest,
    ): Promise<ChatCompletionResponse> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), request.timeout_ms);

      try {
        const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: request.model,
            messages: request.messages,
            max_tokens: request.max_tokens,
          }),
          signal: controller.signal,
        });

        if (response.status === 401 || response.status === 403) {
          throw new ConfigurationError(
            `OpenRouter authentication failed with status ${response.status}`,
          );
        }

        if (response.status === 429) {
          throw new RateLimitError(
            `OpenRouter rate limit reached for model ${request.model}`,
          );
        }

        if (response.status >= 500) {
          throw new ProviderError(
            `OpenRouter server error (${response.status}) for model ${request.model}`,
            response.status,
          );
        }

        if (!response.ok) {
          throw new ProviderError(
            `OpenRouter request failed (${response.status}) for model ${request.model}`,
            response.status,
          );
        }

        const body = (await response.json()) as OpenRouterChatResponse;
        const content = body.choices?.[0]?.message?.content;

        if (typeof content !== "string" || content.length === 0) {
          throw new ProviderError(
            `OpenRouter returned empty content for model ${request.model}`,
          );
        }

        return { content };
      } catch (error) {
        if (error instanceof ConfigurationError) {
          throw error;
        }

        if (error instanceof RateLimitError) {
          throw error;
        }

        if (error instanceof ProviderError) {
          throw error;
        }

        if (isAbortError(error)) {
          throw new TimeoutError(
            `OpenRouter request timed out after ${request.timeout_ms}ms for model ${request.model}`,
          );
        }

        const message =
          error instanceof Error ? error.message : "Unknown OpenRouter error";
        throw new ProviderError(
          `OpenRouter network failure for model ${request.model}: ${message}`,
        );
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
