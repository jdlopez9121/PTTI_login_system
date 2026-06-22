import { Router, Request, Response } from 'express'
import { Shift } from '@prisma/client'
import prisma from '../lib/prisma'
import { requireAuth } from '../middleware/requireAuth'
import { classifyByTime, trackFromShift } from '../services/shiftService'
import { getProgramMonth } from '../services/headcountService'

const router = Router()

// GET /api/school-wide — all subjects present/total for current shift (teacher auth)
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const now = new Date()
  const shift: Shift = (req.query.shift as Shift) ?? classifyByTime(now) ?? 'morning'
  const currentMonth = now.getMonth() + 1

  // Get all curriculum entries for this shift
  const curriculumEntries = await prisma.curriculum.findMany({ where: { shift } })

  const track = trackFromShift(shift)

  const startOfDay = new Date(now)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(now)
  endOfDay.setHours(23, 59, 59, 999)

  const [allStudents, presentLogs] = await Promise.all([
    prisma.student.findMany({
      where: { isActive: true, track },
      select: { id: true, cohortStartMonth: true },
    }),
    prisma.attendanceLog.findMany({
      where: {
        shift,
        loginTime: { gte: startOfDay, lte: endOfDay },
        student: { isActive: true, track },
      },
      include: { student: { select: { cohortStartMonth: true } } },
    }),
  ])

  const results = curriculumEntries.map((entry) => {
    const theoretical = allStudents.filter(
      (s) => getProgramMonth(s.cohortStartMonth, currentMonth) === entry.programMonth
    )
    const presentCount = presentLogs.filter(
      (log) => getProgramMonth(log.student.cohortStartMonth, currentMonth) === entry.programMonth
    ).length
    const total = theoretical.length
    const percentage = total > 0 ? Math.round((presentCount / total) * 100) : 0
    return { subject: entry.subject, programMonth: entry.programMonth, present: presentCount, total, percentage }
  })

  results.sort((a, b) => a.programMonth - b.programMonth)

  res.json({ success: true, data: { shift, rows: results } })
})

export default router
