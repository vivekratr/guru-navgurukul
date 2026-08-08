import type { NextFunction, Request, Response, RequestHandler } from "express";
import { Router } from "express";

import { requireAuth } from "../../middleware/require-auth.js";
import { runPipelineTick } from "../../services/pipeline-tick-service.js";

function asyncHandler(
  handler: (req: Request, res: Response) => Promise<void>,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res).catch(next);
  };
}

const pipelineRouter = Router();

pipelineRouter.use(requireAuth);

pipelineRouter.post(
  "/tick",
  asyncHandler(async (_req, res) => {
    const result = await runPipelineTick();
    res.json(result);
  }),
);

export default pipelineRouter;
