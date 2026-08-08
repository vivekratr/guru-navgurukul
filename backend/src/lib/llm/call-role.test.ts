import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import { callRole } from "./call-role.js";
import {
  AllModelsExhaustedError,
  ConfigurationError,
  ProviderError,
  RateLimitError,
  TimeoutError,
} from "./errors.js";
import { parseRoleConfig } from "./role-config.js";
import {
  knowledgeExtractionOutputSchema,
  validateKnowledgeExtractionSemantics,
} from "./schemas/knowledge-extraction.js";
import type {
  CallRoleDependencies,
  OpenRouterClient,
  RoleConfig,
} from "./types.js";

const testSchema = z.object({
  answer: z.string(),
});

const defaultMessages = [{ role: "user" as const, content: "test prompt" }];

function createRoleConfig(
  chain: string[],
  overrides: Partial<RoleConfig> = {},
): RoleConfig {
  return {
    role: "vision_ingest",
    chain,
    max_tokens: 1000,
    timeout_ms: 5000,
    ...overrides,
  };
}

function createMockOpenRouter(
  handlers: Record<
    string,
    () => Promise<{ content: string }> | { content: string }
  >,
): OpenRouterClient {
  return {
    chatCompletion: vi.fn(async (request) => {
      const handler = handlers[request.model];
      if (!handler) {
        throw new ProviderError(`No handler for model ${request.model}`);
      }
      return handler();
    }),
  };
}

function createDependencies(
  chain: string[],
  openRouter: OpenRouterClient,
  roleOverrides: Partial<RoleConfig> = {},
): CallRoleDependencies {
  return {
    loadRoleConfig: vi.fn(async () => createRoleConfig(chain, roleOverrides)),
    openRouter,
  };
}

describe("callRole", () => {
  it("returns model A when A succeeds", async () => {
    const openRouter = createMockOpenRouter({
      "model-a": () => ({ content: JSON.stringify({ answer: "ok" }) }),
      "model-b": () => ({ content: JSON.stringify({ answer: "fallback" }) }),
    });

    const result = await callRole(
      {
        role: "vision_ingest",
        messages: defaultMessages,
        outputSchema: testSchema,
      },
      createDependencies(["model-a", "model-b"], openRouter),
    );

    expect(result).toEqual({
      data: { answer: "ok" },
      model_used: "model-a",
    });
    expect(openRouter.chatCompletion).toHaveBeenCalledTimes(1);
    expect(openRouter.chatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ model: "model-a", timeout_ms: 5000 }),
    );
  });

  it("falls back to B when A throws a provider error", async () => {
    const openRouter = createMockOpenRouter({
      "model-a": () => {
        throw new ProviderError("upstream 502", 502);
      },
      "model-b": () => ({ content: JSON.stringify({ answer: "from-b" }) }),
    });

    const result = await callRole(
      {
        role: "vision_ingest",
        messages: defaultMessages,
        outputSchema: testSchema,
      },
      createDependencies(["model-a", "model-b"], openRouter),
    );

    expect(result.model_used).toBe("model-b");
    expect(result.data).toEqual({ answer: "from-b" });
    expect(openRouter.chatCompletion).toHaveBeenCalledTimes(2);
  });

  it("falls back to B when A is rate limited", async () => {
    const openRouter = createMockOpenRouter({
      "model-a": () => {
        throw new RateLimitError("429");
      },
      "model-b": () => ({ content: JSON.stringify({ answer: "from-b" }) }),
    });

    const result = await callRole(
      {
        role: "vision_ingest",
        messages: defaultMessages,
        outputSchema: testSchema,
      },
      createDependencies(["model-a", "model-b"], openRouter),
    );

    expect(result.model_used).toBe("model-b");
    expect(openRouter.chatCompletion).toHaveBeenCalledTimes(2);
  });

  it("falls back to B when A times out", async () => {
    const openRouter = createMockOpenRouter({
      "model-a": () => {
        throw new TimeoutError("timed out");
      },
      "model-b": () => ({ content: JSON.stringify({ answer: "from-b" }) }),
    });

    const result = await callRole(
      {
        role: "vision_ingest",
        messages: defaultMessages,
        outputSchema: testSchema,
      },
      createDependencies(["model-a", "model-b"], openRouter),
    );

    expect(result.model_used).toBe("model-b");
    expect(openRouter.chatCompletion).toHaveBeenCalledTimes(2);
  });

  it("falls back to B when A returns malformed JSON", async () => {
    const openRouter = createMockOpenRouter({
      "model-a": () => ({ content: "not-json" }),
      "model-b": () => ({ content: JSON.stringify({ answer: "from-b" }) }),
    });

    const result = await callRole(
      {
        role: "vision_ingest",
        messages: defaultMessages,
        outputSchema: testSchema,
      },
      createDependencies(["model-a", "model-b"], openRouter),
    );

    expect(result.model_used).toBe("model-b");
    expect(openRouter.chatCompletion).toHaveBeenCalledTimes(2);
  });

  it("throws AllModelsExhaustedError when every model fails", async () => {
    const openRouter = createMockOpenRouter({
      "model-a": () => {
        throw new ProviderError("fail-a", 500);
      },
      "model-b": () => ({ content: "not-json" }),
    });

    await expect(
      callRole(
        {
          role: "vision_ingest",
          messages: defaultMessages,
          outputSchema: testSchema,
        },
        createDependencies(["model-a", "model-b"], openRouter),
      ),
    ).rejects.toMatchObject({
      name: "AllModelsExhaustedError",
      role: "vision_ingest",
      attempts: [
        { model: "model-a", outcome: "provider_error" },
        { model: "model-b", outcome: "invalid_output", detail: "malformed JSON" },
      ],
    });
  });

  it("throws ConfigurationError immediately on auth failures without trying the chain", async () => {
    const openRouter = createMockOpenRouter({
      "model-a": () => {
        throw new ConfigurationError("OpenRouter authentication failed with status 401");
      },
      "model-b": () => ({ content: JSON.stringify({ answer: "from-b" }) }),
    });

    await expect(
      callRole(
        {
          role: "vision_ingest",
          messages: defaultMessages,
          outputSchema: testSchema,
        },
        createDependencies(["model-a", "model-b"], openRouter),
      ),
    ).rejects.toBeInstanceOf(ConfigurationError);

    expect(openRouter.chatCompletion).toHaveBeenCalledTimes(1);
  });

  it("throws ConfigurationError for an invalid role configuration", async () => {
    const dependencies: CallRoleDependencies = {
      loadRoleConfig: vi.fn(async () => {
        throw new ConfigurationError('Role "vision_ingest" not found in model_roles');
      }),
      openRouter: createMockOpenRouter({}),
    };

    await expect(
      callRole(
        {
          role: "vision_ingest",
          messages: defaultMessages,
          outputSchema: testSchema,
        },
        dependencies,
      ),
    ).rejects.toBeInstanceOf(ConfigurationError);
  });
});

describe("parseRoleConfig", () => {
  it("rejects an empty model chain", () => {
    expect(() =>
      parseRoleConfig({
        role: "vision_ingest",
        chain: [],
        max_tokens: 1000,
        timeout_ms: 5000,
      }),
    ).toThrow(ConfigurationError);
  });

  it("rejects malformed model_roles data", () => {
    expect(() =>
      parseRoleConfig({
        role: "vision_ingest",
        chain: ["", "model-b"],
        max_tokens: 0,
        timeout_ms: -1,
      }),
    ).toThrow(ConfigurationError);
  });

  it("rejects unsupported roles", () => {
    expect(() =>
      parseRoleConfig({
        role: "unknown_role",
        chain: ["model-a"],
        max_tokens: 1000,
        timeout_ms: 5000,
      }),
    ).toThrow(ConfigurationError);
  });
});

describe("knowledge extraction guardrails", () => {
  const validKnowledge = {
    concepts: [
      {
        id: "a",
        name: "Concept A",
        description: "First concept",
        difficulty: "beginner" as const,
      },
    ],
    relationships: [],
  };

  it("rejects dangling relationships", async () => {
    const openRouter = createMockOpenRouter({
      "model-a": () => ({
        content: JSON.stringify({
          concepts: validKnowledge.concepts,
          relationships: [{ from: "a", to: "missing", type: "related" }],
        }),
      }),
      "model-b": () => ({
        content: JSON.stringify(validKnowledge),
      }),
    });

    const result = await callRole(
      {
        role: "knowledge_extraction",
        messages: defaultMessages,
        outputSchema: knowledgeExtractionOutputSchema,
        validateOutput: validateKnowledgeExtractionSemantics,
      },
      createDependencies(["model-a", "model-b"], openRouter, {
        role: "knowledge_extraction",
      }),
    );

    expect(result.model_used).toBe("model-b");
    expect(openRouter.chatCompletion).toHaveBeenCalledTimes(2);
  });

  it("rejects empty concepts", async () => {
    const openRouter = createMockOpenRouter({
      "model-a": () => ({
        content: JSON.stringify({ concepts: [], relationships: [] }),
      }),
      "model-b": () => ({
        content: JSON.stringify(validKnowledge),
      }),
    });

    const result = await callRole(
      {
        role: "knowledge_extraction",
        messages: defaultMessages,
        outputSchema: knowledgeExtractionOutputSchema,
        validateOutput: validateKnowledgeExtractionSemantics,
      },
      createDependencies(["model-a", "model-b"], openRouter, {
        role: "knowledge_extraction",
      }),
    );

    expect(result.model_used).toBe("model-b");
    expect(openRouter.chatCompletion).toHaveBeenCalledTimes(2);
  });

  it("identifies the exact model that succeeded", async () => {
    const openRouter = createMockOpenRouter({
      "model-a": () => {
        throw new RateLimitError("429");
      },
      "model-b": () => ({ content: JSON.stringify(validKnowledge) }),
    });

    const result = await callRole(
      {
        role: "knowledge_extraction",
        messages: defaultMessages,
        outputSchema: knowledgeExtractionOutputSchema,
        validateOutput: validateKnowledgeExtractionSemantics,
      },
      createDependencies(["model-a", "model-b"], openRouter, {
        role: "knowledge_extraction",
      }),
    );

    expect(result.model_used).toBe("model-b");
    expect(result.data.concepts).toHaveLength(1);
  });
});

describe("AllModelsExhaustedError", () => {
  it("includes attempt diagnostics for every failed model", async () => {
    const openRouter = createMockOpenRouter({
      "model-a": () => {
        throw new RateLimitError("429");
      },
      "model-b": () => {
        throw new TimeoutError("timeout");
      },
    });

    try {
      await callRole(
        {
          role: "content_generation",
          messages: defaultMessages,
          outputSchema: testSchema,
        },
        createDependencies(["model-a", "model-b"], openRouter, {
          role: "content_generation",
        }),
      );
      throw new Error("expected AllModelsExhaustedError");
    } catch (error) {
      expect(error).toBeInstanceOf(AllModelsExhaustedError);
      const exhausted = error as AllModelsExhaustedError;
      expect(exhausted.attempts).toEqual([
        { model: "model-a", outcome: "rate_limited", detail: "429" },
        { model: "model-b", outcome: "timeout", detail: "timeout" },
      ]);
    }
  });
});
