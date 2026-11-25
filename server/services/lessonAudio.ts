// Lessons imported from the old WordPress site carry narration as raw HTML:
//   <audio controls><source src="https://….mp3" type="audio/mp3">Your browser does not support the audio element.</audio>
// htmlToMarkdown (tutor.service.ts) drops these blocks, fallback sentence
// included, and lessonAudio() lists their files so a card can play them.

const AUDIO_BLOCK = /<\s*audio\b[^>]*>[\s\S]*?<\s*\/\s*audio\s*>/gi;
const SRC_ATTR = /\bsrc\s*=\s*["']([^"']+)["']/gi;

/** Removes every <audio>…</audio> block, fallback text and all. */
export const stripAudio = (html: string): string => html.replace(AUDIO_BLOCK, "");

/** The https files the <audio> blocks in this HTML play, each once, in order. */
export function lessonAudio(html: string | null | undefined): string[] {
  const out: string[] = [];
  for (const block of (html ?? "").match(AUDIO_BLOCK) ?? []) {
    for (const m of block.matchAll(SRC_ATTR)) {
      try {
        const url = new URL((m[1] ?? "").trim());
        if (url.protocol === "https:" && !out.includes(url.toString())) out.push(url.toString());
      } catch {
        // not a URL: skipped
      }
    }
  }
  return out;
}
