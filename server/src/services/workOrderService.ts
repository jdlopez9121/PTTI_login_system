import fs from 'fs/promises'
import path from 'path'

export type WorkOrderAssigneeTypeValue = 'student' | 'teacher'
export type WorkOrderStatusValue = 'open' | 'assigned' | 'in_progress' | 'submitted_completed' | 'completed' | 'cancelled'
export type WorkOrderMessageVisibilityValue = 'teacher_only'

export interface WorkOrderTemplateSnapshotSource {
  id: string
  name: string
  versionLabel: string
  description: string | null
  photoPath: string
  photoUrl: string
  photoMimeType: string
  photoSizeBytes: number
  originalFilename: string
}

export interface WorkOrderAssigneeInput {
  assigneeStudentId?: string | null
  publicStudentId?: string | null
  assigneeTeacherId?: string | null
}

export type WorkOrderAssigneeValidation =
  | { ok: true; assigneeType: WorkOrderAssigneeTypeValue; assigneeStudentId: string | null; assigneeTeacherId: string | null }
  | { ok: false; error: string }

export function validateOneAssignee(input: WorkOrderAssigneeInput): WorkOrderAssigneeValidation {
  const assigneeStudentId = input.assigneeStudentId?.trim() || null
  const publicStudentId = input.publicStudentId?.trim() || null
  const assigneeTeacherId = input.assigneeTeacherId?.trim() || null
  const studentIdentifier = assigneeStudentId || publicStudentId

  if (assigneeStudentId && publicStudentId) {
    return { ok: false, error: 'Provide either the student database id or public student ID, not both' }
  }
  if (studentIdentifier && assigneeTeacherId) {
    return { ok: false, error: 'Assign a work order to either a student or a teacher, not both' }
  }
  if (!studentIdentifier && !assigneeTeacherId) {
    return { ok: false, error: 'Exactly one assignee is required' }
  }
  return {
    ok: true,
    assigneeType: studentIdentifier ? 'student' : 'teacher',
    assigneeStudentId: studentIdentifier,
    assigneeTeacherId,
  }
}

export function buildStudentAssigneeLookup(input: { studentRecordId?: string | null; publicStudentId?: string | null }) {
  const studentRecordId = input.studentRecordId?.trim() || null
  const publicStudentId = input.publicStudentId?.trim() || null
  if (studentRecordId) return { id: studentRecordId, isActive: true }
  if (publicStudentId) return { studentId: publicStudentId, isActive: true }
  return { id: '__missing_student_assignee__', isActive: true }
}

export function buildStudentTicketSelect() {
  return {
    id: true,
    templateNameSnapshot: true,
    templateVersionSnapshot: true,
    templateDescriptionSnapshot: true,
    templatePhotoUrlSnapshot: true,
    templatePhotoMimeTypeSnapshot: true,
    title: true,
    issueDescription: true,
    workPerformed: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    submittedCompletedAt: true,
    completedAt: true,
  }
}

export function buildTicketCreateData(args: {
  createdById: string
  title: string
  issueDescription: string
  template: WorkOrderTemplateSnapshotSource
  assignee: Extract<WorkOrderAssigneeValidation, { ok: true }>
  now?: Date
}) {
  const now = args.now ?? new Date()
  return {
    templateId: args.template.id,
    templateNameSnapshot: args.template.name,
    templateVersionSnapshot: args.template.versionLabel,
    templateDescriptionSnapshot: args.template.description,
    templatePhotoPathSnapshot: args.template.photoPath,
    templatePhotoUrlSnapshot: args.template.photoUrl,
    templatePhotoMimeTypeSnapshot: args.template.photoMimeType,
    templatePhotoSizeBytesSnapshot: args.template.photoSizeBytes,
    templateOriginalFilenameSnapshot: args.template.originalFilename,
    title: args.title,
    issueDescription: args.issueDescription,
    status: 'assigned' as WorkOrderStatusValue,
    assigneeType: args.assignee.assigneeType,
    assigneeStudentId: args.assignee.assigneeStudentId,
    assigneeTeacherId: args.assignee.assigneeTeacherId,
    createdById: args.createdById,
    assignedAt: now,
  }
}

export type WorkOrderWalkthroughVideoProvider = 'youtube' | 'vimeo' | 'embed'

export type WorkOrderWalkthroughVideoUrlValidation =
  | { ok: true; originalUrl: string; embedUrl: string; provider: WorkOrderWalkthroughVideoProvider }
  | { ok: false; error: string }

function cleanUrlForStorage(url: URL): string {
  url.hash = ''
  return url.toString()
}

function youtubeVideoId(url: URL): string | null {
  const hostname = url.hostname.replace(/^www\./, '').toLowerCase()
  if (hostname === 'youtu.be') {
    return url.pathname.split('/').filter(Boolean)[0] ?? null
  }
  if (!['youtube.com', 'youtube-nocookie.com'].includes(hostname)) return null
  if (url.pathname === '/watch') return url.searchParams.get('v')
  const parts = url.pathname.split('/').filter(Boolean)
  if (['embed', 'shorts'].includes(parts[0])) return parts[1] ?? null
  return null
}

function vimeoVideoId(url: URL): string | null {
  const hostname = url.hostname.replace(/^www\./, '').toLowerCase()
  if (!['vimeo.com', 'player.vimeo.com'].includes(hostname)) return null
  const parts = url.pathname.split('/').filter(Boolean)
  if (hostname === 'player.vimeo.com' && parts[0] === 'video') return parts[1] ?? null
  return /^\d+$/.test(parts[0] ?? '') ? parts[0] : null
}

export function normalizeWorkOrderWalkthroughVideoUrl(input: string): WorkOrderWalkthroughVideoUrlValidation {
  const trimmed = input.trim()
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { ok: false, error: 'Enter a valid http(s) video URL' }
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { ok: false, error: 'Enter a valid http(s) video URL' }
  }

  const youtubeId = youtubeVideoId(parsed)
  if (youtubeId) {
    return {
      ok: true,
      originalUrl: cleanUrlForStorage(new URL(trimmed)),
      embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(youtubeId)}`,
      provider: 'youtube',
    }
  }

  const vimeoId = vimeoVideoId(parsed)
  if (vimeoId) {
    return {
      ok: true,
      originalUrl: cleanUrlForStorage(new URL(trimmed)),
      embedUrl: `https://player.vimeo.com/video/${encodeURIComponent(vimeoId)}`,
      provider: 'vimeo',
    }
  }

  if (parsed.pathname.split('/').filter(Boolean).includes('embed')) {
    return {
      ok: true,
      originalUrl: cleanUrlForStorage(new URL(trimmed)),
      embedUrl: cleanUrlForStorage(parsed),
      provider: 'embed',
    }
  }

  return { ok: false, error: 'Enter a YouTube, Vimeo, or /embed/ video URL' }
}

export function resolveWorkOrderUploadDir(): string {
  return process.env.WORK_ORDER_UPLOAD_DIR ?? path.resolve(process.cwd(), 'uploads', 'work-order-templates')
}

export function workOrderUploadUrl(filename: string): string {
  return `/api/work-orders/template-photos/${filename}`
}

export const WORK_ORDER_IMAGE_TYPES = {
  png: { extension: '.png', mimeType: 'image/png' },
  jpg: { extension: '.jpg', mimeType: 'image/jpeg' },
  webp: { extension: '.webp', mimeType: 'image/webp' },
  gif: { extension: '.gif', mimeType: 'image/gif' },
} as const

export type WorkOrderImageType = typeof WORK_ORDER_IMAGE_TYPES[keyof typeof WORK_ORDER_IMAGE_TYPES]

export function detectWorkOrderImageType(buffer: Buffer): WorkOrderImageType | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return WORK_ORDER_IMAGE_TYPES.png
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return WORK_ORDER_IMAGE_TYPES.jpg
  }
  if (buffer.length >= 6) {
    const gifHeader = buffer.subarray(0, 6).toString('ascii')
    if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') return WORK_ORDER_IMAGE_TYPES.gif
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return WORK_ORDER_IMAGE_TYPES.webp
  }
  return null
}

export function contentTypeForWorkOrderUpload(filename: string): string | null {
  const extension = path.extname(filename).toLowerCase()
  return Object.values(WORK_ORDER_IMAGE_TYPES).find((type) => type.extension === extension)?.mimeType ?? null
}

export function resolveSafeWorkOrderUploadPath(filename: string, uploadDir = resolveWorkOrderUploadDir()): { filePath: string; contentType: string } | null {
  if (!filename || filename !== path.basename(filename)) return null
  const contentType = contentTypeForWorkOrderUpload(filename)
  if (!contentType) return null
  return { filePath: path.join(uploadDir, filename), contentType }
}

function safeTemplateBaseName(originalFilename: string): string {
  const basename = path.basename(originalFilename || 'work-order-template')
  const withoutExtension = path.parse(basename).name
  return withoutExtension.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '') || 'work-order-template'
}

export async function persistWorkOrderTemplateFile(args: {
  sourcePath?: string
  buffer?: Buffer
  originalFilename: string
  mimeType: string
  uploadDir?: string
}): Promise<{ storedPath: string; url: string; sizeBytes: number; originalFilename: string; mimeType: string }> {
  const uploadDir = args.uploadDir ?? resolveWorkOrderUploadDir()
  const sourceBuffer = args.buffer ?? (args.sourcePath ? await fs.readFile(args.sourcePath) : null)
  if (!sourceBuffer) {
    throw new Error('sourcePath or buffer is required')
  }

  const imageType = detectWorkOrderImageType(sourceBuffer)
  if (!imageType) {
    throw new Error('photo must be a PNG, JPEG, WebP, or GIF image')
  }

  await fs.mkdir(uploadDir, { recursive: true })
  const originalFilename = path.basename(args.originalFilename || `work-order-template${imageType.extension}`)
  const uniqueName = `${Date.now()}-${safeTemplateBaseName(originalFilename)}${imageType.extension}`
  const storedPath = path.join(uploadDir, uniqueName)

  await fs.writeFile(storedPath, sourceBuffer)

  return {
    storedPath,
    url: workOrderUploadUrl(uniqueName),
    sizeBytes: sourceBuffer.length,
    originalFilename,
    mimeType: imageType.mimeType,
  }
}

export const DEFAULT_WORK_ORDER_TEMPLATE = {
  name: 'Power Off / Machine Did Not Start',
  versionLabel: 'Version 1',
  description: 'Troubleshooting work order for a machine/HMI that did not start up. Seeded from the uploaded POWER OFF template image.',
  sourcePath: '/home/jlopez/.hermes/kanban/boards/ptti-dashboard/attachments/t_3317b5d2/workOrderExample.png',
  originalFilename: 'workOrderExample.png',
  mimeType: 'image/png',
}
