import { Router } from "express";

import { requireAuth } from "../../middleware/require-auth.js";

const authRouter = Router();

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user!.id,
    },
  });
});

export default authRouter;
