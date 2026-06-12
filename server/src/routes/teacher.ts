import { Router, Request, Response, NextFunction } from 'express'
import { Shift } from '@prisma/client'
import { requireAuth } from '../middleware/requireAuth'
import prisma from '../lib/prisma'
import { classifyByTime } from '../services/shiftService'
import { getTheoreticalHeadcount } from '../services/headcountService'

const router = Router()

const VALID_SHIFTS: Shift[] = ['morning', 'afternoon', 'evening', 'night']

router.get('/dashboard', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const teacher = await prisma.teacher.findUnique({
      where: { id: req.teacher!.teacherId },
    })
    if (!teacher) {
      res.status(404).json({ success: false, error: 'Teacher not found' })
      return
    }

    // Date override
    let targetDate: Date
    if (req.query.date) {
      targetDate = new Date(String(req.query.date))
      if (isNaN(targetDate.getTime())) {
        res.status(400).json({ success: false, error: 'Invalid date format' })
        return
      }
    } else {
      targetDate = new Date()
    }

    const startOfDay = new Date(targetDate)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(targetDate)
    endOfDay.setHours(23, 59, 59, 999)

    // "all" = show every shift for the day
    const showAll = String(req.query.shift) === 'all'

    let targetShift: Shift
    if (!showAll) {
      if (req.query.shift && VALID_SHIFTS.includes(String(req.query.shift) as Shift)) {
        targetShift = String(req.query.shift) as Shift
      } else {
        // Use client-provided shift (detected by browser's local clock)
        targetShift = (req.query.shift as Shift) ?? classifyByTime(new Date()) ?? teacher.shift
      }
    } else {
      targetShift = teacher.shift // fallback for headcount only; present uses all
    }

    // Present students
    const logs = await prisma.attendanceLog.findMany({
      where: {
        ...(showAll ? {} : { shift: targetShift }),
        loginTime: { gte: startOfDay, lte: endOfDay },
      },
      include: {
        student: { select: { studentId: true, fullName: true, cohortStartMonth: true } },
      },
      orderBy: { loginTime: 'asc' },
    })

    const presentStudents = logs.map((log) => ({
      logId: log.id,
      studentId: log.student.studentId,
      fullName: log.student.fullName,
      cohortStartMonth: log.student.cohortStartMonth,
      loginTime: log.loginTime,
      room: log.roomName,
      shift: log.shift,
    }))

    // Theoretical headcount
    const subjects = [teacher.subject1, teacher.subject2, teacher.subject3].filter((s): s is string => Boolean(s))

    let headcountStudents: Awaited<ReturnType<typeof getTheoreticalHeadcount>>['students'] = []
    let headcountTotal = 0

    if (showAll) {
      // Combine headcount across all shifts for the teacher's subjects
      for (const shift of VALID_SHIFTS) {
        const result = await getTheoreticalHeadcount(subjects, shift, targetDate)
        headcountStudents = [...headcountStudents, ...result.students]
        headcountTotal += result.total
      }
    } else {
      const result = await getTheoreticalHeadcount(subjects, targetShift, targetDate)
      headcountStudents = result.students
      headcountTotal = result.total
    }

    res.json({
      success: true,
      data: {
        teacher: { name: teacher.name, subject1: teacher.subject1, subject2: teacher.subject2, shift: teacher.shift },
        currentShift: showAll ? 'all' : targetShift,
        targetDate: targetDate.toISOString().split('T')[0],
        presentStudents,
        theoreticalHeadcount: headcountStudents,
        theoreticalTotal: headcountTotal,
      },
    })
  } catch (err) { next(err) }
})

export default router
