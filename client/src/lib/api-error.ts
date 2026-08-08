import type { ApiErrorBody } from "@/types/api";

export class ApiClientError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(error: ApiErrorBody["error"]) {
    super(error.message);
    this.name = "ApiClientError";
    this.code = error.code;
    this.retryable = error.retryable;
  }
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  const error = record.error;

  if (!error || typeof error !== "object") {
    return false;
  }

  const errorRecord = error as Record<string, unknown>;

  return (
    typeof errorRecord.code === "string" &&
    typeof errorRecord.message === "string" &&
    typeof errorRecord.retryable === "boolean"
  );
}
