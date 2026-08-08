import {
  AllModelsExhaustedError,
  ConfigurationError,
} from "../../lib/llm/index.js";

export type KnowledgeFailureClassification = {
  retryable: boolean;
  message: string;
};

export function classifyKnowledgeFailure(
  error: unknown,
): KnowledgeFailureClassification {
  if (error instanceof ConfigurationError) {
    return {
      retryable: false,
      message: error.message,
    };
  }

  if (error instanceof AllModelsExhaustedError) {
    return {
      retryable: true,
      message: error.message,
    };
  }

  if (error instanceof Error) {
    const message = error.message;

    if (
      message.includes("NO_USABLE_CHUNKS") ||
      message.includes("INVALID_CONCEPTS") ||
      message.includes("INVALID_RELATIONSHIPS")
    ) {
      return { retryable: false, message };
    }

    return { retryable: true, message };
  }

  return {
    retryable: true,
    message: "Unknown knowledge extraction failure",
  };
}
