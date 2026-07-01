import {
  createHmac,
  scryptSync,
  timingSafeEqual,
  randomBytes,
} from "node:crypto";
import type { Request, Response, NextFunction } from "express";

/**
 * User authentication for AURA-OMEGA.
 *
 * Protected routes may only be reached by a signed-in named user. Accounts are
 * configured via the `AUTH_USERS` env var — semicolon-separated entries of
 * `username:password:Display Name`. On success we mint a stateless,
 * HMAC-signed session token (signed with a key derived from `SESSION_SECRET`)
 * carrying the username as `sub`, and set it as an HttpOnly cookie. Every
 * protected request is re-validated against that token, including a live
 * recheck that the username is still configured — removing a user from
 * `AUTH_USERS` immediately invalidates their outstanding sessions.
 *
 * `OPERATOR_PASSWORD` is kept as a legacy fallback (username "operator") so an
 * in-flight deploy never locks everyone out while `AUTH_USERS` propagates.
 *
 * We fail closed: if no users are configured or `SESSION_SECRET` is unset, no
 * token can ever be minted or verified, so protected routes reject every
 * caller. The vault is locked rather than silently open.
 */

export const SESSION_COOKIE = "aura-omega-ui_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 hours

let cachedKey: Buffer | null = null;

/** Derive the signing key from SESSION_SECRET. Throws if it is unset. */
function getSigningKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env["SESSION_SECRET"];
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is required for operator auth — refusing to operate without it.",
    );
  }
  cachedKey = scryptSync(secret, "aura-omega-ui-auth-v1", 32);
  return cachedKey;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

function sign(payload: string): string {
  return createHmac("sha256", getSigningKey()).update(payload).digest("base64url");
}

interface AuthUser {
  username: string;
  password: string;
  displayName: string;
}

/** Parse `AUTH_USERS` (`username:password:Display Name;...`) plus the legacy
 *  single-password fallback. Cached for AUTH_USERS_CACHE_TTL ms so env var
 *  changes take effect without a restart, but parsing overhead is amortised. */
function getConfiguredUsers(): AuthUser[] {
  const now = Date.now();
  if (cachedUsers && now - cachedUsersAt < AUTH_USERS_CACHE_TTL) {
    return cachedUsers;
  }
  const users: AuthUser[] = [];
  const raw = process.env["AUTH_USERS"];
  if (raw) {
    for (const entry of raw.split(";")) {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      const [username, password, ...rest] = trimmed.split(":");
      if (!username || !password) continue;
      users.push({
        username: username.trim().toLowerCase(),
        password,
        displayName: rest.join(":").trim() || username,
      });
    }
  }
  const legacy = process.env["OPERATOR_PASSWORD"];
  if (legacy && !users.some((u) => u.username === "operator")) {
    users.push({ username: "operator", password: legacy, displayName: "Operator" });
  }
  cachedUsers = users;
  cachedUsersAt = now;
  return users;
}

/** Verify a username/password pair against configured users. Returns the
 *  canonical (lowercased) username on success, or null on any failure. */
export function verifyCredentials(username: unknown, password: unknown): string | null {
  if (
    typeof username !== "string" || typeof password !== "string" ||
    username.length === 0 || password.length === 0
  ) {
    return null;
  }
  const normalized = username.trim().toLowerCase();
  for (const user of getConfiguredUsers()) {
    if (user.username === normalized && timingSafeStrEqual(password, user.password)) {
      return user.username;
    }
  }
  return null;
}

/** Display name for a username, falling back to the username itself. */
export function displayNameFor(username: string): string {
  return getConfiguredUsers().find((u) => u.username === username)?.displayName ?? username;
}

/**
 * Constant-time string comparison. Pads both inputs to the same length to
 * prevent length-leak timing attacks, then uses Node.js timingSafeEqual.
 * Returns true only if both strings are identical in content and length.
 */
export function timingSafeStrEqual(a: string, b: string): boolean {
  // Encode both strings as UTF-8 buffers
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // Use the MAX length as the padding target — timing leaks the MAX of the
  // two lengths but NOT which is longer (both are padded to the same size)
  const maxLen = Math.max(bufA.length, bufB.length);
  // Pad both to maxLen with zeros — timingSafeEqual requires equal length
  const paddedA = Buffer.alloc(maxLen);
  const paddedB = Buffer.alloc(maxLen);
  bufA.copy(paddedA);
  bufB.copy(paddedB);
  return timingSafeEqual(paddedA, paddedB) && bufA.length === bufB.length;
}

// Simple TTL cache for configured users — env vars change rarely
let cachedUsers: AuthUser[] | null = null;
let cachedUsersAt = 0;
const AUTH_USERS_CACHE_TTL = 30_000; // 30 seconds

/** Invalidate the AUTH_USERS cache. Call after env var changes. */
export function invalidateAuthUsersCache(): void {
  cachedUsers = null;
  cachedUsersAt = 0;
}

/** Mint a signed session token for `username` that expires after SESSION_TTL_SECONDS. */
export function issueSessionToken(username: string): string {
  const payload = {
    sub: username,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    nonce: randomBytes(8).toString("hex"),
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

/** Validate a session token's signature, expiry, and that its username is
 *  still configured. Returns the username on success, or null on any failure. */
export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const users = getConfiguredUsers();
  // Auth is only possible when at least one user is configured; otherwise fail closed.
  if (users.length === 0) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, mac] = parts;

  let expectedMac: string;
  try {
    expectedMac = sign(body);
  } catch {
    return null; // SESSION_SECRET missing → fail closed
  }

  const macBuf = Buffer.from(mac);
  const expBuf = Buffer.from(expectedMac);
  if (macBuf.length !== expBuf.length || !timingSafeEqual(macBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      exp?: number;
      sub?: string;
    };
    if (typeof payload.sub !== "string") return null;
    if (typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    if (!users.some((u) => u.username === payload.sub)) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

/** Build the Set-Cookie options for the session cookie. */
export function sessionCookieOptions(): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS * 1000,
  };
}

/** Extract a session token from the cookie or an Authorization: Bearer header. */
function extractToken(req: Request): string | null {
  const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.[
    SESSION_COOKIE
  ];
  if (cookieToken) return cookieToken;
  const auth = req.headers["authorization"];
  if (typeof auth === "string" && /^Bearer\s+/i.test(auth)) {
    return auth.replace(/^Bearer\s+/i, "");
  }
  return null;
}

/**
 * Express middleware that rejects any request lacking a valid user session.
 * Responses are intentionally generic so anonymous callers learn nothing about
 * the protected resource (e.g. stored secret names). On success, attaches the
 * signed-in username to `req.authUser`.
 */
export function requireOperator(req: Request, res: Response, next: NextFunction): void {
  const user = verifySessionToken(extractToken(req));
  if (user) {
    (req as Request & { authUser?: string }).authUser = user;
    next();
    return;
  }
  res.status(401).json({ error: "Unauthorized — sign-in required" });
}
