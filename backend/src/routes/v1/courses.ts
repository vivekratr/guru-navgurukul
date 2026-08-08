import type { NextFunction, Request, Response, RequestHandler } from "express";
import { Router } from "express";

import { requireAuth } from "../../middleware/require-auth.js";
import { flashcardExportQuerySchema } from "../../schemas/artifact-read.js";
import {
  courseIdParamSchema,
  createCourseBodySchema,
} from "../../schemas/course.js";
import * as courseService from "../../services/course-service.js";
import * as generationService from "../../services/generation-service.js";
import * as readService from "../../services/read-service.js";

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
  "/:id/summary",
  asyncHandler(async (req, res) => {
    const courseId = courseIdParamSchema.parse(req.params.id);
    const summary = await readService.getCourseSummary(req.supabase!, courseId);
    res.json(summary);
  }),
);

coursesRouter.get(
  "/:id/flashcards/export",
  asyncHandler(async (req, res) => {
    const courseId = courseIdParamSchema.parse(req.params.id);
    const { format } = flashcardExportQuerySchema.parse(req.query);

    if (format === "json") {
      const exported = await readService.exportCourseFlashcardsJson(
        req.supabase!,
        courseId,
      );

      res
        .type("application/json")
        .set(
          "Content-Disposition",
          `attachment; filename="${exported.filename}"`,
        )
        .send(exported.body);
      return;
    }

    const exported = await readService.exportCourseFlashcardsCsv(
      req.supabase!,
      courseId,
    );

    res
      .type("text/csv")
      .set(
        "Content-Disposition",
        `attachment; filename="${exported.filename}"`,
      )
      .send(exported.body);
  }),
);

coursesRouter.get(
  "/:id/flashcards",
  asyncHandler(async (req, res) => {
    const courseId = courseIdParamSchema.parse(req.params.id);
    const flashcards = await readService.getCourseFlashcards(
      req.supabase!,
      courseId,
    );
    res.json(flashcards);
  }),
);

coursesRouter.get(
  "/:id/concept-graph",
  asyncHandler(async (req, res) => {
    const courseId = courseIdParamSchema.parse(req.params.id);
    const graph = await readService.getCourseConceptGraph(
      req.supabase!,
      courseId,
    );
    res.json(graph);
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

coursesRouter.post(
  "/:id/retry-artifact/:artifactType",
  asyncHandler(async (req, res) => {
    const courseId = courseIdParamSchema.parse(req.params.id);
    const artifactType = req.params.artifactType;

    if (artifactType !== "flashcards" && artifactType !== "summary") {
      res.status(400).json({
        error: {
          code: "INVALID_STATE",
          message: "artifactType must be flashcards or summary",
          retryable: false,
        },
      });
      return;
    }

    const result = await generationService.retryArtifact(
      req.supabase!,
      courseId,
      artifactType,
    );

    res.status(202).json(result);
  }),
);

export default coursesRouter;
