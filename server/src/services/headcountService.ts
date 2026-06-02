import { Shift } from '@prisma/client'
import { trackFromShift } from './shiftService'
import prisma from '../lib/prisma'

export { trackFromShift }

export function getProgramMonth(cohortStartMonth: number, currentMonth: number): number | null {
  let pm = currentMonth - cohortStartMonth + 1
  // If negative, the student started in a previous calendar year
  if (pm <= 0) pm = currentMonth + (12 - cohortStartMonth) + 1
  if (pm < 1 || pm > 5) return null
  return pm
}

export interface HeadcountStudent {
  studentId: string
  fullName: string
  cohortStartMonth: number
  subject: string
}

// Accepts up to 3 subjects. Returns all students whose current program_month
// maps to any of the teacher's subjects for the given shift.
export async function getTheoreticalHeadcount(
  subjects: string[],
  shift: Shift,
  referenceDate: Date = new Date()
): Promise<{ students: HeadcountStudent[]; total: number }> {
  const currentMonth = referenceDate.getMonth() + 1
  const track = trackFromShift(shift)

  const activeSubjects = subjects.filter(Boolean)
  if (activeSubjects.length === 0) return { students: [], total: 0 }

  // Find curriculum entries for all subjects in this shift
  const curriculumEntries = await prisma.curriculum.findMany({
    where: { subject: { in: activeSubjects }, shift },
  })
  if (curriculumEntries.length === 0) return { students: [], total: 0 }

  const allStudents = await prisma.student.findMany({
    where: { isActive: true, isFloating: false, track },
    select: { id: true, studentId: true, fullName: true, cohortStartMonth: true },
  })

  const matched: HeadcountStudent[] = []

  for (const entry of curriculumEntries) {
    const group = allStudents.filter((s) => {
      const pm = getProgramMonth(s.cohortStartMonth, currentMonth)
      return pm === entry.programMonth
    })
    for (const s of group) {
      matched.push({
        studentId: s.studentId,
        fullName: s.fullName,
        cohortStartMonth: s.cohortStartMonth,
        subject: entry.subject,
      })
    }
  }

  return { students: matched, total: matched.length }
}
