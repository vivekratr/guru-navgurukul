export const GENERATE_ARTIFACTS_QUEUE_NAME = "generate_artifacts";
export const ARTIFACT_TYPES = ["flashcards", "summary"] as const;
export const ARTIFACT_BATCH_SIZE = 5;

export type ArtifactType = (typeof ARTIFACT_TYPES)[number];
