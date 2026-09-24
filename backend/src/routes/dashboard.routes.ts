import { Router } from "express";
import { getDashboard } from "../controllers/dashboard.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.get(
  "/",
  requireAuth,
  getDashboard
);

export default router;