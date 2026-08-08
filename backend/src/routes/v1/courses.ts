import type { NextFunction, Request, Response, RequestHandler } from "express";
import { Router } from "express";

import { requireAuth } from "../../middleware/require-auth.js";
import {
  courseIdParamSchema,
  createCourseBodySchema,
} from "../../schemas/course.js";
import * as courseService from "../../services/course-service.js";
import * as generationService from "../../services/generation-service.js";

function asyncHandler(
  handler: (req: Request, res: Response) => Promise<void>,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res).catch(next);
  };
}

const coursesRouter = Router();

coursesRouter.use(requireAuth);

coursesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createCourseBodySchema.parse(req.body);
    const course = await courseService.createCourse(
      req.supabase!,
      req.user!.id,
      body.title,
    );

    res.status(201).json(course);
  }),
);

coursesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const result = await courseService.listCourses(req.supabase!);
    res.json(result);
  }),
);

coursesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const courseId = courseIdParamSchema.parse(req.params.id);
    const course = await courseService.getCourseDetail(req.supabase!, courseId);
    res.json(course);
  }),
);

coursesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const courseId = courseIdParamSchema.parse(req.params.id);
    await courseService.deleteCourse(req.supabase!, courseId);
    res.status(204).send();
  }),
);

coursesRouter.post(
  "/:id/generate",
  asyncHandler(async (req, res) => {
    const courseId = courseIdParamSchema.parse(req.params.id);
    const course = await generationService.generateCourse(
      req.supabase!,
      courseId,
    );

    res.status(202).json(course);
  }),
);

coursesRouter.post(
  "/:id/retry-knowledge-extraction",
  asyncHandler(async (req, res) => {
    const courseId = courseIdParamSchema.parse(req.params.id);
    const course = await generationService.retryKnowledgeExtraction(
      req.supabase!,
      courseId,
    );

    res.status(202).json(course);
  }),
);

export default coursesRouter;
