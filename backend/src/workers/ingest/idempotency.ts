import {
  SKIPPABLE_SOURCE_STATUSES,
  TERMINAL_SOURCE_STATUSES,
} from "./constants.js";

export type SourceRow = {
  status: string;
};

export type IdempotencyDecision =
  | { action: "skip"; reason: string }
  | { action: "claim" }
  | { action: "resume_processing" };

export function decideIdempotency(source: SourceRow): IdempotencyDecision {
  if (SKIPPABLE_SOURCE_STATUSES.includes(source.status as never)) {
    return { action: "skip", reason: `source already ${source.status}` };
  }

  if (source.status === "processing") {
    return { action: "resume_processing" };
  }

  if (source.status === "pending" || source.status === "failed") {
    return { action: "claim" };
  }

  return { action: "skip", reason: `unsupported source status ${source.status}` };
}

export function isTerminalSourceStatus(status: string): boolean {
  return TERMINAL_SOURCE_STATUSES.includes(status as never);
}
