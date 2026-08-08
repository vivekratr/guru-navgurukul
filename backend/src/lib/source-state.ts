import { z } from "zod";

export const SOURCE_STATUSES = [
  "pending",
  "processing",
  "done",
  "failed",
  "failed_permanent",
  "cancelled",
] as const;

export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export const INITIAL_SOURCE_STATUS = "pending" satisfies SourceStatus;

export const sourceStatusSchema = z.enum(SOURCE_STATUSES);

export const SOURCE_TYPES = ["text", "doc", "image", "video"] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

export const sourceTypeSchema = z.enum(SOURCE_TYPES);

export const API_CANCELLABLE_SOURCE_STATUSES = [
  "pending",
  "processing",
  "failed",
  "failed_permanent",
] as const satisfies readonly SourceStatus[];

export const MAX_VIDEO_DURATION_SEC = 180;
