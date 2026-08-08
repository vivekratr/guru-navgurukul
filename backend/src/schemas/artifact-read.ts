import { z } from "zod";

export const flashcardExportQuerySchema = z.object({
  format: z.enum(["json", "csv"]),
});

export const summaryResponseSchema = z.object({
  short: z.string(),
  detailed: z.string(),
});

export const flashcardItemSchema = z.object({
  id: z.string().uuid(),
  concept_id: z.string().uuid().nullable(),
  front: z.string(),
  back: z.string(),
});

export const flashcardsResponseSchema = z.object({
  flashcards: z.array(flashcardItemSchema),
});

export const conceptGraphNodeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).nullable(),
});

export const conceptGraphEdgeSchema = z.object({
  from: z.string().uuid(),
  to: z.string().uuid(),
  type: z.enum(["contains", "prerequisite", "related"]),
});

export const conceptGraphResponseSchema = z.object({
  nodes: z.array(conceptGraphNodeSchema),
  edges: z.array(conceptGraphEdgeSchema),
});
