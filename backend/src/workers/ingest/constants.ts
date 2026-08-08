export const INGEST_QUEUE_NAME = "ingest_source";
export const EXTRACT_KNOWLEDGE_QUEUE_NAME = "extract_knowledge";
export const MAX_ATTEMPTS = 4;
export const INGEST_BATCH_SIZE = 5;
export const RETRY_BACKOFF_SECONDS = [10, 60, 300] as const;

export const TERMINAL_SOURCE_STATUSES = [
  "done",
  "failed_permanent",
  "cancelled",
] as const;

export const SKIPPABLE_SOURCE_STATUSES = [
  "done",
  "cancelled",
  "failed_permanent",
] as const;
