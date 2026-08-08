import { describe, expect, it } from "vitest";

import {
  artifactStatusLabel,
  courseStatusLabel,
  hasUsableSources,
  isWorkspaceContentUnlocked,
  sourceStatusLabel,
} from "@/lib/status-labels";
import type { CourseStatus, SourceStatus } from "@/types/api";

const courseStatuses: Array<{ status: CourseStatus; label: string; unlocked: boolean }> =
  [
    { status: "draft", label: "Add your sources", unlocked: false },
    { status: "ingesting", label: "Reading your sources…", unlocked: false },
    {
      status: "extracting_knowledge",
      label: "Finding the concepts…",
      unlocked: false,
    },
    {
      status: "knowledge_extraction_failed",
      label: "Couldn't map the concepts",
      unlocked: false,
    },
    {
      status: "generating_artifacts",
      label: "Writing flashcards and summaries…",
      unlocked: false,
    },
    { status: "ready", label: "Course ready", unlocked: true },
    {
      status: "partially_ready",
      label: "Course partially ready",
      unlocked: true,
    },
  ];

const sourceStatuses: Array<{ status: SourceStatus; label: string }> = [
  { status: "pending", label: "Waiting to be processed" },
  { status: "processing", label: "Reading/processing" },
  { status: "done", label: "Ready" },
  { status: "failed", label: "Retrying" },
  { status: "failed_permanent", label: "Failed — Retry" },
  { status: "cancelled", label: "Cancelled" },
];

describe("status label mapping", () => {
  it.each(courseStatuses)(
    "maps course status $status",
    ({ status, label, unlocked }) => {
      expect(courseStatusLabel(status)).toBe(label);
      expect(isWorkspaceContentUnlocked(status)).toBe(unlocked);
    },
  );

  it.each(sourceStatuses)("maps source status $status", ({ status, label }) => {
    expect(sourceStatusLabel(status)).toBe(label);
  });

  it("keeps transient and permanent failures distinct", () => {
    expect(sourceStatusLabel("failed")).not.toBe(
      sourceStatusLabel("failed_permanent"),
    );
    expect(artifactStatusLabel("failed")).not.toBe(
      artifactStatusLabel("failed_permanent"),
    );
  });

  it("detects usable sources for generate", () => {
    expect(
      hasUsableSources([{ status: "pending" }, { status: "cancelled" }]),
    ).toBe(true);
    expect(hasUsableSources([{ status: "cancelled" }])).toBe(false);
  });
});
