import { describe, expect, it } from "vitest";

import { createCourseBodySchema } from "./course.js";
import {
  createDocSourceBodySchema,
  createSourceBodySchema,
  createTextSourceBodySchema,
} from "./source.js";
import {
  conceptDifficultySchema,
  knowledgeExtractionOutputSchema,
} from "../lib/llm/schemas/knowledge-extraction.js";
import {
  flashcardsOutputSchema,
  summaryOutputSchema,
} from "../lib/llm/schemas/content-generation.js";
import {
  validateFileSize,
  validateMimeType,
  validateVideoDuration,
} from "../lib/storage.js";
import { AppError } from "../lib/errors.js";
import { FILE_SIZE_LIMIT_BYTES } from "../lib/source-file-policy.js";

describe("createCourseBodySchema", () => {
  it("accepts a non-empty title", () => {
    expect(createCourseBodySchema.safeParse({ title: "React Basics" }).success).toBe(
      true,
    );
  });

  it("rejects missing or blank titles", () => {
    expect(createCourseBodySchema.safeParse({}).success).toBe(false);
    expect(createCourseBodySchema.safeParse({ title: "" }).success).toBe(false);
    expect(createCourseBodySchema.safeParse({ title: "   " }).success).toBe(false);
  });
});

describe("createSourceBodySchema", () => {
  it("accepts valid text sources", () => {
    expect(
      createTextSourceBodySchema.safeParse({
        type: "text",
        raw_text: "Hello",
      }).success,
    ).toBe(true);
  });

  it("rejects text sources without raw_text", () => {
    expect(
      createTextSourceBodySchema.safeParse({ type: "text" }).success,
    ).toBe(false);
    expect(
      createTextSourceBodySchema.safeParse({
        type: "text",
        raw_text: "   ",
      }).success,
    ).toBe(false);
  });

  it("rejects unsupported source types", () => {
    expect(
      createSourceBodySchema.safeParse({
        type: "audio",
        raw_text: "nope",
      }).success,
    ).toBe(false);
  });

  it("rejects unsupported MIME types at validation layer", () => {
    expect(() =>
      validateMimeType("doc", "text/plain"),
    ).toThrow(AppError);
  });

  it("rejects oversized file sources at validation layer", () => {
    expect(() =>
      validateFileSize("doc", FILE_SIZE_LIMIT_BYTES.doc + 1),
    ).toThrow(AppError);
    expect(() =>
      validateFileSize("image", FILE_SIZE_LIMIT_BYTES.image + 1),
    ).toThrow(AppError);
  });

  it("rejects video longer than 180 seconds at validation layer", () => {
    expect(() => validateVideoDuration(181)).toThrow(AppError);
  });

  it("accepts structurally valid doc metadata in schema", () => {
    expect(
      createDocSourceBodySchema.safeParse({
        type: "doc",
        storage_path: "user/course/id/file.pdf",
        mime_type: "application/pdf",
        file_size_bytes: 1024,
      }).success,
    ).toBe(true);
  });
});

describe("LLM output schemas", () => {
  it("rejects invalid concept difficulty", () => {
    expect(
      conceptDifficultySchema.safeParse("expert").success,
    ).toBe(false);
  });

  it("rejects malformed knowledge extraction shape", () => {
    expect(
      knowledgeExtractionOutputSchema.safeParse({
        concepts: [{ id: "a", name: "", description: "x", difficulty: "beginner" }],
        relationships: [],
      }).success,
    ).toBe(false);
  });

  it("rejects invalid flashcard output", () => {
    expect(
      flashcardsOutputSchema.safeParse({ flashcards: [] }).success,
    ).toBe(false);
  });

  it("rejects invalid modules output", () => {
    expect(
      summaryOutputSchema.safeParse({ modules: [] }).success,
    ).toBe(false);
  });
});
