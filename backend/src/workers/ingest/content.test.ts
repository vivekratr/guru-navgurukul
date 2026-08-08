import { describe, expect, it, vi } from "vitest";

import {
  buildVisionIngestMessages,
  type SourceRecord,
} from "./content.js";

function createMockSupabase(fileBytes: Uint8Array) {
  return {
    storage: {
      from: vi.fn(() => ({
        download: vi.fn(async () => ({
          data: new Blob([fileBytes]),
          error: null,
        })),
      })),
    },
  } as never;
}

function fileSource(
  type: "doc" | "image" | "video",
  storagePath: string,
  extras: Partial<SourceRecord> = {},
): SourceRecord {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    course_id: "22222222-2222-4222-8222-222222222222",
    type,
    title: "Test source",
    storage_path: storagePath,
    raw_text: null,
    duration_sec: type === "video" ? 60 : null,
    ...extras,
  };
}

describe("buildVisionIngestMessages", () => {
  it("builds text messages from raw_text", async () => {
    const messages = await buildVisionIngestMessages(createMockSupabase(new Uint8Array()), {
      id: "11111111-1111-4111-8111-111111111111",
      course_id: "22222222-2222-4222-8222-222222222222",
      type: "text",
      title: "Notes",
      storage_path: null,
      raw_text: "Hello world",
      duration_sec: null,
    });

    expect(messages).toHaveLength(2);
    expect(messages[1]?.content).toContain("Hello world");
  });

  it("rejects text sources without raw_text", async () => {
    await expect(
      buildVisionIngestMessages(createMockSupabase(new Uint8Array()), {
        id: "11111111-1111-4111-8111-111111111111",
        course_id: "22222222-2222-4222-8222-222222222222",
        type: "text",
        title: null,
        storage_path: null,
        raw_text: null,
        duration_sec: null,
      }),
    ).rejects.toThrow("Text source is missing raw_text");
  });

  it("builds doc messages from storage_path without raw_text", async () => {
    const fileBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const supabase = createMockSupabase(fileBytes);
    const source = fileSource("doc", "user/course/upload/report.pdf");

    const messages = await buildVisionIngestMessages(supabase, source);

    expect(supabase.storage.from).toHaveBeenCalledWith("source-uploads");
    expect(messages).toHaveLength(2);

    const userContent = messages[1]?.content;
    expect(Array.isArray(userContent)).toBe(true);

    const parts = userContent as Array<{ type: string; image_url?: { url: string } }>;
    expect(parts.some((part) => part.type === "image_url")).toBe(true);
    expect(parts[0]?.type).toBe("text");
    expect(parts.some((part) => part.image_url?.url.startsWith("data:application/pdf;base64,"))).toBe(
      true,
    );
  });

  it("builds image messages from storage_path without raw_text", async () => {
    const fileBytes = new Uint8Array([0xff, 0xd8, 0xff]);
    const source = fileSource("image", "user/course/upload/photo.jpg");

    const messages = await buildVisionIngestMessages(
      createMockSupabase(fileBytes),
      source,
    );

    const userContent = messages[1]?.content as Array<{
      type: string;
      image_url?: { url: string };
    }>;

    expect(userContent.some((part) => part.image_url?.url.startsWith("data:image/jpeg;base64,"))).toBe(
      true,
    );
  });

  it("builds video messages with duration and storage attachment", async () => {
    const fileBytes = new Uint8Array([0x00, 0x00, 0x00, 0x18]);
    const source = fileSource("video", "user/course/upload/clip.mp4", {
      duration_sec: 90,
    });

    const messages = await buildVisionIngestMessages(
      createMockSupabase(fileBytes),
      source,
    );

    const userContent = messages[1]?.content as Array<{ type: string; text?: string }>;
    const intro = userContent.find((part) => part.type === "text" && part.text?.includes("video"));

    expect(intro?.text).toContain("Video duration (seconds): 90");
    expect(
      userContent.some(
        (part) =>
          part.type === "text" &&
          part.text?.includes("short educational video"),
      ),
    ).toBe(true);
    expect(userContent.some((part) => part.type === "image_url")).toBe(true);
  });

  it("rejects file sources without storage_path", async () => {
    await expect(
      buildVisionIngestMessages(createMockSupabase(new Uint8Array()), {
        ...fileSource("doc", "user/course/upload/report.pdf"),
        storage_path: null,
      }),
    ).rejects.toThrow("File source is missing storage_path");
  });
});
