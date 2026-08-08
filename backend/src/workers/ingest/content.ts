import type { SupabaseClient } from "@supabase/supabase-js";

import { SOURCE_UPLOADS_BUCKET } from "../../lib/source-file-policy.js";
import type { ChatContentPart, ChatMessage } from "../../lib/llm/types.js";

export type SourceRecord = {
  id: string;
  course_id: string;
  type: "text" | "doc" | "image" | "video";
  title: string | null;
  storage_path: string | null;
  raw_text: string | null;
  duration_sec: number | null;
};

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function guessMimeType(sourceType: SourceRecord["type"], fileName: string): string {
  const lower = fileName.toLowerCase();

  if (sourceType === "image") {
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".gif")) return "image/gif";
    return "image/jpeg";
  }

  if (sourceType === "doc") {
    return "application/pdf";
  }

  if (sourceType === "video") {
    if (lower.endsWith(".webm")) return "video/webm";
    if (lower.endsWith(".mov")) return "video/quicktime";
    return "video/mp4";
  }

  return "application/octet-stream";
}

async function downloadStorageObject(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<Uint8Array> {
  const { data, error } = await supabase.storage
    .from(SOURCE_UPLOADS_BUCKET)
    .download(storagePath);

  if (error || !data) {
    throw new Error(`Failed to read storage object at ${storagePath}`);
  }

  return new Uint8Array(await data.arrayBuffer());
}

const VISION_SYSTEM_PROMPT = `You extract structured learning chunks from educational source material.
Return JSON only with this shape:
{
  "chunks": [
    { "heading": "optional section title", "text": "chunk body", "position": 0 }
  ]
}
Rules:
- Produce at least one chunk with non-empty text.
- Use zero-based unique position values in reading order.
- Preserve factual content from the source.`;

export async function buildVisionIngestMessages(
  supabase: SupabaseClient,
  source: SourceRecord,
): Promise<ChatMessage[]> {
  const title = source.title?.trim() || "Untitled source";

  if (source.type === "text") {
    if (!source.raw_text?.trim()) {
      throw new Error("Text source is missing raw_text");
    }

    return [
      { role: "system", content: VISION_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Source title: ${title}\nSource type: text\n\n${source.raw_text}`,
      },
    ];
  }

  if (!source.storage_path) {
    throw new Error("File source is missing storage_path");
  }

  const fileName = source.storage_path.split("/").pop() ?? "source";
  const bytes = await downloadStorageObject(supabase, source.storage_path);
  const mimeType = guessMimeType(source.type, fileName);
  const dataUrl = `data:${mimeType};base64,${bytesToBase64(bytes)}`;

  const intro = `Source title: ${title}\nSource type: ${source.type}${
    source.duration_sec ? `\nVideo duration (seconds): ${source.duration_sec}` : ""
  }`;

  const content: ChatContentPart[] = [{ type: "text", text: intro }];

  if (source.type === "image" || source.type === "doc") {
    content.push({
      type: "image_url",
      image_url: { url: dataUrl },
    });
  } else {
    content.push({
      type: "text",
      text:
        "The attached file is a short educational video. Extract teachable chunks from the available visual/audio content.",
    });
    content.push({
      type: "image_url",
      image_url: { url: dataUrl },
    });
  }

  return [
    { role: "system", content: VISION_SYSTEM_PROMPT },
    { role: "user", content },
  ];
}
