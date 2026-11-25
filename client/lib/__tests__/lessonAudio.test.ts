import { describe, expect, it } from 'bun:test'
import { splitLessonAudio } from '../lessonAudio'

const LESSON = `<audio controls>
  <source src="https://educate.potential.com/wp-content/uploads/2023/09/Introduction-to-AI.mp3" type="audio/mp3">
  Your browser does not support the audio element.
</audio>

<h5>AI, or Artificial Intelligence</h5>
Machine Learning (ML) is where computers learn from data.`

describe('splitLessonAudio', () => {
  it('takes the narration out of the text and returns its file', () => {
    const { text, audio } = splitLessonAudio(LESSON)
    expect(audio).toEqual(['https://educate.potential.com/wp-content/uploads/2023/09/Introduction-to-AI.mp3'])
    expect(text).not.toContain('does not support the audio')
    expect(text).not.toContain('<audio')
    expect(text).toContain('Machine Learning (ML) is where computers learn from data.')
  })

  it('reads a src on the audio tag itself and lists each file once', () => {
    const { audio } = splitLessonAudio('<audio src="https://a.example/x.mp3" controls></audio> and <AUDIO><source src=\'https://a.example/x.mp3\'></AUDIO>')
    expect(audio).toEqual(['https://a.example/x.mp3'])
  })

  it('drops anything that is not an https file', () => {
    const { text, audio } = splitLessonAudio('<audio><source src="javascript:alert(1)"></audio><audio src="http://a.example/x.mp3"></audio>Hello')
    expect(audio).toEqual([])
    expect(text).toBe('Hello')
  })

  it('leaves text without audio unchanged', () => {
    expect(splitLessonAudio('Just **text**.')).toEqual({ text: 'Just **text**.', audio: [] })
  })
})
