// Shared video-URL helpers used by the LMS video block and the dashboard
// events "watch recording" flow.

export function isYouTubeUrl(url: string): boolean {
  return url.includes('youtube.com') || url.includes('youtu.be') || url.includes('youtube-nocookie.com')
}
