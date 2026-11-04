import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

/**
 * Reads the text out of a document a learner shares with Ask Anna, so Anna can
 * answer from it. Nothing is stored: the file is read in memory and only its
 * text goes back to the browser, which sends it with the learner's next
 * message.
 */

export const DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;
/** What Anna reads of a document: enough for a business plan, not a book. */
export const DOCUMENT_MAX_CHARS = 20_000;

export type DocumentKind = "pdf" | "docx" | "text";

export type DocumentText = {
  name: string;
  kind: DocumentKind;
  size: number;
  /** The document's text, cut to DOCUMENT_MAX_CHARS. */
  text: string;
  truncated: boolean;
  pages?: number;
};

export class DocumentReadError extends Error {
  constructor(
    message: string,
    readonly code: "UNSUPPORTED_TYPE" | "EMPTY_DOCUMENT" | "UNREADABLE",
  ) {
    super(message);
  }
}

const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "csv"]);

/** The kind from the file's own bytes, with the extension only telling text apart. */
export function documentKind(buffer: Buffer, filename: string): DocumentKind | null {
  if (buffer.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  // .docx is a zip; an old binary .doc is not, and isn't supported.
  if (ext === "docx" && buffer[0] === 0x50 && buffer[1] === 0x4b) return "docx";
  if (TEXT_EXTENSIONS.has(ext) && !buffer.subarray(0, 4096).includes(0)) return "text";
  return null;
}

function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function readDocumentText(buffer: Buffer, filename: string): Promise<DocumentText> {
  const kind = documentKind(buffer, filename);
  if (!kind) {
    throw new DocumentReadError("Anna can read PDF, Word (.docx), text, Markdown and CSV files.", "UNSUPPORTED_TYPE");
  }

  let raw: string;
  let pages: number | undefined;
  try {
    if (kind === "pdf") {
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const result = await extractText(pdf, { mergePages: true });
      raw = result.text;
      pages = result.totalPages;
    } else if (kind === "docx") {
      raw = (await mammoth.extractRawText({ buffer })).value;
    } else {
      raw = buffer.toString("utf8");
    }
  } catch {
    throw new DocumentReadError("This file couldn't be read. It may be damaged or password-protected.", "UNREADABLE");
  }

  const text = tidy(raw);
  if (!text) {
    throw new DocumentReadError(
      kind === "pdf"
        ? "This PDF has no text Anna can read (it may be a scan)."
        : "This file is empty.",
      "EMPTY_DOCUMENT",
    );
  }

  const truncated = text.length > DOCUMENT_MAX_CHARS;
  return {
    name: filename,
    kind,
    size: buffer.length,
    text: truncated ? text.slice(0, DOCUMENT_MAX_CHARS) : text,
    truncated,
    ...(pages ? { pages } : {}),
  };
}
