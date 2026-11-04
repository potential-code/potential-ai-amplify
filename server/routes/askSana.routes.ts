import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { perUser, MINUTE } from "../middleware/limits";
import { authenticate } from "../middleware/authenticate";
import { DOCUMENT_MAX_BYTES, DocumentReadError, readDocumentText } from "../services/documentText.service";

/**
 * Ask Anna: documents a learner shares in the chat. The file is read in memory
 * and dropped; only its text comes back, and the browser sends that with the
 * learner's next message.
 */
const router: IRouter = Router();

const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DOCUMENT_MAX_BYTES, files: 1 },
});

const documentLimiter = perUser("ask-anna-documents", 10 * MINUTE, 20);

function fail(res: Response, status: number, message: string, code: string): void {
  res.status(status).json({ success: false, error: { message, code } });
}

/** multer reports the browser's UTF-8 filename as latin1; keep just a safe name. */
function cleanName(original: string): string {
  const utf8 = Buffer.from(original, "latin1").toString("utf8");
  const base = utf8.split(/[\\/]/).pop() ?? "document";
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  return base.replace(/[\u0000-\u001f]/g, "").slice(0, 120) || "document";
}

/**
 * POST /api/ask-sana/documents   multipart, field "file"
 * PDF, Word (.docx), TXT, Markdown or CSV up to 15 MB → { name, kind, size, pages?, text, truncated }
 */
router.post(
  "/documents",
  authenticate,
  documentLimiter,
  (req: Request, res: Response, next: NextFunction) => {
    documentUpload.single("file")(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        fail(res, 413, "That file is over 15 MB. Try a smaller one.", "FILE_TOO_LARGE");
        return;
      }
      if (err) {
        fail(res, 400, "That file couldn't be uploaded.", "UPLOAD_FAILED");
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      fail(res, 400, "Choose a file to share with Anna.", "NO_FILE");
      return;
    }
    try {
      const doc = await readDocumentText(req.file.buffer, cleanName(req.file.originalname));
      res.json({ success: true, data: doc });
    } catch (e) {
      if (e instanceof DocumentReadError) {
        fail(res, e.code === "UNSUPPORTED_TYPE" ? 415 : 422, e.message, e.code);
        return;
      }
      fail(res, 500, "That file couldn't be read. Try again.", "UNREADABLE");
    }
  },
);

export default router;
