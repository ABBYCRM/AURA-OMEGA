import { Router } from "express";
import {
  SESSION_COOKIE,
  displayNameFor,
  issueSessionToken,
  sessionCookieOptions,
  verifyCredentials,
  verifySessionToken,
} from "../lib/auth";

const router = Router();

// Sign in as a named user. Issues an HttpOnly session cookie on success.
router.post("/auth/login", (req, res) => {
  const body = req.body as { username?: unknown; password?: unknown; data?: { username?: unknown; password?: unknown } } | undefined;
  const u = body?.username ?? body?.data?.username;
  const p = body?.password ?? body?.data?.password;
  const username = verifyCredentials(u, p);
  if (!username) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }
  const token = issueSessionToken(username);
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
  res.status(200).json({ authenticated: true, username, displayName: displayNameFor(username) });
});

// Sign out — clears the session cookie.
router.post("/auth/logout", (_req, res) => {
  const opts = sessionCookieOptions();
  res.clearCookie(SESSION_COOKIE, { ...opts, maxAge: undefined });
  res.status(200).json({ authenticated: false });
});

// Report whether the caller currently holds a valid session.
router.get("/auth/me", (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  const username = verifySessionToken(token);
  if (!username) {
    res.status(200).json({ authenticated: false });
    return;
  }
  res.status(200).json({ authenticated: true, username, displayName: displayNameFor(username) });
});

export default router;
