import { Router } from "express";

import {
  createSender,
  getSenders,
  updateSender,
  deleteSender
} from "../controllers/sender.controller";

import {
  requireAuth
} from "../middleware/auth.middleware";

const router = Router();

router.post(
  "/",
  requireAuth,
  createSender
);

router.get(
  "/",
  requireAuth,
  getSenders
);

router.put(
  "/:id",
  requireAuth,
  updateSender
);

router.delete(
  "/:id",
  requireAuth,
  deleteSender
);

export default router;