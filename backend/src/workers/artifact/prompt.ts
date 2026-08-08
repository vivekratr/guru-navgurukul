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

export function buildSummaryPrompt(
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
    "Generate course summaries as JSON: { short, detailed }",
    "short: concise overview. detailed: fuller explanation.",
    "Both fields must be non-empty.",
  ].join("\n");
}
