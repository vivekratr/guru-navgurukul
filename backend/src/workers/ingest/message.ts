const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type IngestQueueMessage = {
  source_id: string;
};

export function parseIngestQueueMessage(
  message: unknown,
): IngestQueueMessage | null {
  if (!message || typeof message !== "object") {
    return null;
  }

  const sourceId = (message as { source_id?: unknown }).source_id;

  if (typeof sourceId !== "string" || !UUID_PATTERN.test(sourceId)) {
    return null;
  }

  return { source_id: sourceId };
}
