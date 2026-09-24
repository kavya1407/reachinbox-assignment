import { Router } from "express";

import {
  googleLogin,
  googleCallback,
  logout,
  getCurrentUser
} from "../controllers/auth.controller";

const router = Router();

router.get(
  "/google",
  googleLogin
);

router.get(
  "/google/callback",
  googleCallback
);

router.post(
  "/logout",
  logout
);

router.get(
  "/me",
  getCurrentUser
);

export default router;