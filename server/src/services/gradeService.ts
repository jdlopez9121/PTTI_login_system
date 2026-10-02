import prisma from '../lib/prisma'
import { getMonthlyAttendance } from './monthlyAttendanceService'

// ---------------------------------------------------------------------------
// Weighted grade calculation
// Weights: Attendance 10% | Quiz 15% | Project 75%
// Quiz score  = average of all quiz entries (missing = 0, max = 100)
// Project score = average of VERIFIED project entries only (unverified = pending)
// ---------------------------------------------------------------------------

export interface GradeBreakdown {
  attendance: Awaited<ReturnType<typeof getMonthlyAttendance>>
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
  subject: string,
  cohortMonth: number,
  cohortYear: number,
): Promise<GradeBreakdown> {
  // Attendance
  const attendance = await getMonthlyAttendance(studentDbId, cohortYear, cohortMonth)

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
