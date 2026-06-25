import { Router, Request, Response, NextFunction } from 'express'
import multer from 'multer'
import prisma from '../lib/prisma'
import { requireAuth } from '../middleware/requireAuth'
import {
  DEFAULT_WORK_ORDER_TEMPLATE,
  buildStudentAssigneeLookup,
  buildStudentTicketSelect,
  buildTicketCreateData,
  normalizeWorkOrderWalkthroughVideoUrl,
  persistWorkOrderTemplateFile,
  validateOneAssignee,
} from '../services/workOrderService'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })
const VALID_STATUSES = new Set(['open', 'assigned', 'in_progress', 'submitted_completed', 'completed', 'cancelled'])
const INVALID_TEMPLATE_PHOTO_ERROR = 'photo must be a PNG, JPEG, WebP, or GIF image'

function sendTemplateUploadErrorIfSafe(err: unknown, res: Response): boolean {
  if (err instanceof Error && err.message === INVALID_TEMPLATE_PHOTO_ERROR) {
    res.status(400).json({ success: false, error: INVALID_TEMPLATE_PHOTO_ERROR })
    return true
  }
  return false
}

async function ensureDefaultTemplate() {
  const existing = await prisma.workOrderTemplate.findFirst({
    where: { name: DEFAULT_WORK_ORDER_TEMPLATE.name, versionLabel: DEFAULT_WORK_ORDER_TEMPLATE.versionLabel },
  })
  if (existing) return existing

  const stored = await persistWorkOrderTemplateFile({
    sourcePath: DEFAULT_WORK_ORDER_TEMPLATE.sourcePath,
    originalFilename: DEFAULT_WORK_ORDER_TEMPLATE.originalFilename,
    mimeType: DEFAULT_WORK_ORDER_TEMPLATE.mimeType,
  })

  return prisma.workOrderTemplate.create({
    data: {
      name: DEFAULT_WORK_ORDER_TEMPLATE.name,
      versionLabel: DEFAULT_WORK_ORDER_TEMPLATE.versionLabel,
      description: DEFAULT_WORK_ORDER_TEMPLATE.description,
      photoPath: stored.storedPath,
      photoUrl: stored.url,
      photoMimeType: stored.mimeType,
      photoSizeBytes: stored.sizeBytes,
      originalFilename: stored.originalFilename,
    },
  })
}

function templateSelect() {
  return {
    id: true,
    name: true,
    versionLabel: true,
    description: true,
    photoPath: true,
    photoUrl: true,
    photoMimeType: true,
    photoSizeBytes: true,
    originalFilename: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
  }
}

const ticketInclude = {
  assigneeStudent: { select: { id: true, studentId: true, fullName: true } },
  assigneeTeacher: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  messages: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      teacher: { select: { id: true, name: true } },
    },
  },
}

const studentTicketSelect = buildStudentTicketSelect()

function walkthroughVideoSelect() {
  return {
    id: true,
    teacherId: true,
    title: true,
    originalUrl: true,
    embedUrl: true,
    provider: true,
    createdAt: true,
    updatedAt: true,
  }
}

function studentVideoSelect() {
  return {
    id: true,
    teacherId: true,
    title: true,
    originalUrl: true,
    embedUrl: true,
    provider: true,
    createdAt: true,
    updatedAt: true,
  }
}

// ---------------------------------------------------------------------------
// Walkthrough videos — teacher-only embedded video management
// ---------------------------------------------------------------------------
router.get('/walkthrough-videos', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const videos = await prisma.workOrderWalkthroughVideo.findMany({
      where: { teacherId: req.teacher!.teacherId },
      select: walkthroughVideoSelect(),
      orderBy: { createdAt: 'desc' },
    })
    res.json({ success: true, data: videos })
  } catch (err) { next(err) }
})

router.post('/walkthrough-videos', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const title = String(req.body.title ?? '').trim() || null
    const validation = normalizeWorkOrderWalkthroughVideoUrl(String(req.body.url ?? req.body.originalUrl ?? ''))
    if (!validation.ok) {
      res.status(400).json({ success: false, error: validation.error })
      return
    }

    const video = await prisma.workOrderWalkthroughVideo.create({
      data: {
        teacherId: req.teacher!.teacherId,
        title,
        originalUrl: validation.originalUrl,
        embedUrl: validation.embedUrl,
        provider: validation.provider,
      },
      select: walkthroughVideoSelect(),
    })
    res.status(201).json({ success: true, data: video })
  } catch (err) { next(err) }
})

router.put('/walkthrough-videos/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.workOrderWalkthroughVideo.findFirst({
      where: { id: req.params.id, teacherId: req.teacher!.teacherId },
      select: { id: true },
    })
    if (!existing) {
      res.status(404).json({ success: false, error: 'Walkthrough video not found' })
      return
    }

    const data: Record<string, unknown> = {}
    if (req.body.title !== undefined) data.title = String(req.body.title).trim() || null
    if (req.body.url !== undefined || req.body.originalUrl !== undefined) {
      const validation = normalizeWorkOrderWalkthroughVideoUrl(String(req.body.url ?? req.body.originalUrl ?? ''))
      if (!validation.ok) {
        res.status(400).json({ success: false, error: validation.error })
        return
      }
      Object.assign(data, {
        originalUrl: validation.originalUrl,
        embedUrl: validation.embedUrl,
        provider: validation.provider,
      })
    }

    const video = await prisma.workOrderWalkthroughVideo.update({
      where: { id: existing.id },
      data,
      select: walkthroughVideoSelect(),
    })
    res.json({ success: true, data: video })
  } catch (err) { next(err) }
})

router.delete('/walkthrough-videos/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await prisma.workOrderWalkthroughVideo.deleteMany({
      where: { id: req.params.id, teacherId: req.teacher!.teacherId },
    })
    if (result.count === 0) {
      res.status(404).json({ success: false, error: 'Walkthrough video not found' })
      return
    }
    res.json({ success: true, data: { message: 'Walkthrough video removed' } })
  } catch (err) { next(err) }
})

// ---------------------------------------------------------------------------
// Student walkthrough videos — teacher manages, students view publicly
// ---------------------------------------------------------------------------
router.get('/student-walkthrough-videos', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const videos = await prisma.workOrderStudentVideo.findMany({
      select: studentVideoSelect(),
      orderBy: { createdAt: 'desc' },
    })
    res.json({ success: true, data: videos })
  } catch (err) { next(err) }
})

router.post('/student-walkthrough-videos', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const title = String(req.body.title ?? '').trim() || null
    const validation = normalizeWorkOrderWalkthroughVideoUrl(String(req.body.url ?? req.body.originalUrl ?? ''))
    if (!validation.ok) {
      res.status(400).json({ success: false, error: validation.error })
      return
    }

    const video = await prisma.workOrderStudentVideo.create({
      data: {
        teacherId: req.teacher!.teacherId,
        title,
        originalUrl: validation.originalUrl,
        embedUrl: validation.embedUrl,
        provider: validation.provider,
      },
      select: studentVideoSelect(),
    })
    res.status(201).json({ success: true, data: video })
  } catch (err) { next(err) }
})

router.put('/student-walkthrough-videos/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.workOrderStudentVideo.findFirst({
      where: { id: req.params.id },
      select: { id: true },
    })
    if (!existing) {
      res.status(404).json({ success: false, error: 'Student walkthrough video not found' })
      return
    }

    const data: Record<string, unknown> = {}
    if (req.body.title !== undefined) data.title = String(req.body.title).trim() || null
    if (req.body.url !== undefined || req.body.originalUrl !== undefined) {
      const validation = normalizeWorkOrderWalkthroughVideoUrl(String(req.body.url ?? req.body.originalUrl ?? ''))
      if (!validation.ok) {
        res.status(400).json({ success: false, error: validation.error })
        return
      }
      Object.assign(data, {
        originalUrl: validation.originalUrl,
        embedUrl: validation.embedUrl,
        provider: validation.provider,
      })
    }

    const video = await prisma.workOrderStudentVideo.update({
      where: { id: existing.id },
      data,
      select: studentVideoSelect(),
    })
    res.json({ success: true, data: video })
  } catch (err) { next(err) }
})

router.delete('/student-walkthrough-videos/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await prisma.workOrderStudentVideo.deleteMany({
      where: { id: req.params.id },
    })
    if (result.count === 0) {
      res.status(404).json({ success: false, error: 'Student walkthrough video not found' })
      return
    }
    res.json({ success: true, data: { message: 'Student walkthrough video removed' } })
  } catch (err) { next(err) }
})

// ---------------------------------------------------------------------------
// Templates — teacher-authenticated management
// ---------------------------------------------------------------------------
router.get('/templates', requireAuth, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureDefaultTemplate()
    const templates = await prisma.workOrderTemplate.findMany({
      where: { isActive: true },
      orderBy: [{ createdAt: 'asc' }],
      select: templateSelect(),
    })
    res.json({ success: true, data: templates })
  } catch (err) { next(err) }
})

router.post('/templates', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  upload.single('photo')(req, res, async (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ success: false, error: 'Photo too large. Maximum allowed size is 10 MB.' })
      return
    }
    if (err) { next(err); return }

    try {
      const name = String(req.body.name ?? '').trim()
      const versionLabel = String(req.body.versionLabel ?? 'Version 1').trim()
      const description = String(req.body.description ?? '').trim() || null
      if (!name || !versionLabel) {
        res.status(400).json({ success: false, error: 'name and versionLabel are required' })
        return
      }
      if (!req.file) {
        res.status(400).json({ success: false, error: 'photo upload is required' })
        return
      }
      const stored = await persistWorkOrderTemplateFile({
        buffer: req.file.buffer,
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype,
      })
      const template = await prisma.workOrderTemplate.create({
        data: {
          name,
          versionLabel,
          description,
          photoPath: stored.storedPath,
          photoUrl: stored.url,
          photoMimeType: stored.mimeType,
          photoSizeBytes: stored.sizeBytes,
          originalFilename: stored.originalFilename,
        },
      })
      res.status(201).json({ success: true, data: template })
    } catch (e) {
      if (sendTemplateUploadErrorIfSafe(e, res)) return
      next(e)
    }
  })
})

router.put('/templates/:id', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  upload.single('photo')(req, res, async (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ success: false, error: 'Photo too large. Maximum allowed size is 10 MB.' })
      return
    }
    if (err) { next(err); return }

    try {
      const data: Record<string, unknown> = {}
      if (req.body.name !== undefined) data.name = String(req.body.name).trim()
      if (req.body.versionLabel !== undefined) data.versionLabel = String(req.body.versionLabel).trim()
      if (req.body.description !== undefined) data.description = String(req.body.description).trim() || null
      if (req.file) {
        const stored = await persistWorkOrderTemplateFile({ buffer: req.file.buffer, originalFilename: req.file.originalname, mimeType: req.file.mimetype })
        Object.assign(data, {
          photoPath: stored.storedPath,
          photoUrl: stored.url,
          photoMimeType: stored.mimeType,
          photoSizeBytes: stored.sizeBytes,
          originalFilename: stored.originalFilename,
        })
      }

      const template = await prisma.workOrderTemplate.update({ where: { id: req.params.id }, data })
      res.json({ success: true, data: template })
    } catch (e) {
      if (sendTemplateUploadErrorIfSafe(e, res)) return
      next(e)
    }
  })
})

router.delete('/templates/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.workOrderTemplate.update({ where: { id: req.params.id }, data: { isActive: false } })
    res.json({ success: true, data: { message: 'Template archived' } })
  } catch (err) { next(err) }
})

// ---------------------------------------------------------------------------
// Assignee search — teachers and students only
// ---------------------------------------------------------------------------
router.get('/assignees', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = String(req.query.q ?? '').trim()
    const [students, teachers] = await Promise.all([
      prisma.student.findMany({
        where: q ? { isActive: true, OR: [{ studentId: { contains: q, mode: 'insensitive' } }, { fullName: { contains: q, mode: 'insensitive' } }] } : { isActive: true },
        select: { id: true, studentId: true, fullName: true },
        take: 20,
        orderBy: { fullName: 'asc' },
      }),
      prisma.teacher.findMany({
        where: q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {},
        select: { id: true, name: true, email: true },
        take: 20,
        orderBy: { name: 'asc' },
      }),
    ])
    res.json({ success: true, data: { students, teachers } })
  } catch (err) { next(err) }
})

// ---------------------------------------------------------------------------
// Teacher ticket CRUD and teacher-only messages
// ---------------------------------------------------------------------------
router.get('/tickets', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = String(req.query.status ?? '').trim()
    const tickets = await prisma.workOrderTicket.findMany({
      where: status && VALID_STATUSES.has(status) ? { status: status as any } : {},
      include: ticketInclude,
      orderBy: { updatedAt: 'desc' },
    })
    res.json({ success: true, data: tickets })
  } catch (err) { next(err) }
})

router.post('/tickets', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { templateId, title, issueDescription, assigneeStudentId, assigneeStudentNumber, studentId, assigneeTeacherId } = req.body as {
      templateId: string; title: string; issueDescription: string; assigneeStudentId?: string; assigneeStudentNumber?: string; studentId?: string; assigneeTeacherId?: string
    }
    if (!templateId || !title?.trim() || !issueDescription?.trim()) {
      res.status(400).json({ success: false, error: 'templateId, title, and issueDescription are required' })
      return
    }
    const publicStudentId = assigneeStudentNumber ?? studentId
    const assignee = validateOneAssignee({ assigneeStudentId, publicStudentId, assigneeTeacherId })
    if (!assignee.ok) {
      res.status(400).json({ success: false, error: assignee.error })
      return
    }

    const [template, student, teacher] = await Promise.all([
      prisma.workOrderTemplate.findFirst({ where: { id: templateId, isActive: true } }),
      assignee.assigneeStudentId ? prisma.student.findFirst({ where: buildStudentAssigneeLookup({ studentRecordId: assigneeStudentId, publicStudentId }) }) : Promise.resolve(null),
      assignee.assigneeTeacherId ? prisma.teacher.findUnique({ where: { id: assignee.assigneeTeacherId } }) : Promise.resolve(null),
    ])
    if (!template) { res.status(404).json({ success: false, error: 'Template not found' }); return }
    if (assignee.assigneeStudentId && !student) { res.status(404).json({ success: false, error: 'Student assignee not found' }); return }
    if (assignee.assigneeTeacherId && !teacher) { res.status(404).json({ success: false, error: 'Teacher assignee not found' }); return }

    const ticket = await prisma.workOrderTicket.create({
      data: buildTicketCreateData({
        createdById: req.teacher!.teacherId,
        title: title.trim(),
        issueDescription: issueDescription.trim(),
        template,
        assignee: { ...assignee, assigneeStudentId: student?.id ?? null },
      }) as any,
      include: ticketInclude,
    })
    res.status(201).json({ success: true, data: ticket })
  } catch (err) { next(err) }
})

router.get('/tickets/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticket = await prisma.workOrderTicket.findUnique({ where: { id: req.params.id }, include: ticketInclude })
    if (!ticket) { res.status(404).json({ success: false, error: 'Work order not found' }); return }
    res.json({ success: true, data: ticket })
  } catch (err) { next(err) }
})

router.put('/tickets/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, issueDescription, workPerformed, status, assigneeStudentId, assigneeStudentNumber, studentId, assigneeTeacherId } = req.body as {
      title?: string; issueDescription?: string; workPerformed?: string; status?: string; assigneeStudentId?: string | null; assigneeStudentNumber?: string | null; studentId?: string | null; assigneeTeacherId?: string | null
    }
    const data: Record<string, unknown> = {}
    if (title !== undefined) data.title = String(title).trim()
    if (issueDescription !== undefined) data.issueDescription = String(issueDescription).trim()
    if (workPerformed !== undefined) data.workPerformed = String(workPerformed).trim() || null
    if (status !== undefined) {
      if (!VALID_STATUSES.has(status)) { res.status(400).json({ success: false, error: 'Invalid status' }); return }
      data.status = status
      if (status === 'completed') data.completedAt = new Date()
    }
    if (assigneeStudentId !== undefined || assigneeStudentNumber !== undefined || studentId !== undefined || assigneeTeacherId !== undefined) {
      const publicStudentId = assigneeStudentNumber ?? studentId
      const assignee = validateOneAssignee({ assigneeStudentId, publicStudentId, assigneeTeacherId })
      if (!assignee.ok) { res.status(400).json({ success: false, error: assignee.error }); return }
      let resolvedStudentId: string | null = null
      if (assignee.assigneeStudentId) {
        const student = await prisma.student.findFirst({ where: buildStudentAssigneeLookup({ studentRecordId: assigneeStudentId, publicStudentId }) })
        if (!student) { res.status(404).json({ success: false, error: 'Student assignee not found' }); return }
        resolvedStudentId = student.id
      }
      if (assignee.assigneeTeacherId) {
        const teacher = await prisma.teacher.findUnique({ where: { id: assignee.assigneeTeacherId } })
        if (!teacher) { res.status(404).json({ success: false, error: 'Teacher assignee not found' }); return }
      }
      Object.assign(data, {
        assigneeType: assignee.assigneeType,
        assigneeStudentId: resolvedStudentId,
        assigneeTeacherId: assignee.assigneeTeacherId,
        assignedAt: new Date(),
        status: status ?? 'assigned',
      })
    }

    const ticket = await prisma.workOrderTicket.update({ where: { id: req.params.id }, data, include: ticketInclude })
    res.json({ success: true, data: ticket })
  } catch (err) { next(err) }
})

router.delete('/tickets/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticket = await prisma.workOrderTicket.update({ where: { id: req.params.id }, data: { status: 'cancelled' }, include: ticketInclude })
    res.json({ success: true, data: ticket })
  } catch (err) { next(err) }
})

router.post('/tickets/:id/messages', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = String(req.body.body ?? '').trim()
    if (!body) { res.status(400).json({ success: false, error: 'message body is required' }); return }
    const ticket = await prisma.workOrderTicket.findUnique({ where: { id: req.params.id }, select: { id: true } })
    if (!ticket) { res.status(404).json({ success: false, error: 'Work order not found' }); return }
    const message = await prisma.workOrderMessage.create({
      data: { ticketId: req.params.id, teacherId: req.teacher!.teacherId, body, visibility: 'teacher_only' },
      include: { teacher: { select: { id: true, name: true } } },
    })
    res.status(201).json({ success: true, data: message })
  } catch (err) { next(err) }
})

// ---------------------------------------------------------------------------
// Work-order dashboard notifications — in-dashboard only
// ---------------------------------------------------------------------------
router.get('/notifications', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unreadOnly = String(req.query.unreadOnly ?? '') === 'true'
    const notifications = await prisma.workOrderNotification.findMany({
      where: { teacherId: req.teacher!.teacherId, ...(unreadOnly ? { readAt: null } : {}) },
      include: { ticket: { select: { id: true, title: true, status: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    res.json({ success: true, data: notifications })
  } catch (err) { next(err) }
})

router.post('/notifications/:id/read', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await prisma.workOrderNotification.updateMany({
      where: { id: req.params.id, teacherId: req.teacher!.teacherId },
      data: { readAt: new Date() },
    })
    if (result.count === 0) {
      res.status(404).json({ success: false, error: 'Notification not found' })
      return
    }
    const notification = await prisma.workOrderNotification.findUnique({ where: { id: req.params.id } })
    res.json({ success: true, data: notification })
  } catch (err) { next(err) }
})

// ---------------------------------------------------------------------------
// Student endpoints — no teacher chat, only assigned ticket workPerformed + submit
// Existing app identifies kiosk students by studentId; this is not strong auth.
// ---------------------------------------------------------------------------
router.get('/student/:studentId/tickets', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const student = await prisma.student.findFirst({ where: { studentId: req.params.studentId, isActive: true }, select: { id: true } })
    if (!student) { res.status(404).json({ success: false, error: 'Student not found' }); return }
    const tickets = await prisma.workOrderTicket.findMany({
      where: { assigneeType: 'student', assigneeStudentId: student.id },
      select: studentTicketSelect,
      orderBy: { updatedAt: 'desc' },
    })
    res.json({ success: true, data: tickets })
  } catch (err) { next(err) }
})

router.get('/student/:studentId/tickets/:ticketId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const student = await prisma.student.findFirst({ where: { studentId: req.params.studentId, isActive: true }, select: { id: true } })
    if (!student) { res.status(404).json({ success: false, error: 'Student not found' }); return }
    const ticket = await prisma.workOrderTicket.findFirst({
      where: { id: req.params.ticketId, assigneeType: 'student', assigneeStudentId: student.id },
      select: studentTicketSelect,
    })
    if (!ticket) { res.status(404).json({ success: false, error: 'Assigned work order not found' }); return }
    res.json({ success: true, data: ticket })
  } catch (err) { next(err) }
})

router.patch('/student/:studentId/tickets/:ticketId/work-performed', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const student = await prisma.student.findFirst({ where: { studentId: req.params.studentId, isActive: true }, select: { id: true } })
    if (!student) { res.status(404).json({ success: false, error: 'Student not found' }); return }
    const workPerformed = String(req.body.workPerformed ?? '').trim()
    const ticket = await prisma.workOrderTicket.updateMany({
      where: { id: req.params.ticketId, assigneeType: 'student', assigneeStudentId: student.id, status: { notIn: ['completed', 'cancelled'] } },
      data: { workPerformed, status: 'in_progress' },
    })
    if (ticket.count === 0) { res.status(404).json({ success: false, error: 'Editable assigned work order not found' }); return }
    const updated = await prisma.workOrderTicket.findUnique({ where: { id: req.params.ticketId }, select: studentTicketSelect })
    res.json({ success: true, data: updated })
  } catch (err) { next(err) }
})

router.post('/student/:studentId/tickets/:ticketId/submit-completed', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const student = await prisma.student.findFirst({ where: { studentId: req.params.studentId, isActive: true }, select: { id: true, fullName: true } })
    if (!student) { res.status(404).json({ success: false, error: 'Student not found' }); return }
    const ticket = await prisma.workOrderTicket.findFirst({
      where: { id: req.params.ticketId, assigneeType: 'student', assigneeStudentId: student.id, status: { notIn: ['completed', 'cancelled'] } },
      select: { id: true, title: true, createdById: true },
    })
    if (!ticket) { res.status(404).json({ success: false, error: 'Submittable assigned work order not found' }); return }

    const now = new Date()
    const [updated] = await prisma.$transaction([
      prisma.workOrderTicket.update({
        where: { id: ticket.id },
        data: { status: 'submitted_completed', submittedCompletedAt: now, ...(req.body.workPerformed !== undefined ? { workPerformed: String(req.body.workPerformed).trim() } : {}) },
        select: studentTicketSelect,
      }),
      prisma.workOrderNotification.create({
        data: {
          ticketId: ticket.id,
          teacherId: ticket.createdById,
          type: 'submitted_completed',
          message: `${student.fullName} submitted work order "${ticket.title}" as completed.`,
        },
      }),
    ])
    res.json({ success: true, data: updated })
  } catch (err) { next(err) }
})

export default router
