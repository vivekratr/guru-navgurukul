import type { ModelAttemptDiagnostic, ModelRole } from "./types.js";

export class LlmRoutingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class RateLimitError extends LlmRoutingError {}

export class ProviderError extends LlmRoutingError {
  readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

export class TimeoutError extends LlmRoutingError {}

export class InvalidModelOutputError extends LlmRoutingError {
  readonly validationErrors: string;

  constructor(message: string, validationErrors: string) {
    super(message);
    this.validationErrors = validationErrors;
  }
}

export class ConfigurationError extends LlmRoutingError {}

export class AllModelsExhaustedError extends LlmRoutingError {
  readonly role: ModelRole;
  readonly attempts: ModelAttemptDiagnostic[];

  constructor(role: ModelRole, attempts: ModelAttemptDiagnostic[]) {
    super(`All models exhausted for role "${role}"`);
    this.role = role;
    this.attempts = attempts;
  }
}
