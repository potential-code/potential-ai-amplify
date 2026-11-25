import { describe, it, expect } from 'bun:test'
import { lessonAudio, stripAudio } from '../services/lessonAudio'
import { htmlToMarkdown } from '../services/tutor.service'

/**
 * 36 imported lessons carry narration as an <audio> tag. The tutor's text must
 * not show its "Your browser does not support…" fallback, and the intro card
 * gets the file to play instead.
 */
const LESSON = `<audio controls>
  <source src="https://educate.potential.com/wp-content/uploads/2023/09/Introduction-to-AI.mp3" type="audio/mp3">
  Your browser does not support the audio element.
</audio>

<h5>AI, or Artificial Intelligence</h5><p>Machine Learning (ML) is where computers learn from data.</p>`

describe('lesson narration', () => {
  it('leaves the narration and its fallback text out of the lesson text', () => {
    const md = htmlToMarkdown(LESSON)
    expect(md).not.toContain('does not support the audio')
    expect(md).toContain('Machine Learning (ML) is where computers learn from data.')
    expect(md).toContain('AI, or Artificial Intelligence')
  })

  it('lists the narration file to play, each once', () => {
    expect(lessonAudio(LESSON)).toEqual(['https://educate.potential.com/wp-content/uploads/2023/09/Introduction-to-AI.mp3'])
    expect(lessonAudio('<audio src="https://a.example/x.mp3" controls></audio><AUDIO><source src=\'https://a.example/x.mp3\'></AUDIO>')).toEqual(['https://a.example/x.mp3'])
  })

  it('plays only https files', () => {
    expect(lessonAudio('<audio><source src="javascript:alert(1)"></audio><audio src="http://a.example/x.mp3"></audio>')).toEqual([])
    expect(stripAudio('<audio src="http://a.example/x.mp3">x</audio>Hello')).toBe('Hello')
  })

  it('handles lessons without narration', () => {
    expect(lessonAudio(null)).toEqual([])
    expect(lessonAudio('<p>Just text</p>')).toEqual([])
  })
})
