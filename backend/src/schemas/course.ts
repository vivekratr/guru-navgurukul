import { z } from "zod";

import { courseStatusSchema } from "../lib/course-state.js";

export const createCourseBodySchema = z.object({
  title: z.string().trim().min(1, "title is required"),
});

export type CreateCourseBody = z.infer<typeof createCourseBodySchema>;

export const courseIdParamSchema = z.string().uuid("Invalid course id");

export const courseCreatedResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: courseStatusSchema,
  created_at: z.string(),
});

export const courseListItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: courseStatusSchema,
  updated_at: z.string(),
});

export const courseListResponseSchema = z.object({
  courses: z.array(courseListItemSchema),
});

export const courseSourceSummarySchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["text", "doc", "image", "video"]),
  status: z.string(),
  last_error: z.string().nullable(),
});

export const courseDetailResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: courseStatusSchema,
  last_error: z.string().nullable(),
  sources: z.array(courseSourceSummarySchema),
  artifact_status: z.record(z.string()),
});
