import {
  AllModelsExhaustedError,
  ConfigurationError,
} from "../../lib/llm/index.js";

export type ArtifactFailureClassification = {
  retryable: boolean;
  message: string;
};

export function classifyArtifactFailure(
  error: unknown,
): ArtifactFailureClassification {
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
      message.includes("NO_CONCEPTS") ||
      message.includes("INVALID_FLASHCARDS") ||
      message.includes("INVALID_SUMMARY")
    ) {
      return { retryable: false, message };
    }

    return { retryable: true, message };
  }

  return {
    retryable: true,
    message: "Unknown artifact generation failure",
  };
}
