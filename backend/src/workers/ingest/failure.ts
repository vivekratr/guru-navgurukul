import {
  AllModelsExhaustedError,
  ConfigurationError,
} from "../../lib/llm/index.js";

export type FailureClassification = {
  retryable: boolean;
  message: string;
};

export function classifyIngestFailure(error: unknown): FailureClassification {
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
      message.includes("storage_path") ||
      message.includes("Unsupported source type") ||
      message.includes("missing raw_text") ||
      message.includes("INVALID_CHUNKS")
    ) {
      return { retryable: false, message };
    }

    return { retryable: true, message };
  }

  return {
    retryable: true,
    message: "Unknown ingestion failure",
  };
}
