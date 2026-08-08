export type ArtifactRow = {
  status: string;
};

export type ArtifactIdempotencyDecision =
  | { action: "skip"; reason: string }
  | { action: "claim" }
  | { action: "resume_processing" };

export function decideArtifactIdempotency(
  artifact: ArtifactRow,
): ArtifactIdempotencyDecision {
  if (artifact.status === "done") {
    return { action: "skip", reason: "artifact already done" };
  }

  if (artifact.status === "failed_permanent") {
    return { action: "skip", reason: "artifact failed_permanent" };
  }

  if (artifact.status === "processing") {
    return { action: "resume_processing" };
  }

  if (artifact.status === "pending") {
    return { action: "claim" };
  }

  return {
    action: "skip",
    reason: `unsupported artifact status ${artifact.status}`,
  };
}

export function isValidCourseStatusForArtifacts(status: string): boolean {
  return (
    status === "generating_artifacts" ||
    status === "partially_ready" ||
    status === "ready"
  );
}
