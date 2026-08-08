import type { PostgrestError } from "@supabase/supabase-js";

import type { ApiErrorCode } from "./errors.js";
import { AppError } from "./errors.js";

const RPC_ERROR_MESSAGES: Record<
  string,
  { status: number; code: ApiErrorCode; message: string }
> = {
  UNAUTHORIZED: {
    status: 401,
    code: "UNAUTHORIZED",
    message: "Authentication required",
  },
  COURSE_NOT_FOUND: {
    status: 404,
    code: "COURSE_NOT_FOUND",
    message: "Course not found",
  },
  SOURCE_NOT_FOUND: {
    status: 404,
    code: "SOURCE_NOT_FOUND",
    message: "Source not found",
  },
  INVALID_STATE: {
    status: 400,
    code: "INVALID_STATE",
    message: "Operation is not allowed in the current state",
  },
};

export function throwMappedRpcError(error: PostgrestError): never {
  for (const [token, mapped] of Object.entries(RPC_ERROR_MESSAGES)) {
    if (error.message.includes(token)) {
      throw new AppError(mapped.status, mapped.code, mapped.message, false);
    }
  }

  throw error;
}
