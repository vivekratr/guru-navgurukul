import { Router } from "express";

import { pingBodySchema } from "../../schemas/ping.js";
import authRouter from "./auth.js";
import coursesRouter from "./courses.js";
import pipelineRouter from "./pipeline.js";
import sourcesRouter from "./sources.js";

const v1Router = Router();

v1Router.get("/health", (_req, res) => {
  res.json({ status: "ok", api: "v1" });
});

v1Router.post("/ping", (req, res) => {
  const body = pingBodySchema.parse(req.body);
  res.json({ ok: true, message: body.message });
});

v1Router.use("/auth", authRouter);
v1Router.use("/pipeline", pipelineRouter);
v1Router.use("/courses", coursesRouter);
v1Router.use("/courses/:id/sources", sourcesRouter);

export default v1Router;
