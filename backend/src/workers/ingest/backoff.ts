import { MAX_ATTEMPTS, RETRY_BACKOFF_SECONDS } from "./constants.js";

export function getRetryBackoffSeconds(attemptCount: number): number {
  const index = Math.max(
    0,
    Math.min(attemptCount - 1, RETRY_BACKOFF_SECONDS.length - 1),
  );
  return RETRY_BACKOFF_SECONDS[index] ?? RETRY_BACKOFF_SECONDS.at(-1) ?? 300;
}

export function isPermanentFailure(attemptCount: number): boolean {
  return attemptCount >= MAX_ATTEMPTS;
}
