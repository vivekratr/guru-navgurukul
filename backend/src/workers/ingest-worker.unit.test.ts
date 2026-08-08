import { describe, expect, it } from "vitest";

import { getRetryBackoffSeconds, isPermanentFailure } from "./ingest/backoff.js";
import { classifyIngestFailure } from "./ingest/failure.js";
import { decideIdempotency } from "./ingest/idempotency.js";
import { parseIngestQueueMessage } from "./ingest/message.js";
import { ConfigurationError } from "../lib/llm/index.js";

describe("ingest worker unit logic", () => {
  it("parses valid queue messages", () => {
    const sourceId = "11111111-1111-4111-8111-111111111111";
    expect(parseIngestQueueMessage({ source_id: sourceId })).toEqual({
      source_id: sourceId,
    });
  });

  it("rejects malformed queue messages", () => {
    expect(parseIngestQueueMessage({ source_id: "not-a-uuid" })).toBeNull();
    expect(parseIngestQueueMessage(null)).toBeNull();
  });

  it("calculates retry backoff delays", () => {
    expect(getRetryBackoffSeconds(1)).toBe(10);
    expect(getRetryBackoffSeconds(2)).toBe(60);
    expect(getRetryBackoffSeconds(3)).toBe(300);
    expect(getRetryBackoffSeconds(4)).toBe(300);
  });

  it("marks the fourth attempt as permanent", () => {
    expect(isPermanentFailure(3)).toBe(false);
    expect(isPermanentFailure(4)).toBe(true);
    expect(isPermanentFailure(0)).toBe(false);
    expect(isPermanentFailure(100)).toBe(true);
  });

  it("never returns negative backoff delays", () => {
    for (let attempt = -5; attempt <= 10; attempt += 1) {
      expect(getRetryBackoffSeconds(attempt)).toBeGreaterThanOrEqual(0);
    }
  });

  it("skips done, cancelled, and failed_permanent sources", () => {
    expect(decideIdempotency({ status: "done" }).action).toBe("skip");
    expect(decideIdempotency({ status: "cancelled" }).action).toBe("skip");
    expect(decideIdempotency({ status: "failed_permanent" }).action).toBe(
      "skip",
    );
  });

  it("claims pending and failed sources", () => {
    expect(decideIdempotency({ status: "pending" }).action).toBe("claim");
    expect(decideIdempotency({ status: "failed" }).action).toBe("claim");
  });

  it("resumes processing sources after crash recovery", () => {
    expect(decideIdempotency({ status: "processing" }).action).toBe(
      "resume_processing",
    );
  });

  it("classifies configuration failures as non-retryable", () => {
    const result = classifyIngestFailure(
      new ConfigurationError("OpenRouter authentication failed"),
    );
    expect(result.retryable).toBe(false);
  });
});
