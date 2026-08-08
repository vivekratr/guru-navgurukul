import { z } from "zod";

export const flashcardItemSchema = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
  concept_id: z.string().min(1),
});

export const flashcardsOutputSchema = z.object({
  flashcards: z.array(flashcardItemSchema).min(1),
});

export const summaryOutputSchema = z.object({
  short: z.string().min(1),
  detailed: z.string().min(1),
});

export type FlashcardsOutput = z.infer<typeof flashcardsOutputSchema>;
export type SummaryOutput = z.infer<typeof summaryOutputSchema>;

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
