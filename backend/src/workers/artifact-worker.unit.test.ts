import { describe, expect, it } from "vitest";

import { ConfigurationError } from "../lib/llm/index.js";
import { classifyArtifactFailure } from "./artifact/failure.js";
import {
  decideArtifactIdempotency,
  isValidCourseStatusForArtifacts,
} from "./artifact/idempotency.js";
import { parseArtifactQueueMessage } from "./artifact/message.js";
import { buildFlashcardsPrompt, buildSummaryPrompt } from "./artifact/prompt.js";

describe("artifact worker unit logic", () => {
  it("parses valid queue messages", () => {
    const courseId = "11111111-1111-4111-8111-111111111111";
    expect(
      parseArtifactQueueMessage({
        course_id: courseId,
        artifact_type: "flashcards",
      }),
    ).toEqual({
      course_id: courseId,
      artifact_type: "flashcards",
    });
  });

  it("rejects malformed queue messages", () => {
    expect(
      parseArtifactQueueMessage({
        course_id: "bad",
        artifact_type: "flashcards",
      }),
    ).toBeNull();
    expect(
      parseArtifactQueueMessage({
        course_id: "11111111-1111-4111-8111-111111111111",
        artifact_type: "quiz",
      }),
    ).toBeNull();
  });

  it("skips done and failed_permanent artifacts", () => {
    expect(decideArtifactIdempotency({ status: "done" }).action).toBe("skip");
    expect(decideArtifactIdempotency({ status: "failed_permanent" }).action).toBe(
      "skip",
    );
  });

  it("claims pending and resumes processing", () => {
    expect(decideArtifactIdempotency({ status: "pending" }).action).toBe("claim");
    expect(decideArtifactIdempotency({ status: "processing" }).action).toBe(
      "resume_processing",
    );
  });

  it("accepts generating_artifacts and partially_ready courses", () => {
    expect(isValidCourseStatusForArtifacts("generating_artifacts")).toBe(true);
    expect(isValidCourseStatusForArtifacts("partially_ready")).toBe(true);
    expect(isValidCourseStatusForArtifacts("draft")).toBe(false);
  });

  it("builds flashcard prompt with concept ids", () => {
    const prompt = buildFlashcardsPrompt(
      "React",
      [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          name: "Hooks",
          description: "Stateful functions",
          difficulty: "beginner",
        },
      ],
      [],
    );

    expect(prompt).toContain("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(prompt).toContain("Hooks");
  });

  it("builds summary prompt from concepts", () => {
    const prompt = buildSummaryPrompt(
      "React",
      [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          name: "Hooks",
          description: "Stateful functions",
          difficulty: "beginner",
        },
      ],
      [],
    );

    expect(prompt).toContain("short");
    expect(prompt).toContain("detailed");
  });

  it("classifies configuration failures as non-retryable", () => {
    const result = classifyArtifactFailure(
      new ConfigurationError("OPENROUTER_API_KEY is not configured"),
    );
    expect(result.retryable).toBe(false);
  });
});
