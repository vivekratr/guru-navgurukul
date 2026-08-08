import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

import { env } from "../config/index.js";
import { AppError } from "../lib/errors.js";

function formatZodMessage(error: ZodError): string {
  return error.issues.map((issue) => issue.message).join("; ");
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json(err.toJSON());
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: formatZodMessage(err),
        retryable: false,
      },
    });
    return;
  }

  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid JSON body",
        retryable: false,
      },
    });
    return;
  }

  if (env.NODE_ENV === "development") {
    console.error(err);
  } else {
    console.error(
      "Unexpected error:",
      err instanceof Error ? err.message : "Unknown error",
    );
  }

  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
      retryable: true,
    },
  });
};
