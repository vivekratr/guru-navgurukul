import { z } from "zod";

export const flashcardItemSchema = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
  concept_id: z.string().min(1),
});

export const flashcardsOutputSchema = z.object({
  flashcards: z.array(flashcardItemSchema).min(1),
});

export const moduleItemSchema = z.object({
  title: z.string().min(1),
  paragraphs: z.array(z.string().min(1)).min(1).max(3),
});

export const modulesOutputSchema = z.object({
  modules: z.array(moduleItemSchema).min(1).max(5),
});

/** @deprecated Use ModulesOutput — kept for test imports during transition */
export const summaryOutputSchema = modulesOutputSchema;

export type FlashcardsOutput = z.infer<typeof flashcardsOutputSchema>;
export type ModulesOutput = z.infer<typeof modulesOutputSchema>;
export type SummaryOutput = ModulesOutput;

export function validateFlashcardsSemantics(
  data: FlashcardsOutput,
  conceptIds: Set<string>,
): string | undefined {
  for (const card of data.flashcards) {
    if (!conceptIds.has(card.concept_id)) {
      return `flashcard references unknown concept "${card.concept_id}"`;
    }
  }

  return undefined;
}
