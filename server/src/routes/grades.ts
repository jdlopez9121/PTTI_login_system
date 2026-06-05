import { Router, Request, Response } from 'express'
import { GradeType, Track } from '@prisma/client'
import { requireAuth } from '../middleware/requireAuth'
import prisma from '../lib/prisma'
import { getProgramMonth } from '../services/headcountService'

const router = Router()

const SUBJECT_TO_ROOM: Record<string, string> = {
  'PLC 1': 'PLC Room',
  'PLC 2': 'PLC Room',
  'PLC 3': 'PLC Room',
  'AC 1': 'AC Room',
  'AC 2': 'AC Room',
  'DC 1': 'DC Room',
  'DC 2': 'DC Room',
  'DC 3': 'DC Room',
  MT: 'MT/HT Room',
  HT: 'MT/HT Room',
}

const VALID_TRACKS: Track[] = ['day', 'night']

function weekdayCountInMonth(year: number, month: number): number {
  const days = new Date(year, month, 0).getDate()
  let count = 0
  for (let d = 1; d <= days; d++) {
    const dow = new Date(year, month - 1, d).getDay()
    if (dow !== 0 && dow !== 6) count++
  }
  return count
}

function calcGradeTotal(
  attendancePct: number,
  quizScores: number[],
  projectScores: number[]
): number {
  const quizAvg = quizScores.length > 0 ? quizScores.reduce((a, b) => a + b, 0) / quizScores.length : 0
  const projectAvg = projectScores.length > 0 ? projectScores.reduce((a, b) => a + b, 0) / projectScores.length : 0
  return attendancePct * 0.1 + quizAvg * 0.15 + projectAvg * 0.75
}

// GET /api/grades/cohorts — list active cohorts for a subject (for teacher's grade dashboard)
router.get('/cohorts', requireAuth, async (req: Request, res: Response) => {
  const teacher = await prisma.teacher.findUnique({ where: { id: req.teacher!.teacherId } })
  if (!teacher) {
    res.status(404).json({ success: false, error: 'Teacher not found' })
    return
  }

  const subject = String(req.query.subject ?? '')
  const teacherSubjects = [teacher.subject1, teacher.subject2, teacher.subject3].filter(Boolean)
  if (!subject || !teacherSubjects.includes(subject)) {
    res.status(400).json({ success: false, error: 'Invalid or unauthorized subject' })
    return
  }

  const currentMonth = new Date().getMonth() + 1

  const curriculumEntries = await prisma.curriculum.findMany({ where: { subject } })
  const validProgramMonths = curriculumEntries.map((c) => c.programMonth)

  const students = await prisma.student.findMany({
    where: { isActive: true, isFloating: false },
    select: { cohortStartMonth: true, track: true },
  })

  const cohortSet = new Map<string, { cohortStartMonth: number; track: Track }>()
  for (const s of students) {
    const pm = getProgramMonth(s.cohortStartMonth, currentMonth)
    if (pm !== null && validProgramMonths.includes(pm)) {
      const key = `${s.cohortStartMonth}-${s.track}`
      if (!cohortSet.has(key)) {
        cohortSet.set(key, { cohortStartMonth: s.cohortStartMonth, track: s.track })
      }
    }
  }

  res.json({ success: true, data: Array.from(cohortSet.values()) })
})

// GET /api/grades/templates — list templates for teacher's subject
router.get('/templates', requireAuth, async (req: Request, res: Response) => {
  const teacher = await prisma.teacher.findUnique({ where: { id: req.teacher!.teacherId } })
  if (!teacher) {
    res.status(404).json({ success: false, error: 'Teacher not found' })
    return
  }

  const subject = String(req.query.subject ?? '')
  const teacherSubjects = [teacher.subject1, teacher.subject2, teacher.subject3].filter(Boolean)
  if (!subject || !teacherSubjects.includes(subject)) {
    res.status(400).json({ success: false, error: 'Invalid or unauthorized subject' })
    return
  }

  const templates = await prisma.gradeTemplate.findMany({
    where: { teacherId: teacher.id, subject },
    orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
  })

  res.json({ success: true, data: templates })
})

// POST /api/grades/templates — create a template, optionally batch entries to all active students
router.post('/templates', requireAuth, async (req: Request, res: Response) => {
  const teacher = await prisma.teacher.findUnique({ where: { id: req.teacher!.teacherId } })
  if (!teacher) {
    res.status(404).json({ success: false, error: 'Teacher not found' })
    return
  }

  const { subject, type, name, description, maxScore, batchAllCohorts } = req.body as {
    subject: string
    type: GradeType
    name: string
    description?: string
    maxScore?: number
    batchAllCohorts?: boolean
  }

  const teacherSubjects = [teacher.subject1, teacher.subject2, teacher.subject3].filter(Boolean)
  if (!subject || !teacherSubjects.includes(subject)) {
    res.status(400).json({ success: false, error: 'Invalid or unauthorized subject' })
    return
  }
  if (!type || !['quiz', 'project'].includes(type)) {
    res.status(400).json({ success: false, error: 'type must be quiz or project' })
    return
  }
  if (!name || !name.trim()) {
    res.status(400).json({ success: false, error: 'name is required' })
    return
  }

  const template = await prisma.gradeTemplate.create({
    data: {
      teacherId: teacher.id,
      subject,
      type,
      name: name.trim(),
      description: description?.trim() || null,
      maxScore: maxScore ?? 100,
    },
  })

  if (batchAllCohorts) {
    const currentMonth = new Date().getMonth() + 1
    const curriculumEntries = await prisma.curriculum.findMany({ where: { subject } })
    const validProgramMonths = curriculumEntries.map((c) => c.programMonth)

    const students = await prisma.student.findMany({
      where: { isActive: true, isFloating: false },
      select: { id: true, cohortStartMonth: true },
    })

    const eligible = students.filter((s) => {
      const pm = getProgramMonth(s.cohortStartMonth, currentMonth)
      return pm !== null && validProgramMonths.includes(pm)
    })

    if (eligible.length > 0) {
      await prisma.gradeEntry.createMany({
        data: eligible.map((s) => ({ templateId: template.id, studentId: s.id })),
        skipDuplicates: true,
      })
    }
  }

  res.status(201).json({ success: true, data: template })
})

// DELETE /api/grades/templates/:id — delete template and cascade entries
router.delete('/templates/:id', requireAuth, async (req: Request, res: Response) => {
  const teacher = await prisma.teacher.findUnique({ where: { id: req.teacher!.teacherId } })
  if (!teacher) {
    res.status(404).json({ success: false, error: 'Teacher not found' })
    return
  }

  const template = await prisma.gradeTemplate.findUnique({ where: { id: req.params.id } })
  if (!template || template.teacherId !== teacher.id) {
    res.status(404).json({ success: false, error: 'Template not found' })
    return
  }

  await prisma.gradeTemplate.delete({ where: { id: template.id } })
  res.json({ success: true, data: null })
})

// GET /api/grades/dashboard — grade table for one cohort
router.get('/dashboard', requireAuth, async (req: Request, res: Response) => {
  const teacher = await prisma.teacher.findUnique({ where: { id: req.teacher!.teacherId } })
  if (!teacher) {
    res.status(404).json({ success: false, error: 'Teacher not found' })
    return
  }

  const subject = String(req.query.subject ?? '')
  const cohortStartMonth = parseInt(String(req.query.cohortStartMonth ?? ''), 10)
  const track = String(req.query.track ?? '') as Track

  const teacherSubjects = [teacher.subject1, teacher.subject2, teacher.subject3].filter(Boolean)
  if (!subject || !teacherSubjects.includes(subject)) {
    res.status(400).json({ success: false, error: 'Invalid or unauthorized subject' })
    return
  }
  if (!cohortStartMonth || cohortStartMonth < 1 || cohortStartMonth > 12) {
    res.status(400).json({ success: false, error: 'Invalid cohortStartMonth' })
    return
  }
  if (!VALID_TRACKS.includes(track)) {
    res.status(400).json({ success: false, error: 'Invalid track' })
    return
  }

  const students = await prisma.student.findMany({
    where: { isActive: true, isFloating: false, cohortStartMonth, track },
    select: { id: true, studentId: true, fullName: true },
    orderBy: { fullName: 'asc' },
  })

  const templates = await prisma.gradeTemplate.findMany({
    where: { teacherId: teacher.id, subject },
    orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
  })

  const studentIds = students.map((s) => s.id)
  const templateIds = templates.map((t) => t.id)

  const entries = await prisma.gradeEntry.findMany({
    where: { templateId: { in: templateIds }, studentId: { in: studentIds } },
  })

  // Attendance: current month, filtered by subject's room
  const room = SUBJECT_TO_ROOM[subject]
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const monthStart = new Date(year, month - 1, 1)
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999)
  const expectedDays = weekdayCountInMonth(year, month)

  const attendanceLogs = room
    ? await prisma.attendanceLog.findMany({
        where: {
          studentId: { in: studentIds },
          roomName: room,
          date: { gte: monthStart, lte: monthEnd },
        },
        select: { studentId: true, date: true },
      })
    : []

  // Count distinct dates per student
  const attendanceMap = new Map<string, Set<string>>()
  for (const log of attendanceLogs) {
    const dateKey = log.date.toISOString().split('T')[0]
    if (!attendanceMap.has(log.studentId)) attendanceMap.set(log.studentId, new Set())
    attendanceMap.get(log.studentId)!.add(dateKey)
  }

  // Build per-student rows
  const rows = students.map((s) => {
    const presentDays = attendanceMap.get(s.id)?.size ?? 0
    const attendancePct = expectedDays > 0 ? Math.min(100, (presentDays / expectedDays) * 100) : 0

    const studentEntries = entries.filter((e) => e.studentId === s.id)

    const quizTemplateIds = new Set(templates.filter((t) => t.type === 'quiz').map((t) => t.id))
    const projectTemplateIds = new Set(templates.filter((t) => t.type === 'project').map((t) => t.id))

    const quizScores = studentEntries
      .filter((e) => quizTemplateIds.has(e.templateId) && e.score !== null)
      .map((e) => {
        const tmpl = templates.find((t) => t.id === e.templateId)!
        return (Number(e.score) / Number(tmpl.maxScore)) * 100
      })

    const projectScores = studentEntries
      .filter((e) => projectTemplateIds.has(e.templateId) && e.isVerified && e.score !== null)
      .map((e) => {
        const tmpl = templates.find((t) => t.id === e.templateId)!
        return (Number(e.score) / Number(tmpl.maxScore)) * 100
      })

    const total = calcGradeTotal(attendancePct, quizScores, projectScores)

    const entryMap = Object.fromEntries(studentEntries.map((e) => [e.templateId, e]))

    return {
      studentDbId: s.id,
      studentId: s.studentId,
      fullName: s.fullName,
      attendancePct: Math.round(attendancePct * 10) / 10,
      total: Math.round(total * 10) / 10,
      entries: entryMap,
    }
  })

  res.json({
    success: true,
    data: {
      subject,
      cohortStartMonth,
      track,
      templates,
      students: rows,
    },
  })
})

// PUT /api/grades/entries/:entryId — set score and/or verify
router.put('/entries/:entryId', requireAuth, async (req: Request, res: Response) => {
  const teacher = await prisma.teacher.findUnique({ where: { id: req.teacher!.teacherId } })
  if (!teacher) {
    res.status(404).json({ success: false, error: 'Teacher not found' })
    return
  }

  const entry = await prisma.gradeEntry.findUnique({
    where: { id: req.params.entryId },
    include: { template: true },
  })
  if (!entry || entry.template.teacherId !== teacher.id) {
    res.status(404).json({ success: false, error: 'Entry not found' })
    return
  }

  const { score, isVerified } = req.body as { score?: number | null; isVerified?: boolean }

  const updated = await prisma.gradeEntry.update({
    where: { id: entry.id },
    data: {
      ...(score !== undefined && { score: score }),
      ...(isVerified !== undefined && {
        isVerified,
        verifiedById: isVerified ? teacher.id : null,
        verifiedAt: isVerified ? new Date() : null,
        submittedBy: isVerified && !entry.submittedBy ? 'teacher' : entry.submittedBy,
        submittedAt: isVerified && !entry.submittedAt ? new Date() : entry.submittedAt,
      }),
    },
  })

  res.json({ success: true, data: updated })
})

// POST /api/grades/entries — create entry for a student+template pair
router.post('/entries', requireAuth, async (req: Request, res: Response) => {
  const teacher = await prisma.teacher.findUnique({ where: { id: req.teacher!.teacherId } })
  if (!teacher) {
    res.status(404).json({ success: false, error: 'Teacher not found' })
    return
  }

  const { templateId, studentDbId } = req.body as { templateId: string; studentDbId: string }
  if (!templateId || !studentDbId) {
    res.status(400).json({ success: false, error: 'templateId and studentDbId are required' })
    return
  }

  const template = await prisma.gradeTemplate.findUnique({ where: { id: templateId } })
  if (!template || template.teacherId !== teacher.id) {
    res.status(404).json({ success: false, error: 'Template not found' })
    return
  }

  const entry = await prisma.gradeEntry.upsert({
    where: { templateId_studentId: { templateId, studentId: studentDbId } },
    create: { templateId, studentId: studentDbId },
    update: {},
  })

  res.status(201).json({ success: true, data: entry })
})

// GET /api/grades/projects/public — subjects with project templates (no auth)
router.get('/projects/public', async (req: Request, res: Response) => {
  const subject = req.query.subject ? String(req.query.subject) : undefined

  const templates = await prisma.gradeTemplate.findMany({
    where: { type: 'project', ...(subject ? { subject } : {}) },
    select: { id: true, subject: true, name: true, description: true },
    orderBy: [{ subject: 'asc' }, { name: 'asc' }],
  })

  const subjects = [...new Set(templates.map((t) => t.subject))].sort()

  res.json({ success: true, data: { subjects, templates } })
})

// POST /api/grades/projects/submit — student submits a project (no auth)
router.post('/projects/submit', async (req: Request, res: Response) => {
  const { studentId, templateId } = req.body as { studentId: string; templateId: string }

  if (!studentId || !templateId) {
    res.status(400).json({ success: false, error: 'studentId and templateId are required' })
    return
  }

  const student = await prisma.student.findUnique({ where: { studentId } })
  if (!student) {
    res.status(404).json({ success: false, error: 'Student not found' })
    return
  }

  const template = await prisma.gradeTemplate.findUnique({ where: { id: templateId } })
  if (!template || template.type !== 'project') {
    res.status(404).json({ success: false, error: 'Project not found' })
    return
  }

  const existing = await prisma.gradeEntry.findUnique({
    where: { templateId_studentId: { templateId, studentId: student.id } },
  })
  if (existing?.isVerified) {
    res.status(409).json({ success: false, error: 'This project has already been verified' })
    return
  }

  const entry = await prisma.gradeEntry.upsert({
    where: { templateId_studentId: { templateId, studentId: student.id } },
    create: {
      templateId,
      studentId: student.id,
      submittedBy: 'student',
      submittedAt: new Date(),
    },
    update: {
      submittedBy: 'student',
      submittedAt: new Date(),
    },
  })

  res.status(201).json({ success: true, data: entry })
})

export default router
