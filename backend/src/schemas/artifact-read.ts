import { z } from "zod";

export const flashcardExportQuerySchema = z.object({
  format: z.enum(["json", "csv"]),
});

export const moduleItemSchema = z.object({
  position: z.number().int().min(1).max(5),
  title: z.string(),
  paragraphs: z.array(z.string()).min(1).max(3),
});

export const modulesResponseSchema = z.object({
  modules: z.array(moduleItemSchema).min(1).max(5),
});

/** @deprecated Use modulesResponseSchema */
export const summaryResponseSchema = modulesResponseSchema;

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
