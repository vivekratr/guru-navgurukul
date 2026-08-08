import { Router } from "express";

import { pingBodySchema } from "../../schemas/ping.js";

const v1Router = Router();

v1Router.get("/health", (_req, res) => {
  res.json({ status: "ok", api: "v1" });
});

v1Router.post("/ping", (req, res) => {
  const body = pingBodySchema.parse(req.body);
  res.json({ ok: true, message: body.message });
});

export default v1Router;
