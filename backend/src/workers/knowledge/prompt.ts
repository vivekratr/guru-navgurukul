export type SourceChunkInput = {
  sourceIndex: number;
  sourceTitle: string | null;
  heading: string | null;
  text: string;
  position: number;
};

export function buildKnowledgeExtractionPrompt(
  courseTitle: string,
  chunks: SourceChunkInput[],
): string {
  const chunkSections = chunks.map((chunk) => {
    const sourceLabel = chunk.sourceTitle
      ? `Source ${chunk.sourceIndex}: ${chunk.sourceTitle}`
      : `Source ${chunk.sourceIndex}`;
    const headingLine = chunk.heading ? `[${chunk.heading}]\n` : "";

    return `[${sourceLabel}]\n[Chunk ${chunk.position + 1}]\n${headingLine}${chunk.text}`;
  });

  return [
    "Course context:",
    courseTitle,
    "",
    "Source chunks:",
    chunkSections.join("\n\n"),
    "",
    "Task:",
    "Extract a unified concept graph across all sources above.",
    "Return JSON with concepts (id, name, description, difficulty) and relationships (from, to, type).",
    "Difficulty must be beginner, intermediate, or advanced.",
    "Relationship type must be contains, prerequisite, or related.",
    "Use stable string ids (e.g. concept-1) in concepts and reference those ids in relationships.",
    "Include at least one concept.",
  ].join("\n");
}
