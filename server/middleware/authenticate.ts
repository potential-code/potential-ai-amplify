import type { Request, Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { eq } from "drizzle-orm";

import { auth } from "../auth";
import { db } from "../db";
import { users } from "../db/schema";

/** Shape attached to `req.user` once the request's session is confirmed. */
export interface AuthUser {
  userId: string;
  role: string;
}

// Extend Express Request so downstream handlers can access req.user without
// casting. Declaration merging lives in the same file to keep it co-located
// with the middleware that sets it.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express's own type augmentation point
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Session authentication middleware.
 *
 * Reads the Better Auth session from the request's cookie and attaches
 * `{ userId, role }` to `req.user`. Responds 401 when there is no valid
 * session. Only verified accounts ever hold a session.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  let session: Awaited<ReturnType<typeof auth.api.getSession>>;
  try {
    session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  } catch {
    session = null;
  }
  // Partner logins can be removed by an admin at any moment; don't let the
  // 5-minute cookie cache keep a removed partner in. Confirm with the database.
  if (session?.user.role === "partner") {
    try {
      session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers), query: { disableCookieCache: true } });
    } catch {
      session = null;
    }
  }
  if (!session) {
    res.status(401).json({ success: false, error: { message: "Please sign in to continue.", code: "UNAUTHORIZED" } });
    return;
  }

  req.user = { userId: session.user.id, role: session.user.role ?? "sme" };

  // Fire-and-forget: update lastActiveAt without blocking the request.
  db.update(users)
    .set({ lastActiveAt: new Date() })
    .where(eq(users.id, session.user.id))
    .catch(() => {});
  next();
}
