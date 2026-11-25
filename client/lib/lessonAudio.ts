// client/lib/lessonAudio.ts
// Lessons imported from the old site carry narration as raw HTML:
//   <audio controls><source src="https://….mp3" type="audio/mp3">Your browser does not support the audio element.</audio>
// The tutor renders lesson text as Markdown with HTML skipped (safety), which
// drops the tags but leaves the fallback sentence on screen and no player.
// splitLessonAudio takes those blocks out of the text and returns their
// sources, so the page can show a real player in their place.

const AUDIO_BLOCK = /<audio\b[^>]*>([\s\S]*?)<\/audio>/gi
const SRC_ATTR = /\bsrc\s*=\s*["']([^"']+)["']/gi

/** Only https files are played; anything else is dropped with its block. */
function safeAudioUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim())
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

export function splitLessonAudio(text: string): { text: string; audio: string[] } {
  const audio: string[] = []
  const rest = text.replace(AUDIO_BLOCK, (block) => {
    for (const m of block.matchAll(SRC_ATTR)) {
      const url = safeAudioUrl(m[1] ?? '')
      if (url && !audio.includes(url)) audio.push(url)
    }
    return ''
  })
  return { text: rest, audio }
}
