import { z } from "zod";

/**
 * True for http(s) addresses only. zod's .url() also accepts `javascript:`,
 * `data:` and other schemes, which turn a stored link into script once it is
 * rendered as an <a href> (in a page or an email).
 */
export const isHttpUrl = (value: string) => /^https?:\/\/[^\s]+$/i.test(value);

/** A web address: a valid URL that starts with http:// or https://. */
export const httpUrl = (max = 1000) =>
  z.string().url("Must be a valid URL").max(max).refine(isHttpUrl, "Must start with http:// or https://");
