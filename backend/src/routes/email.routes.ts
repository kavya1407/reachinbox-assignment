import { Router } from "express";

import {
  createScheduledEmail,
  getScheduledEmails,
  getSentEmails,
  searchScheduledEmails
} from "../controllers/email.controller";

import {
  requireAuth
} from "../middleware/auth.middleware";

const router = Router();

router.post(
  "/schedule",
  requireAuth,
  createScheduledEmail
);

router.get(
  "/scheduled",
  requireAuth,
  getScheduledEmails
);

router.get(
  "/sent",
  requireAuth,
  getSentEmails
);

router.get(
  "/search",
  requireAuth,
  searchScheduledEmails
);

export default router;