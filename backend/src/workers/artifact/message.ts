import { ARTIFACT_TYPES } from "./constants.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ArtifactQueueMessage = {
  course_id: string;
  artifact_type: "flashcards" | "summary";
};

export function parseArtifactQueueMessage(
  message: unknown,
): ArtifactQueueMessage | null {
  if (!message || typeof message !== "object") {
    return null;
  }

  const courseId = (message as { course_id?: unknown }).course_id;
  const artifactType = (message as { artifact_type?: unknown }).artifact_type;

  if (
    typeof courseId !== "string" ||
    !UUID_PATTERN.test(courseId) ||
    typeof artifactType !== "string" ||
    !ARTIFACT_TYPES.includes(artifactType as never)
  ) {
    return null;
  }

  return {
    course_id: courseId,
    artifact_type: artifactType as ArtifactQueueMessage["artifact_type"],
  };
}
