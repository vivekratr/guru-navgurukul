export const API_ERROR_CODES = [
  "SOURCE_TOO_LARGE",
  "INVALID_FILE_TYPE",
  "VIDEO_TOO_LONG",
  "COURSE_NOT_FOUND",
  "SOURCE_NOT_FOUND",
  "UNAUTHORIZED",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
  "VALIDATION_ERROR",
  "INVALID_STATE",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    retryable: boolean;
  };
};

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly retryable: boolean;

  constructor(
    statusCode: number,
    code: ApiErrorCode,
    message: string,
    retryable: boolean,
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.retryable = retryable;
  }

  toJSON(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        retryable: this.retryable,
      },
    };
  }
}
