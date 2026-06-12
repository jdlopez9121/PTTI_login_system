import { Shift } from '@prisma/client'
import prisma from '../lib/prisma'
import { getProgramMonth } from './headcountService'

// ---------------------------------------------------------------------------
// Calendar helpers — piggybacking on the monthly rotation cron logic.
// The cron fires on the 1st of every month, so each cohort month maps
// exactly to one calendar month. Expected attendance days = weekdays in
// that calendar month (Mon–Fri), matching what the rotation boundary defines.
// ---------------------------------------------------------------------------

export function workdaysInMonth(year: number, month: number): number {
  const daysInMonth = new Date(year, month, 0).getDate()
  let count = 0
  for (let day = 1; day <= daysInMonth; day++) {
    const dow = new Date(year, month - 1, day).getDay()
    if (dow !== 0 && dow !== 6) count++
  }
  return count
}

// Given a student's cohortStartMonth and their programMonth (1–5),
// derive the calendar month (1–12) and year that cohort period falls in.
export function cohortCalendarMonth(
  cohortStartMonth: number,
  programMonth: number,
  referenceDate: Date = new Date()
): { month: number; year: number } {
  const currentMonth = referenceDate.getMonth() + 1
  const currentYear  = referenceDate.getFullYear()

  // Raw calendar month (may overflow 12)
  const rawMonth = cohortStartMonth + programMonth - 1
  const month = ((rawMonth - 1) % 12) + 1

  // If the cohort month is in the future relative to now, it wrapped to last year
  const wrappedBack = rawMonth > 12
  let year = currentYear
  if (wrappedBack && month > currentMonth) year -= 1
  if (!wrappedBack && month > currentMonth) year -= 1

  return { month, year }
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export async function getAttendancePercent(
  studentDbId: string,
  cohortStartMonth: number,
  programMonth: number,
  teacherShift: Shift,
  referenceDate: Date = new Date()
): Promise<{ signIns: number; expectedDays: number; percent: number }> {
  const { month, year } = cohortCalendarMonth(cohortStartMonth, programMonth, referenceDate)

  const firstDay = new Date(year, month - 1, 1)
  const lastDay  = new Date(year, month, 0, 23, 59, 59, 999)

  const signIns = await prisma.attendanceLog.count({
    where: {
      studentId: studentDbId,
      shift: teacherShift,
      loginTime: { gte: firstDay, lte: lastDay },
    },
  })

  const expectedDays = workdaysInMonth(year, month)
  const percent = Math.min(100, Math.round((signIns / expectedDays) * 100))

  return { signIns, expectedDays, percent }
}

// ---------------------------------------------------------------------------
// Weighted grade calculation
// Weights: Attendance 10% | Quiz 15% | Project 75%
// Quiz score  = average of all quiz entries (missing = 0, max = 100)
// Project score = average of VERIFIED project entries only (unverified = pending)
// ---------------------------------------------------------------------------

export interface GradeBreakdown {
  attendance: { signIns: number; expectedDays: number; percent: number }
  quiz: { earned: number; possible: number; percent: number; entries: QuizEntry[] }
  project: { earned: number; possible: number; percent: number; entries: ProjectEntry[] }
  total: number
}

export interface QuizEntry {
  templateId: string
  name: string
  score: number | null
}

export interface ProjectEntry {
  templateId: string
  entryId: string
  name: string
  score: number | null
  submittedAt: Date | null
  verifiedAt: Date | null
}

export async function calculateGrade(
  studentDbId: string,
  cohortStartMonth: number,
  programMonth: number,
  subject: string,
  teacherShift: Shift,
  cohortMonth: number,
  cohortYear: number,
  referenceDate: Date = new Date()
): Promise<GradeBreakdown> {
  // Attendance
  const attendance = await getAttendancePercent(
    studentDbId, cohortStartMonth, programMonth, teacherShift, referenceDate
  )

  // Templates for this subject
  const [quizTemplates, projectTemplates] = await Promise.all([
    prisma.gradeTemplate.findMany({
      where: { subject, type: 'quiz', isActive: true },
      orderBy: { order: 'asc' },
    }),
    prisma.gradeTemplate.findMany({
      where: { subject, type: 'project', isActive: true },
      orderBy: { order: 'asc' },
    }),
  ])

  // Existing entries for this student + cohort
  const allEntries = await prisma.gradeEntry.findMany({
    where: {
      studentId: studentDbId,
      cohortMonth,
      cohortYear,
      template: { subject },
    },
  })

  const entryByTemplate = new Map(allEntries.map((e) => [e.templateId, e]))

  // Quiz breakdown
  const quizEntries: QuizEntry[] = quizTemplates.map((t) => ({
    templateId: t.id,
    name: t.name,
    score: entryByTemplate.get(t.id)?.score ?? null,
  }))
  const quizPossible = quizTemplates.length * 100
  const quizEarned   = quizEntries.reduce((sum, e) => sum + (e.score ?? 0), 0)
  const quizPercent  = quizPossible === 0 ? 0 : Math.round((quizEarned / quizPossible) * 100)

  // Project breakdown (only verified entries count toward score)
  const projectEntries: ProjectEntry[] = projectTemplates.map((t) => {
    const entry = entryByTemplate.get(t.id)
    return {
      templateId: t.id,
      entryId: entry?.id ?? '',
      name: t.name,
      score: entry?.verifiedAt ? (entry.score ?? null) : null,
      submittedAt: entry?.submittedAt ?? null,
      verifiedAt: entry?.verifiedAt ?? null,
    }
  })
  const verifiedProjects  = projectEntries.filter((e) => e.verifiedAt !== null)
  const projectPossible   = verifiedProjects.length * 100
  const projectEarned     = verifiedProjects.reduce((sum, e) => sum + (e.score ?? 0), 0)
  const projectPercent    = projectPossible === 0 ? 0 : Math.round((projectEarned / projectPossible) * 100)

  // Weighted total
  const total = Math.round(
    attendance.percent * 0.10 +
    quizPercent        * 0.15 +
    projectPercent     * 0.75
  )

  return {
    attendance,
    quiz:    { earned: quizEarned,    possible: quizPossible,    percent: quizPercent,    entries: quizEntries },
    project: { earned: projectEarned, possible: projectPossible, percent: projectPercent, entries: projectEntries },
    total,
  }
}
