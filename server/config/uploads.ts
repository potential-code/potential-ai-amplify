import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Where uploaded and generated files live: `<server>/uploads` (`/app/uploads`
 * in the image, the named volume that survives redeploys). Every writer and
 * the /uploads static route resolve through this, so they always agree.
 *
 * This file sits one level below the server root both as source
 * (`server/config`) and bundled (`dist/index.mjs`), so `..` is the server
 * root either way. Paths resolved from other folders disagreed whenever the
 * code ran unbundled, as under `bun test`: the static route looked in the
 * repo root while uploads went to server/uploads. (From SMEEP 1507451.)
 */
export const UPLOADS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "uploads");

/** A path under the uploads root, e.g. `uploadsPath("certificates")`. */
export const uploadsPath = (...parts: string[]): string => path.join(UPLOADS_ROOT, ...parts);
