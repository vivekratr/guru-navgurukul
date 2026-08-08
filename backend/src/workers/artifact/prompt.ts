export type ConceptInput = {
  id: string;
  name: string;
  description: string | null;
  difficulty: string | null;
};

export type RelationshipInput = {
  source_concept_id: string;
  target_concept_id: string;
  type: string;
};

export function buildFlashcardsPrompt(
  courseTitle: string,
  concepts: ConceptInput[],
  relationships: RelationshipInput[],
): string {
  const conceptLines = concepts.map(
    (concept) =>
      `- id: ${concept.id}\n  name: ${concept.name}\n  description: ${concept.description ?? ""}\n  difficulty: ${concept.difficulty ?? ""}`,
  );

  const relationshipLines = relationships.map(
    (rel) =>
      `- ${rel.source_concept_id} → ${rel.target_concept_id} (${rel.type})`,
  );

  return [
    "Course:",
    courseTitle,
    "",
    "Concepts:",
    conceptLines.join("\n"),
    "",
    "Relationships:",
    relationshipLines.length > 0
      ? relationshipLines.join("\n")
      : "(none)",
    "",
    "Task:",
    "Generate flashcards for ALL concepts in one JSON object.",
    "Return: { flashcards: [{ front, back, concept_id }] }",
    "concept_id must be one of the concept ids listed above.",
    "Include at least one flashcard. front and back must be non-empty.",
  ].join("\n");
}

export function buildModulesPrompt(
  courseTitle: string,
  concepts: ConceptInput[],
  relationships: RelationshipInput[],
): string {
  const conceptLines = concepts.map(
    (concept) =>
      `- ${concept.name}: ${concept.description ?? ""}`,
  );

  const relationshipLines = relationships.map(
    (rel) =>
      `- ${rel.source_concept_id} → ${rel.target_concept_id} (${rel.type})`,
  );

  return [
    "Course:",
    courseTitle,
    "",
    "Concepts:",
    conceptLines.join("\n"),
    "",
    "Relationships:",
    relationshipLines.length > 0
      ? relationshipLines.join("\n")
      : "(none)",
    "",
    "Task:",
    "Generate learning modules as JSON: { modules: [{ title, paragraphs }] }",
    "Rules:",
    "- Produce 1 to 5 modules ordered from foundational to advanced.",
    "- Each module has 1 to 3 paragraphs of readable learning content.",
    "Each paragraph should be 2-4 sentences a learner can read and understand.",
    "title and every paragraph must be non-empty.",
  ].join("\n");
}

/** @deprecated Use buildModulesPrompt */
export const buildSummaryPrompt = buildModulesPrompt;
