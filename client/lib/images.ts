/**
 * The optimised copy of a public image, when one exists. Amplify does not yet
 * generate compressed .webp copies (AI Amplify's scripts/optimize-images.mjs), so
 * this returns the path unchanged; components call it so that adding the
 * optimiser later needs no component changes.
 */
export function optimizedSrc<T extends string | null | undefined>(src: T): T {
  return src
}
