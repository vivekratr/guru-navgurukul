import { describe, expect, it } from "vitest";

import {
  COURSE_POLL_INTERVAL_MS,
  isCourseProcessing,
  isCourseTerminalForPolling,
} from "@/lib/course-processing";

describe("course-processing", () => {
  it("identifies processing statuses", () => {
    expect(isCourseProcessing("ingesting")).toBe(true);
    expect(isCourseProcessing("extracting_knowledge")).toBe(true);
    expect(isCourseProcessing("generating_artifacts")).toBe(true);
    expect(isCourseProcessing("ready")).toBe(false);
    expect(isCourseProcessing("draft")).toBe(false);
    expect(isCourseProcessing("knowledge_extraction_failed")).toBe(false);
  });

  it("treats non-processing statuses as terminal for polling", () => {
    expect(isCourseTerminalForPolling("ready")).toBe(true);
    expect(isCourseTerminalForPolling("partially_ready")).toBe(true);
    expect(isCourseTerminalForPolling("knowledge_extraction_failed")).toBe(true);
    expect(isCourseTerminalForPolling("ingesting")).toBe(false);
  });

  it("uses the documented poll interval", () => {
    expect(COURSE_POLL_INTERVAL_MS).toBe(3000);
  });
});
