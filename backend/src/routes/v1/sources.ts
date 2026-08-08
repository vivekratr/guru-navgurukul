import type { NextFunction, Request, Response, RequestHandler } from "express";
import { Router } from "express";

import { requireAuth } from "../../middleware/require-auth.js";
import { courseIdParamSchema } from "../../schemas/course.js";
import {
  createSourceBodySchema,
  sourceIdParamSchema,
} from "../../schemas/source.js";
import * as sourceService from "../../services/source-service.js";

function asyncHandler(
  handler: (req: Request, res: Response) => Promise<void>,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res).catch(next);
  };
}

const sourcesRouter = Router({ mergeParams: true });

sourcesRouter.use(requireAuth);

sourcesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const courseId = courseIdParamSchema.parse(req.params.id);
    const body = createSourceBodySchema.parse(req.body);
    const source = await sourceService.createSource(
      req.supabase!,
      req.user!.id,
      courseId,
      body,
    );

    res.status(201).json(source);
  }),
);

sourcesRouter.delete(
  "/:sourceId",
  asyncHandler(async (req, res) => {
    const courseId = courseIdParamSchema.parse(req.params.id);
    const sourceId = sourceIdParamSchema.parse(req.params.sourceId);
    const source = await sourceService.cancelSource(
      req.supabase!,
      courseId,
      sourceId,
    );

    res.status(200).json({ id: source.id, status: source.status });
  }),
);

sourcesRouter.post(
  "/:sourceId/retry",
  asyncHandler(async (req, res) => {
    const courseId = courseIdParamSchema.parse(req.params.id);
    const sourceId = sourceIdParamSchema.parse(req.params.sourceId);
    const source = await sourceService.retrySource(
      req.supabase!,
      courseId,
      sourceId,
    );

    res.status(200).json({ id: source.id, status: source.status });
  }),
);

export default sourcesRouter;
