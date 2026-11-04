import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Lets each signed-in user run only one request of this kind at a time (e.g.
 * an AI learning-path build that can take minutes). A second one while the
 * first is still running gets 409 instead of starting another expensive job.
 * In memory: one API instance, cleared on deploy.
 */
export function oneAtATime(name: string): RequestHandler {
  const running = new Set<string>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${name}:${req.user?.userId ?? req.ip}`;
    if (running.has(key)) {
      res.status(409).json({
        success: false,
        error: { message: "Your learning path is already being built. Please wait for it to finish.", code: "ALREADY_RUNNING" },
      });
      return;
    }
    running.add(key);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      running.delete(key);
    };
    res.on("finish", release);
    res.on("close", release);
    next();
  };
}
