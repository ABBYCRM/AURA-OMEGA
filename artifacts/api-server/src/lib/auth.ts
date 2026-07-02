import { timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

/**
 * Login/auth was REMOVED per operator directive (2026-07-02) — the app has no
 * sign-in, no sessions, and no cookies. What remains here are the two
 * primitives other modules still need:
 *
 *   - timingSafeStrEqual: constant-time secret comparison used by the
 *     external API-key gate (routes/external.ts) and world routes.
 *   - requireOperator: a no-op passthrough kept so route files that still
 *     reference it keep working; it tags the request as "operator".
 */

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

/**
 * Express middleware — AUTH REMOVED per operator directive.
 * Passes all requests through with "operator" as the default user so any
 * route that still imports requireOperator works without changes.
 */
export function requireOperator(req: Request, _res: Response, next: NextFunction): void {
  (req as Request & { authUser?: string }).authUser = "operator";
  next();
}
