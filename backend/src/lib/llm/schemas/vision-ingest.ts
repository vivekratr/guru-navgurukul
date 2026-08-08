import { z } from "zod";

export const visionIngestChunkSchema = z.object({
  heading: z.string().optional(),
  text: z.string().min(1),
  position: z.number().int().nonnegative(),
});

export const visionIngestOutputSchema = z
  .object({
    chunks: z.array(visionIngestChunkSchema).min(1),
  })
  .superRefine((value, context) => {
    const positions = value.chunks.map((chunk) => chunk.position);
    const uniquePositions = new Set(positions);

    if (uniquePositions.size !== positions.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "chunk positions must be unique",
      });
    }
  });

export type VisionIngestOutput = z.infer<typeof visionIngestOutputSchema>;

export function validateVisionIngestSemantics(
  data: VisionIngestOutput,
): string | undefined {
  if (data.chunks.length === 0) {
    return "chunks must not be empty";
  }

  for (const chunk of data.chunks) {
    if (chunk.text.trim().length === 0) {
      return "chunk text must not be empty";
    }
  }

  return undefined;
}
