import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { env } from "../../config/index.js";
import { getServiceSupabaseClient } from "../supabase.js";
import { loadModelRoleConfig } from "./model-role-repository.js";
import { callRole } from "./call-role.js";
import { z } from "zod";

const hasSupabaseConfig = Boolean(
  env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY,
);

const testSchema = z.object({ answer: z.string() });

describe.skipIf(!hasSupabaseConfig)("model_roles configuration", () => {
  const supabase = getServiceSupabaseClient();
  const originalChain: string[] = [];

  beforeAll(async () => {
    const { data } = await supabase
      .from("model_roles")
      .select("chain")
      .eq("role", "vision_ingest")
      .single();

    if (data?.chain) {
      originalChain.push(...(data.chain as string[]));
    }
  });

  afterAll(async () => {
    if (originalChain.length > 0) {
      await supabase
        .from("model_roles")
        .update({ chain: originalChain })
        .eq("role", "vision_ingest");
    }
  });

  it("loads model chain from model_roles", async () => {
    const config = await loadModelRoleConfig(supabase, "vision_ingest");

    expect(config.chain.length).toBeGreaterThan(0);
    expect(config.role).toBe("vision_ingest");
  });

  it("sees updated chain after model_roles changes", async () => {
    const customChain = ["test-model-alpha", "test-model-beta"];

    await supabase
      .from("model_roles")
      .update({ chain: customChain })
      .eq("role", "vision_ingest");

    const config = await loadModelRoleConfig(supabase, "vision_ingest");
    expect(config.chain).toEqual(customChain);

    const attempts: string[] = [];
    const openRouter = {
      chatCompletion: async (request: { model: string }) => {
        attempts.push(request.model);
        if (request.model === "test-model-alpha") {
          throw new Error("alpha failed");
        }
        return { content: JSON.stringify({ answer: "ok" }) };
      },
    };

    const result = await callRole(
      {
        role: "vision_ingest",
        messages: [{ role: "user", content: "test" }],
        outputSchema: testSchema,
      },
      {
        loadRoleConfig: () => loadModelRoleConfig(supabase, "vision_ingest"),
        openRouter,
      },
    );

    expect(attempts).toEqual(["test-model-alpha", "test-model-beta"]);
    expect(result.model_used).toBe("test-model-beta");
  });
});
