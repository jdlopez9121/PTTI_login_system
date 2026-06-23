import assert from 'node:assert/strict'
import {
  normalizeVideoLinkInput,
  normalizeVideoLinkPatch,
  toVideoLinkResponse,
} from '../src/services/videoLinkService'

function expectBadInput(fn: () => unknown, messageIncludes: string) {
  assert.throws(fn, (error) => {
    assert(error instanceof Error)
    assert.match(error.message, new RegExp(messageIncludes, 'i'))
    return true
  })
}

const youtube = normalizeVideoLinkInput({
  title: '  OSHA Safety Orientation  ',
  videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&utm_source=ignore',
  displayOrder: 4,
})
assert.deepEqual(youtube, {
  title: 'OSHA Safety Orientation',
  videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&utm_source=ignore',
  embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
  displayOrder: 4,
})

const shortYoutube = normalizeVideoLinkInput({
  title: 'Short link',
  videoUrl: 'https://youtu.be/dQw4w9WgXcQ?si=abc',
})
assert.equal(shortYoutube.embedUrl, 'https://www.youtube.com/embed/dQw4w9WgXcQ')
assert.equal(shortYoutube.displayOrder, 0)

const vimeo = normalizeVideoLinkInput({
  title: 'Vimeo link',
  videoUrl: 'https://vimeo.com/123456789',
  displayOrder: 10,
})
assert.equal(vimeo.embedUrl, 'https://player.vimeo.com/video/123456789')

expectBadInput(() => normalizeVideoLinkInput({ title: '   ', videoUrl: 'https://youtu.be/dQw4w9WgXcQ' }), 'title')
expectBadInput(() => normalizeVideoLinkInput({ title: 'x'.repeat(121), videoUrl: 'https://youtu.be/dQw4w9WgXcQ' }), '120')
expectBadInput(() => normalizeVideoLinkInput({ title: 'Bad URL', videoUrl: 'javascript:alert(1)' }), 'http')
expectBadInput(() => normalizeVideoLinkInput({ title: 'Iframe', videoUrl: '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>' }), 'iframe')
expectBadInput(() => normalizeVideoLinkInput({ title: 'Unknown', videoUrl: 'https://example.com/watch?v=dQw4w9WgXcQ' }), 'unsupported')
expectBadInput(() => normalizeVideoLinkInput({ title: 'Bad order', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', displayOrder: 1.5 }), 'integer')

assert.deepEqual(
  normalizeVideoLinkPatch({ displayOrder: 2 }),
  { displayOrder: 2 },
)
expectBadInput(() => normalizeVideoLinkPatch({}), 'at least one')

const now = new Date('2026-06-23T14:30:00.000Z')
const response = toVideoLinkResponse({
  id: 'video-1',
  title: 'Orientation',
  videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
  embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
  displayOrder: 0,
  createdAt: now,
  updatedAt: now,
  createdByTeacher: { id: 'teacher-1', name: 'Jane Smith', email: 'jane@ptti.edu' },
  updatedByTeacher: null,
})
assert.deepEqual(response, {
  id: 'video-1',
  title: 'Orientation',
  videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
  embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
  displayOrder: 0,
  createdAt: '2026-06-23T14:30:00.000Z',
  updatedAt: '2026-06-23T14:30:00.000Z',
  createdBy: { id: 'teacher-1', name: 'Jane Smith', email: 'jane@ptti.edu' },
  updatedBy: null,
})

console.log('videoLinkService tests passed')
