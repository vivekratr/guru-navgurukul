import { z } from "zod";

export const conceptDifficultySchema = z.enum([
  "beginner",
  "intermediate",
  "advanced",
]);

export const relationshipTypeSchema = z.enum([
  "contains",
  "prerequisite",
  "related",
]);

export const knowledgeConceptSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  difficulty: conceptDifficultySchema,
});

export const knowledgeRelationshipSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: relationshipTypeSchema,
});

export const knowledgeExtractionOutputSchema = z.object({
  concepts: z.array(knowledgeConceptSchema),
  relationships: z.array(knowledgeRelationshipSchema),
});

export type KnowledgeExtractionOutput = z.infer<
  typeof knowledgeExtractionOutputSchema
>;

export function validateKnowledgeExtractionSemantics(
  data: KnowledgeExtractionOutput,
): string | undefined {
  if (data.concepts.length === 0) {
    return "concepts must not be empty";
  }

  const conceptIds = new Set(data.concepts.map((concept) => concept.id));

  for (const relationship of data.relationships) {
    if (!conceptIds.has(relationship.from)) {
      return `relationship from "${relationship.from}" references unknown concept`;
    }

    if (!conceptIds.has(relationship.to)) {
      return `relationship to "${relationship.to}" references unknown concept`;
    }
  }

  return undefined;
}
