import { z } from "zod";

import { sourceStatusSchema, sourceTypeSchema } from "../lib/source-state.js";

const fileSourceFieldsSchema = z.object({
  storage_path: z.string().trim().min(1, "storage_path is required"),
  mime_type: z.string().trim().min(1, "mime_type is required"),
  file_size_bytes: z
    .number({ invalid_type_error: "file_size_bytes must be a number" })
    .int("file_size_bytes must be an integer")
    .positive("file_size_bytes must be positive"),
  title: z.string().trim().min(1).optional(),
});

export const createTextSourceBodySchema = z.object({
  type: z.literal("text"),
  raw_text: z.string().trim().min(1, "raw_text is required"),
});

export const createDocSourceBodySchema = fileSourceFieldsSchema.extend({
  type: z.literal("doc"),
});

export const createImageSourceBodySchema = fileSourceFieldsSchema.extend({
  type: z.literal("image"),
});

export const createVideoSourceBodySchema = fileSourceFieldsSchema.extend({
  type: z.literal("video"),
  duration_sec: z
    .number({ invalid_type_error: "duration_sec must be a number" })
    .positive("duration_sec must be positive"),
});

export const createSourceBodySchema = z.discriminatedUnion("type", [
  createTextSourceBodySchema,
  createDocSourceBodySchema,
  createImageSourceBodySchema,
  createVideoSourceBodySchema,
]);

export type CreateSourceBody = z.infer<typeof createSourceBodySchema>;

export const sourceIdParamSchema = z.string().uuid("Invalid source id");

export const sourceCreatedResponseSchema = z.object({
  id: z.string().uuid(),
  type: sourceTypeSchema,
  status: sourceStatusSchema,
});

export const sourceActionResponseSchema = z.object({
  id: z.string().uuid(),
  status: sourceStatusSchema,
});
