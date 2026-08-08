const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type KnowledgeQueueMessage = {
  course_id: string;
};

export function parseKnowledgeQueueMessage(
  message: unknown,
): KnowledgeQueueMessage | null {
  if (!message || typeof message !== "object") {
    return null;
  }

  const courseId = (message as { course_id?: unknown }).course_id;

  if (typeof courseId !== "string" || !UUID_PATTERN.test(courseId)) {
    return null;
  }

  return { course_id: courseId };
}
