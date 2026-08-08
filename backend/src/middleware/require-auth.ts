import type { NextFunction, Request, Response } from "express";

import { extractBearerToken } from "../lib/auth.js";
import { AppError } from "../lib/errors.js";
import {
  createUserSupabaseClient,
  getAnonSupabaseClient,
} from "../lib/supabase.js";

function unauthorized(): never {
  throw new AppError(401, "UNAUTHORIZED", "Authentication required", false);
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
      unauthorized();
    }

    const anonClient = getAnonSupabaseClient();
    const {
      data: { user },
      error,
    } = await anonClient.auth.getUser(token);

    if (error || !user) {
      unauthorized();
    }

    req.user = { id: user.id };
    req.accessToken = token;
    req.supabase = createUserSupabaseClient(token);

    next();
  } catch (error) {
    next(error);
  }
}
