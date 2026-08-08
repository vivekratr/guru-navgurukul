import { describe, expect, it } from "vitest";

import { ConfigurationError } from "../lib/llm/index.js";
import { getRetryBackoffSeconds } from "./ingest/backoff.js";
import { classifyKnowledgeFailure } from "./knowledge/failure.js";
import { decideKnowledgeIdempotency } from "./knowledge/idempotency.js";
import { parseKnowledgeQueueMessage } from "./knowledge/message.js";
import { buildKnowledgeExtractionPrompt } from "./knowledge/prompt.js";

describe("knowledge worker unit logic", () => {
  it("parses valid queue messages", () => {
    const courseId = "11111111-1111-4111-8111-111111111111";
    expect(parseKnowledgeQueueMessage({ course_id: courseId })).toEqual({
      course_id: courseId,
    });
  });

  it("rejects malformed queue messages", () => {
    expect(parseKnowledgeQueueMessage({ course_id: "not-a-uuid" })).toBeNull();
    expect(parseKnowledgeQueueMessage(null)).toBeNull();
  });

  it("skips courses past knowledge extraction", () => {
    expect(
      decideKnowledgeIdempotency({ status: "generating_artifacts" }).action,
    ).toBe("skip");
    expect(decideKnowledgeIdempotency({ status: "ready" }).action).toBe("skip");
    expect(
      decideKnowledgeIdempotency({ status: "knowledge_extraction_failed" })
        .action,
    ).toBe("skip");
  });

  it("claims ingesting courses and resumes extracting_knowledge", () => {
    expect(decideKnowledgeIdempotency({ status: "ingesting" }).action).toBe(
      "claim",
    );
    expect(
      decideKnowledgeIdempotency({ status: "extracting_knowledge" }).action,
    ).toBe("resume_processing");
  });

  it("builds a cross-source prompt in one block", () => {
    const prompt = buildKnowledgeExtractionPrompt("React Basics", [
      {
        sourceIndex: 1,
        sourceTitle: "Hooks",
        heading: "Intro",
        text: "Chunk A1",
        position: 0,
      },
      {
        sourceIndex: 2,
        sourceTitle: "State",
        heading: null,
        text: "Chunk B1",
        position: 0,
      },
    ]);

    expect(prompt).toContain("React Basics");
    expect(prompt).toContain("Source 1: Hooks");
    expect(prompt).toContain("Chunk A1");
    expect(prompt).toContain("Source 2: State");
    expect(prompt).toContain("Chunk B1");
  });

  it("classifies empty chunks as non-retryable", () => {
    const result = classifyKnowledgeFailure(
      new Error("NO_USABLE_CHUNKS: no chunks from done sources"),
    );
    expect(result.retryable).toBe(false);
  });

  it("classifies configuration failures as non-retryable", () => {
    const result = classifyKnowledgeFailure(
      new ConfigurationError("OPENROUTER_API_KEY is not configured"),
    );
    expect(result.retryable).toBe(false);
  });

  it("calculates retry backoff from read count", () => {
    expect(getRetryBackoffSeconds(1)).toBe(10);
    expect(getRetryBackoffSeconds(2)).toBe(60);
    expect(getRetryBackoffSeconds(3)).toBe(300);
  });
});
