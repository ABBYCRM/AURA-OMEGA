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

router.post("/auth/login", (req, res) => {
  const rawBody = req.body;
  let u: unknown;
  let p: unknown;
  if (rawBody && typeof rawBody === "object") {
    if ("data" in rawBody && rawBody.data && typeof rawBody.data === "object") {
      u = (rawBody.data as any).username;
      p = (rawBody.data as any).password;
    }
    if (u === undefined) u = (rawBody as any).username;
    if (p === undefined) p = (rawBody as any).password;
  }
  const username = verifyCredentials(u, p);
  if (!username) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }
  const token = issueSessionToken(username);
  res
    .cookie(SESSION_COOKIE, token, sessionCookieOptions)
    .json({ authenticated: true, username, displayName: displayNameFor(username) });
});

router.get("/auth/me", (req, res) => {
  const token = verifySessionToken(req.cookies?.[SESSION_COOKIE]);
  if (!token) { res.json({ authenticated: false }); return; }
  res.json({ authenticated: true, username: token.username, displayName: displayNameFor(token.username) });
});

router.post("/auth/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions).json({ ok: true });
});

export default router;
