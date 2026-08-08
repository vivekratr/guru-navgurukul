import { z } from "zod";

export const COURSE_STATUSES = [
  "draft",
  "ingesting",
  "extracting_knowledge",
  "knowledge_extraction_failed",
  "generating_artifacts",
  "ready",
  "partially_ready",
] as const;

export type CourseStatus = (typeof COURSE_STATUSES)[number];

export const INITIAL_COURSE_STATUS = "draft" satisfies CourseStatus;

export const courseStatusSchema = z.enum(COURSE_STATUSES);
