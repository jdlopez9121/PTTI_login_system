import { Router, Request, Response, NextFunction } from 'express'
import multer from 'multer'
import { GradeType } from '@prisma/client'
import prisma from '../lib/prisma'
import { requireAuth } from '../middleware/requireAuth'
import { getProgramMonth } from '../services/headcountService'
import { calculateGrade, cohortCalendarMonth } from '../services/gradeService'
import { trackFromShift } from '../services/shiftService'
import {
  applyQuizGradeImport,
  parseQuizGradeWorkbook,
  previewQuizGradeImport,
  buildStudentNameIndex,
} from '../services/quizGradeImportService'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })
const XLSX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
])

function isXlsxUpload(file: Express.Multer.File): boolean {
  const name = file.originalname.toLowerCase()
  return name.endsWith('.xlsx') && (XLSX_MIME_TYPES.has(file.mimetype) || file.mimetype === '')
}

async function ensureTeacherCanAccessSubject(teacherId: string, subject: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } })
  if (!teacher) return { ok: false, status: 404, error: 'Teacher not found' }
  const teacherSubjects = [teacher.subject1, teacher.subject2, teacher.subject3].filter(Boolean)
  if (!teacherSubjects.includes(subject)) return { ok: false, status: 403, error: 'You are not assigned to this subject' }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Template management (teacher auth)
// ---------------------------------------------------------------------------

// GET /api/grades/templates?subject=PLC+1
router.get('/templates', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subject = String(req.query.subject ?? '').trim()
    if (!subject) {
      res.status(400).json({ success: false, error: 'subject query param required' })
      return
    }
    const templates = await prisma.gradeTemplate.findMany({
      where: { subject, isActive: true },
      orderBy: [{ type: 'asc' }, { order: 'asc' }],
    })
    res.json({ success: true, data: templates })
  } catch (err) { next(err) }
})

// POST /api/grades/templates
router.post('/templates', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { subject, type, name, description, order } = req.body as {
      subject: string; type: GradeType; name: string; description?: string; order?: number
    }
    if (!subject || !type || !name) {
      res.status(400).json({ success: false, error: 'subject, type, and name are required' })
      return
    }
    if (!['quiz', 'project'].includes(type)) {
      res.status(400).json({ success: false, error: 'type must be quiz or project' })
      return
    }
    const template = await prisma.gradeTemplate.create({
      data: { subject, type, name, description, order: order ?? 0 },
    })
    res.status(201).json({ success: true, data: template })
  } catch (err) { next(err) }
})

// PUT /api/grades/templates/:id
router.put('/templates/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description, order } = req.body as {
      name?: string; description?: string; order?: number
    }
    const template = await prisma.gradeTemplate.update({
      where: { id: req.params.id },
      data: { ...(name && { name }), ...(description !== undefined && { description }), ...(order !== undefined && { order }) },
    })
    res.json({ success: true, data: template })
  } catch (err) { next(err) }
})

// DELETE /api/grades/templates/:id — soft delete (sets isActive = false)
router.delete('/templates/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.gradeTemplate.update({
      where: { id: req.params.id },
      data: { isActive: false },
    })
    res.json({ success: true, data: { message: 'Template removed from dropdown' } })
  } catch (err) { next(err) }
})

// POST /api/grades/templates/batch — create multiple templates for a subject at once
router.post('/templates/batch', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { subject, templates } = req.body as {
      subject: string
      templates: { type: GradeType; name: string; description?: string; order?: number }[]
    }
    if (!subject || !Array.isArray(templates) || templates.length === 0) {
      res.status(400).json({ success: false, error: 'subject and templates array required' })
      return
    }
    const created = await prisma.$transaction(
      templates.map((t, i) =>
        prisma.gradeTemplate.upsert({
          where: { subject_name: { subject, name: t.name } },
          update: { isActive: true, description: t.description, order: t.order ?? i },
          create: { subject, type: t.type, name: t.name, description: t.description, order: t.order ?? i },
        })
      )
    )
    res.status(201).json({ success: true, data: created })
  } catch (err) { next(err) }
})

// ---------------------------------------------------------------------------
// Grade entries — teacher scores a quiz or verifies/scores a project
// ---------------------------------------------------------------------------

// POST /api/grades/entries — teacher records or updates a score
router.post('/entries', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { templateId, studentDbId, score, cohortMonth, cohortYear } = req.body as {
      templateId: string; studentDbId: string; score: number; cohortMonth: number; cohortYear: number
    }
    if (!templateId || !studentDbId || score === undefined || !cohortMonth || !cohortYear) {
      res.status(400).json({ success: false, error: 'templateId, studentDbId, score, cohortMonth, cohortYear required' })
      return
    }
    const entry = await prisma.gradeEntry.upsert({
      where: { templateId_studentId_cohortMonth_cohortYear: { templateId, studentId: studentDbId, cohortMonth, cohortYear } },
      update: { score, submittedBy: req.teacher!.teacherId },
      create: {
        templateId,
        studentId: studentDbId,
        cohortMonth,
        cohortYear,
        score,
        submittedAt: new Date(),
        submittedBy: req.teacher!.teacherId,
      },
    })
    res.json({ success: true, data: entry })
  } catch (err) { next(err) }
})

// POST /api/grades/entries/:id/verify — teacher verifies a student-submitted project
router.post('/entries/:id/verify', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { score } = req.body as { score: number }
    if (score === undefined) {
      res.status(400).json({ success: false, error: 'score required' })
      return
    }
    const entry = await prisma.gradeEntry.update({
      where: { id: req.params.id },
      data: { score, verifiedAt: new Date(), verifiedById: req.teacher!.teacherId },
    })
    res.json({ success: true, data: entry })
  } catch (err) { next(err) }
})

// ---------------------------------------------------------------------------
// Student project submission — kiosk, no auth
// ---------------------------------------------------------------------------

// GET /api/grades/projects?subject=PLC+1 — list active project templates for a subject (for dropdown)
router.get('/projects', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subject = String(req.query.subject ?? '').trim()
    if (!subject) {
      res.status(400).json({ success: false, error: 'subject required' })
      return
    }
    const templates = await prisma.gradeTemplate.findMany({
      where: { subject, type: 'project', isActive: true },
      orderBy: { order: 'asc' },
      select: { id: true, name: true, description: true },
    })
    res.json({ success: true, data: templates })
  } catch (err) { next(err) }
})

// POST /api/grades/submit-project — student submits a project from kiosk
router.post('/submit-project', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId, subject, templateId } = req.body as {
      studentId: string; subject: string; templateId: string
    }
    if (!studentId || !subject || !templateId) {
      res.status(400).json({ success: false, error: 'studentId, subject, and templateId required' })
      return
    }

    const student = await prisma.student.findFirst({
      where: { studentId, isActive: true },
    })
    if (!student) {
      res.status(404).json({ success: false, error: 'Student ID not found' })
      return
    }

    const template = await prisma.gradeTemplate.findFirst({
      where: { id: templateId, subject, type: 'project', isActive: true },
    })
    if (!template) {
      res.status(404).json({ success: false, error: 'Project not found' })
      return
    }

    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear  = now.getFullYear()
    const programMonth = getProgramMonth(student.cohortStartMonth, currentMonth)
    if (!programMonth) {
      res.status(400).json({ success: false, error: 'Student is not in an active program month' })
      return
    }
    const { month: cohortMonth, year: cohortYear } = cohortCalendarMonth(
      student.cohortStartMonth, programMonth, now
    )

    // Upsert so re-submission updates the timestamp without creating duplicates
    const entry = await prisma.gradeEntry.upsert({
      where: { templateId_studentId_cohortMonth_cohortYear: { templateId, studentId: student.id, cohortMonth, cohortYear } },
      update: { submittedAt: now, submittedBy: 'student', verifiedAt: null, verifiedById: null, score: null },
      create: { templateId, studentId: student.id, cohortMonth, cohortYear, submittedAt: now, submittedBy: 'student' },
    })

    res.status(201).json({
      success: true,
      data: { message: `Project "${template.name}" submitted. Your teacher will review it.`, entryId: entry.id },
    })
  } catch (err) { next(err) }
})

// ---------------------------------------------------------------------------
// Quiz grade spreadsheet import — teacher auth
// ---------------------------------------------------------------------------
function handleQuizGradeUpload(apply: boolean) {
  return (req: Request, res: Response, next: NextFunction) => {
    upload.single('file')(req, res, async (err) => {
      if (err?.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ success: false, error: 'File too large. Maximum allowed size is 5 MB.' })
        return
      }
      if (err) { next(err); return }
      if (!req.file) {
        res.status(400).json({ success: false, error: 'No file uploaded' })
        return
      }
      if (!isXlsxUpload(req.file)) {
        res.status(400).json({ success: false, error: 'Upload a .xlsx spreadsheet. CSV files are not supported for this import.' })
        return
      }

      const subject = String(req.body.subject ?? '').trim()
      const cohortMonth = parseInt(String(req.body.cohortMonth ?? '0'))
      const cohortYear = parseInt(String(req.body.cohortYear ?? '0'))
      if (!subject || !cohortMonth || !cohortYear) {
        res.status(400).json({ success: false, error: 'subject, cohortMonth, and cohortYear required' })
        return
      }

      try {
        const access = await ensureTeacherCanAccessSubject(req.teacher!.teacherId, subject)
        if (!access.ok) {
          res.status(access.status).json({ success: false, error: access.error })
          return
        }

        const parsed = parseQuizGradeWorkbook(req.file.buffer)
        const students = await prisma.student.findMany({
          where: { isActive: true },
          select: { id: true, studentId: true, fullName: true, cohortStartMonth: true },
        })
        const preview = previewQuizGradeImport(parsed.rows, buildStudentNameIndex(students))

        if (!apply) {
          res.json({ success: true, data: { ...parsed, ...preview } })
          return
        }

        if (parsed.errors.length > 0 && preview.importable.length === 0) {
          res.status(400).json({ success: false, error: 'No valid rows to import.', data: { ...parsed, ...preview } })
          return
        }

        const result = await applyQuizGradeImport({
          prisma,
          rows: parsed.rows,
          subject,
          cohortMonth,
          cohortYear,
          teacherId: req.teacher!.teacherId,
        })
        res.json({ success: true, data: { ...result, parseErrors: parsed.errors } })
      } catch (e) { next(e) }
    })
  }
}

router.post('/import/preview', requireAuth, handleQuizGradeUpload(false))
router.post('/import/apply', requireAuth, handleQuizGradeUpload(true))

// ---------------------------------------------------------------------------
// Grade dashboard — teacher view
// GET /api/grades/dashboard?subject=PLC+1&cohortMonth=6&cohortYear=2026
// ---------------------------------------------------------------------------
router.get('/dashboard', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subject     = String(req.query.subject     ?? '').trim()
    const cohortMonth = parseInt(String(req.query.cohortMonth ?? '0'))
    const cohortYear  = parseInt(String(req.query.cohortYear  ?? '0'))

    if (!subject || !cohortMonth || !cohortYear) {
      res.status(400).json({ success: false, error: 'subject, cohortMonth, and cohortYear required' })
      return
    }

    // Verify teacher teaches this subject
    const teacher = await prisma.teacher.findUnique({ where: { id: req.teacher!.teacherId } })
    if (!teacher) {
      res.status(404).json({ success: false, error: 'Teacher not found' })
      return
    }
    const teacherSubjects = [teacher.subject1, teacher.subject2, teacher.subject3].filter(Boolean)
    if (!teacherSubjects.includes(subject)) {
      res.status(403).json({ success: false, error: 'You are not assigned to this subject' })
      return
    }

    // Find curriculum entry to get programMonth for this subject.
    // Use track (day/night) instead of the teacher's stored shift so that a day-track
    // teacher can access both morning and afternoon subjects (e.g. PLC 1 = afternoon, PLC 2 = morning).
    const track = trackFromShift(teacher.shift)
    const curriculum = await prisma.curriculum.findFirst({ where: { subject, track } })
    if (!curriculum) {
      res.status(404).json({ success: false, error: 'No curriculum entry found for this subject and shift' })
      return
    }

    // Find all active students whose current programMonth matches the curriculum
    const now = new Date()
    const currentCalendarMonth = now.getMonth() + 1

    const allStudents = await prisma.student.findMany({
      where: { isActive: true, isFloating: false },
      select: { id: true, studentId: true, fullName: true, cohortStartMonth: true },
    })

    const students = allStudents.filter((s) => {
      const pm = getProgramMonth(s.cohortStartMonth, currentCalendarMonth)
      return pm === curriculum.programMonth
    })

    // Calculate grade for each student
    const grades = await Promise.all(
      students.map(async (s) => {
        const grade = await calculateGrade(
          s.id, s.cohortStartMonth, curriculum.programMonth,
          subject, curriculum.shift, cohortMonth, cohortYear, now
        )
        return { studentId: s.studentId, fullName: s.fullName, dbId: s.id, ...grade }
      })
    )

    res.json({ success: true, data: { subject, cohortMonth, cohortYear, students: grades } })
  } catch (err) { next(err) }
})

// ---------------------------------------------------------------------------
// Student grade view — kiosk, no auth, 30-second session handled client-side
// GET /api/grades/student/:studentId?subject=PLC+1
// ---------------------------------------------------------------------------
router.get('/student/:studentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId } = req.params
    const subject = String(req.query.subject ?? '').trim()
    if (!subject) {
      res.status(400).json({ success: false, error: 'subject required' })
      return
    }

    const student = await prisma.student.findFirst({
      where: { studentId, isActive: true },
    })
    if (!student) {
      res.status(404).json({ success: false, error: 'Student not found' })
      return
    }

    const curriculum = await prisma.curriculum.findFirst({ where: { subject } })
    if (!curriculum) {
      res.status(404).json({ success: false, error: 'No curriculum found for this subject' })
      return
    }

    const now = new Date()
    const programMonth = getProgramMonth(student.cohortStartMonth, now.getMonth() + 1)
    if (!programMonth) {
      res.status(400).json({ success: false, error: 'Student is not in an active program month' })
      return
    }

    const { month: cohortMonth, year: cohortYear } = cohortCalendarMonth(
      student.cohortStartMonth, programMonth, now
    )

    const grade = await calculateGrade(
      student.id, student.cohortStartMonth, programMonth,
      subject, curriculum.shift, cohortMonth, cohortYear, now
    )

    res.json({
      success: true,
      data: {
        studentId: student.studentId,
        fullName: student.fullName,
        subject,
        cohortMonth,
        cohortYear,
        ...grade,
      },
    })
  } catch (err) { next(err) }
})

export default router
