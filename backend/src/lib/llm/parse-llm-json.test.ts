import { describe, expect, it } from "vitest";

import { extractJsonPayload, parseLlmJson } from "./parse-llm-json.js";

describe("parseLlmJson", () => {
  it("parses plain JSON objects", () => {
    expect(parseLlmJson('{"chunks":[{"text":"hi","position":0}]}')).toEqual({
      chunks: [{ text: "hi", position: 0 }],
    });
  });

  it("parses fenced JSON blocks", () => {
    const content = '```json\n{"answer":"ok"}\n```';
    expect(extractJsonPayload(content)).toBe('{"answer":"ok"}');
    expect(parseLlmJson(content)).toEqual({ answer: "ok" });
  });

  it("extracts arrays from surrounding text", () => {
    expect(parseLlmJson('Here you go: [{"text":"hi","position":0}]')).toEqual([
      { text: "hi", position: 0 },
    ]);
  });
});
