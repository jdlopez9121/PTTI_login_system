import { Router } from 'express'
import type { Shift } from '@prisma/client'
import prisma from '../lib/prisma'
import { requireAuth } from '../middleware/requireAuth'
import { trackFromShift, classifyByTime } from '../services/shiftService'
import { schoolCalendarMonth } from '../services/monthlyAttendanceService'

const router = Router()
router.use(requireAuth)
const shifts = ['morning', 'afternoon', 'evening', 'night']

async function context(teacherId: string, input: Record<string, unknown>) {
  const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } })
  if (!teacher) return { error: 'Teacher not found', status: 403 } as const
  const current = schoolCalendarMonth()
  const month = Number(input.month ?? current.month), year = Number(input.year ?? current.year)
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 1900 || year > 9999) {
    return { error: 'Choose a valid grading month', status: 400 } as const
  }
  const classes = await prisma.curriculum.findMany({
    where: { subject: { in: [teacher.subject1, teacher.subject2, teacher.subject3].filter((s): s is string => Boolean(s)) }, track: trackFromShift(teacher.shift) },
    orderBy: [{ shift: 'asc' }, { subject: 'asc' }],
  })
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date())
  const hour = Number(parts.find(p => p.type === 'hour')!.value), minute = Number(parts.find(p => p.type === 'minute')!.value)
  const currentShift = classifyByTime(new Date(2000, 0, 1, hour, minute)) ?? teacher.shift
  const selected = input.subject || input.shift
    ? classes.find(c => c.subject === input.subject && c.shift === input.shift && shifts.includes(String(input.shift)))
    : classes.find(c => c.shift === currentShift) ?? classes.find(c => c.shift === teacher.shift) ?? classes[0]
  if (!selected) return { error: 'No assigned class found for this subject and period', status: 403 } as const
  const candidates = await prisma.student.findMany({
    where: { isActive: true, isFloating: false, track: selected.track },
    select: { id: true, studentId: true, fullName: true, cohortStartMonth: true, cohortStartYear: true },
    orderBy: { fullName: 'asc' },
  })
  const students = candidates.filter(s => {
    // Legacy imports may lack a year; use the most recent occurrence of their start month.
    const startYear = s.cohortStartYear ?? (s.cohortStartMonth > month ? year - 1 : year)
    return (year - startYear) * 12 + month - s.cohortStartMonth + 1 === selected.programMonth
  })
  return { classes: classes.map(c => ({ subject: c.subject, shift: c.shift })), selected, students, month, year }
}

router.get('/', async (req, res, next) => {
  try {
    const data = await context(req.teacher!.teacherId, req.query)
    if ('error' in data) { res.status(data.status ?? 400).json({ success: false, error: data.error }); return }
    const projects = await prisma.gradeTemplate.findMany({ where: { subject: data.selected.subject, type: 'project', isActive: true }, orderBy: [{ order: 'asc' }, { name: 'asc' }] })
    const entries = await prisma.gradeEntry.findMany({
      where: { studentId: { in: data.students.map(s => s.id) }, templateId: { in: projects.map(p => p.id) }, cohortMonth: data.month, cohortYear: data.year },
      select: { studentId: true, templateId: true, score: true, verifiedAt: true },
    })
    res.json({ success: true, data: {
      classes: data.classes, subject: data.selected.subject, shift: data.selected.shift, month: data.month, year: data.year,
      students: data.students.map(s => ({ id: s.id, studentId: s.studentId, fullName: s.fullName })),
      projects: projects.map(p => ({ id: p.id, name: p.name })),
      completed: entries.filter(e => e.verifiedAt && e.score === 100).map(e => ({ studentId: e.studentId, templateId: e.templateId })),
    } })
  } catch (error) { next(error) }
})

router.post('/complete', async (req, res, next) => {
  try {
    const { studentDbId, templateId, subject, shift, month, year } = req.body ?? {}
    if (typeof studentDbId !== 'string' || typeof templateId !== 'string' || !subject || !shift || !month || !year) {
      res.status(400).json({ success: false, error: 'Select a student, project, class, and month' }); return
    }
    const data = await context(req.teacher!.teacherId, req.body)
    if ('error' in data) { res.status(data.status ?? 400).json({ success: false, error: data.error }); return }
    if (!data.students.some(s => s.id === studentDbId)) {
      res.status(403).json({ success: false, error: 'Student is not in the selected class this month' }); return
    }
    const template = await prisma.gradeTemplate.findFirst({ where: { id: templateId, subject: data.selected.subject, type: 'project', isActive: true } })
    if (!template) { res.status(404).json({ success: false, error: 'Project not found in this class' }); return }
    const now = new Date()
    const values = { score: 100, submittedAt: now, submittedBy: req.teacher!.teacherId, verifiedAt: now, verifiedById: req.teacher!.teacherId }
    await prisma.gradeEntry.upsert({
      where: { templateId_studentId_cohortMonth_cohortYear: { templateId, studentId: studentDbId, cohortMonth: data.month, cohortYear: data.year } },
      create: { templateId, studentId: studentDbId, cohortMonth: data.month, cohortYear: data.year, ...values },
      update: values,
    })
    res.json({ success: true, data: { studentDbId, templateId, score: 100 } })
  } catch (error) { next(error) }
})

export default router
