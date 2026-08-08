export const MODEL_ROLES = [
  "vision_ingest",
  "knowledge_extraction",
  "content_generation",
] as const;

export type ModelRole = (typeof MODEL_ROLES)[number];

export type RoleConfig = {
  role: ModelRole;
  chain: string[];
  max_tokens: number;
  timeout_ms: number;
};

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ChatContentPart[];
};

export type ChatCompletionRequest = {
  model: string;
  messages: ChatMessage[];
  max_tokens: number;
  timeout_ms: number;
};

export type ChatCompletionResponse = {
  content: string;
};

export interface OpenRouterClient {
  chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
}

export type ModelAttemptOutcome =
  | "success"
  | "rate_limited"
  | "provider_error"
  | "timeout"
  | "invalid_output";

export type ModelAttemptDiagnostic = {
  model: string;
  outcome: ModelAttemptOutcome;
  detail?: string;
};

export type CallRoleResult<T> = {
  data: T;
  model_used: string;
};
