import { Router } from "express";

import {
  composeEmails
} from "../controllers/compose.controller";

import {
  requireAuth
} from "../middleware/auth.middleware";

const router = Router();

router.post(
  "/",
  requireAuth,
  composeEmails
);

export default router;