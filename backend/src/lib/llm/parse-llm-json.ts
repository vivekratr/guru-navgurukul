const JSON_FENCE_PATTERN = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;

export function extractJsonPayload(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(JSON_FENCE_PATTERN);

  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const firstBracket = trimmed.indexOf("[");

  if (firstBrace === -1 && firstBracket === -1) {
    return trimmed;
  }

  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    const lastBracket = trimmed.lastIndexOf("]");
    if (lastBracket > firstBracket) {
      return trimmed.slice(firstBracket, lastBracket + 1);
    }
  }

  if (firstBrace !== -1) {
    const lastBrace = trimmed.lastIndexOf("}");
    if (lastBrace > firstBrace) {
      return trimmed.slice(firstBrace, lastBrace + 1);
    }
  }

  return trimmed;
}

export function parseLlmJson(content: string): unknown {
  return JSON.parse(extractJsonPayload(content));
}
