export interface VideoLinkInput {
  title?: unknown
  videoUrl?: unknown
  displayOrder?: unknown
}

interface TeacherSummary {
  id: string
  name: string
  email: string
}

export interface VideoLinkRecord {
  id: string
  title: string
  videoUrl: string
  embedUrl: string
  displayOrder: number
  createdAt: Date
  updatedAt: Date
  createdByTeacher: TeacherSummary
  updatedByTeacher: TeacherSummary | null
}

export interface NormalizedVideoLinkInput {
  title: string
  videoUrl: string
  embedUrl: string
  displayOrder: number
}

export interface VideoLinkResponse {
  id: string
  title: string
  videoUrl: string
  embedUrl: string
  displayOrder: number
  createdAt: string
  updatedAt: string
  createdBy: TeacherSummary
  updatedBy: TeacherSummary | null
}

const MAX_TITLE_LENGTH = 120
const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{6,}$/
const VIMEO_ID_PATTERN = /^\d+$/

export function normalizeVideoLinkInput(input: VideoLinkInput): NormalizedVideoLinkInput {
  const title = normalizeTitle(input.title)
  const { videoUrl, embedUrl } = normalizeVideoUrl(input.videoUrl)
  const displayOrder = normalizeDisplayOrder(input.displayOrder)

  return { title, videoUrl, embedUrl, displayOrder }
}

export function normalizeVideoLinkPatch(input: VideoLinkInput): Partial<NormalizedVideoLinkInput> {
  const patch: Partial<NormalizedVideoLinkInput> = {}

  if (Object.prototype.hasOwnProperty.call(input, 'title')) {
    patch.title = normalizeTitle(input.title)
  }

  if (Object.prototype.hasOwnProperty.call(input, 'videoUrl')) {
    const { videoUrl, embedUrl } = normalizeVideoUrl(input.videoUrl)
    patch.videoUrl = videoUrl
    patch.embedUrl = embedUrl
  }

  if (Object.prototype.hasOwnProperty.call(input, 'displayOrder')) {
    patch.displayOrder = normalizeDisplayOrder(input.displayOrder)
  }

  if (Object.keys(patch).length === 0) {
    throw new Error('At least one of title, videoUrl, or displayOrder is required')
  }

  return patch
}

export function toVideoLinkResponse(record: VideoLinkRecord): VideoLinkResponse {
  return {
    id: record.id,
    title: record.title,
    videoUrl: record.videoUrl,
    embedUrl: record.embedUrl,
    displayOrder: record.displayOrder,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    createdBy: record.createdByTeacher,
    updatedBy: record.updatedByTeacher,
  }
}

function normalizeTitle(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Title is required')
  }

  const title = value.trim()
  if (!title) {
    throw new Error('Title is required')
  }
  if (title.length > MAX_TITLE_LENGTH) {
    throw new Error(`Title must be ${MAX_TITLE_LENGTH} characters or fewer`)
  }

  return title
}

function normalizeDisplayOrder(value: unknown): number {
  if (value === undefined || value === null || value === '') {
    return 0
  }

  const displayOrder = Number(value)
  if (!Number.isInteger(displayOrder)) {
    throw new Error('displayOrder must be an integer')
  }
  if (displayOrder < 0) {
    throw new Error('displayOrder must be greater than or equal to 0')
  }

  return displayOrder
}

function normalizeVideoUrl(value: unknown): { videoUrl: string; embedUrl: string } {
  if (typeof value !== 'string') {
    throw new Error('videoUrl is required')
  }

  const videoUrl = value.trim()
  if (!videoUrl) {
    throw new Error('videoUrl is required')
  }
  if (/<\s*iframe\b/i.test(videoUrl)) {
    throw new Error('Raw iframe HTML is not allowed')
  }

  let parsed: URL
  try {
    parsed = new URL(videoUrl)
  } catch {
    throw new Error('videoUrl must be a valid URL')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('videoUrl must use http or https')
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')

  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const id = parsed.pathname === '/watch'
      ? parsed.searchParams.get('v')
      : parsed.pathname.startsWith('/embed/')
        ? parsed.pathname.split('/').filter(Boolean)[1]
        : null

    if (!id || !YOUTUBE_ID_PATTERN.test(id)) {
      throw new Error('Unsupported YouTube URL or missing video id')
    }

    return { videoUrl, embedUrl: `https://www.youtube.com/embed/${id}` }
  }

  if (host === 'youtu.be') {
    const id = parsed.pathname.split('/').filter(Boolean)[0]
    if (!id || !YOUTUBE_ID_PATTERN.test(id)) {
      throw new Error('Unsupported YouTube URL or missing video id')
    }

    return { videoUrl, embedUrl: `https://www.youtube.com/embed/${id}` }
  }

  if (host === 'vimeo.com') {
    const id = parsed.pathname.split('/').filter(Boolean)[0]
    if (!id || !VIMEO_ID_PATTERN.test(id)) {
      throw new Error('Unsupported Vimeo URL or missing video id')
    }

    return { videoUrl, embedUrl: `https://player.vimeo.com/video/${id}` }
  }

  if (host === 'player.vimeo.com') {
    const parts = parsed.pathname.split('/').filter(Boolean)
    const id = parts[0] === 'video' ? parts[1] : null
    if (!id || !VIMEO_ID_PATTERN.test(id)) {
      throw new Error('Unsupported Vimeo URL or missing video id')
    }

    return { videoUrl, embedUrl: `https://player.vimeo.com/video/${id}` }
  }

  throw new Error('Unsupported video URL provider')
}
