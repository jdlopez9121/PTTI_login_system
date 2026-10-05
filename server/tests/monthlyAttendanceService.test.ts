import assert from 'node:assert/strict'
import express from 'express'
import cookieParser from 'cookie-parser'
import jwt from 'jsonwebtoken'
import type { AddressInfo } from 'node:net'
import gradesRouter from '../src/routes/grades'
import prisma from '../src/lib/prisma'
import {
  attendanceDates, attendanceBreakdown, monthlyAttendanceDefinition,
  getMonthlyAttendance, prepareAttendanceMonths, schoolDateKey,
} from '../src/services/monthlyAttendanceService'
import { calculateGrade } from '../src/services/gradeService'
import { validateLoginTime } from '../src/services/shiftService'

async function main() {
  // Every starting weekday, leap years, February spillover, and year boundaries.
  for (let year = 2024; year <= 2032; year++) {
    for (let month = 1; month <= 12; month++) {
      const days = attendanceDates(year, month)
      assert.equal(days.length, 20)
      assert.equal(new Set(days).size, 20)
      assert.ok(Number(days[0].slice(8)) <= 7)
      days.forEach((day, i) => assert.equal(new Date(day).getUTCDay(), i % 5 + 1))
      assert.equal((+new Date(days[19]) - +new Date(days[0])) / 86400000, 25)
    }
  }
  assert.equal(attendanceDates(2026, 10)[0], '2026-10-05')
  assert.equal(attendanceDates(2026, 10)[19], '2026-10-30')
  assert.equal(attendanceDates(2026, 2)[19], '2026-02-27')
  assert.equal(attendanceDates(2027, 2)[19], '2027-02-26')
  assert.equal(attendanceDates(2026, 5)[19], '2026-05-29')
  assert.equal(attendanceDates(2025, 2)[19], '2025-02-28')
  assert.equal(attendanceDates(2024, 2)[19], '2024-03-01')
  assert.equal(attendanceDates(2023, 2)[19], '2023-03-03')
  assert.equal(attendanceDates(2026, 3)[19], '2026-03-27')
  assert.throws(() => attendanceDates(2026, 13))
  assert.equal(schoolDateKey(new Date('2026-10-06T03:59:59Z')), '2026-10-05')
  assert.equal(schoolDateKey(new Date('2026-10-06T04:00:00Z')), '2026-10-06')
  assert.equal(schoolDateKey(new Date('2026-12-08T04:59:59Z')), '2026-12-07')

  const period = monthlyAttendanceDefinition(2026, 3)
  const logs = period.dates.slice(0, 18).map((date) => ({ loginTime: new Date(`${date}T16:00:00Z`) }))
  logs.push(logs[0], logs[0], { loginTime: new Date('2026-03-28T16:00:00Z') }, { loginTime: new Date('2026-03-30T16:00:00Z') })
  const result = attendanceBreakdown(period, logs)
  assert.equal(result.name, 'March Grade')
  assert.equal(result.signIns, 18)
  assert.equal(result.expectedDays, 20)
  assert.equal(result.percent, 90)
  assert.equal(result.days.filter((d) => d.completed).length, 18)
  assert.equal(attendanceBreakdown(period, []).percent, 0)
  assert.equal(attendanceBreakdown(period, period.dates.map((date) => ({ loginTime: new Date(`${date}T16:00:00Z`) }))).percent, 100)
  assert.equal(attendanceBreakdown(monthlyAttendanceDefinition(2026, 10), [{ loginTime: new Date('2026-10-01T16:00:00Z') }]).signIns, 0)

  const stored = new Map<string, ReturnType<typeof monthlyAttendanceDefinition>>()
  prisma.attendanceMonth.createMany = (async ({ data, skipDuplicates }: any) => {
    assert.equal(skipDuplicates, true)
    let count = 0
    for (const definition of data) {
      const key = `${definition.year}-${definition.month}`
      if (!stored.has(key)) { stored.set(key, definition); count++ }
    }
    return { count }
  }) as any
  prisma.attendanceLog.findMany = (async ({ where, select }: any) => {
    assert.equal(where.studentId, 'student-1')
    assert.equal(where.shift, undefined)
    assert.equal(where.roomName, undefined)
    assert.deepEqual(select, { loginTime: true })
    assert.ok(where.loginTime.gte <= logs[0].loginTime)
    return logs
  }) as any
  assert.equal((await getMonthlyAttendance('student-1', 2026, 3)).percent, 90)
  assert.equal(stored.size, 0, 'Grade reads must not write month definitions')
  await Promise.all(Array.from({ length: 5 }, () => prepareAttendanceMonths(new Date('2026-12-31T23:00:00Z'))))
  assert.equal(stored.size, 2)
  assert.equal(stored.get('2027-1')?.name, 'January Grade')
  assert.equal(stored.get('2026-12')?.dates.length, 20)

  // Attendance follows the selected month, regardless of today's date or class shift.
  prisma.gradeTemplate.findMany = (async () => []) as any
  prisma.gradeEntry.findMany = (async () => []) as any
  const grade = await calculateGrade('student-1', 'PLC 1', 3, 2026)
  assert.equal(grade.attendance.month, 3)
  assert.equal(grade.attendance.percent, 90)
  assert.equal(grade.total, 9)

  // Exercise the real dashboard route: selected month controls both roster and grade.
  prisma.teacher.findUnique = (async () => ({ subject1: 'PLC 1', shift: 'morning' })) as any
  prisma.curriculum.findFirst = (async () => ({ programMonth: 1, shift: 'afternoon' })) as any
  prisma.student.findMany = (async ({ where }: any) => {
    assert.equal(where.track, 'day')
    return [
      { id: 'student-1', studentId: '100', fullName: 'March Student', cohortStartMonth: 3, cohortStartYear: 2026 },
      { id: 'student-2', studentId: '200', fullName: 'October Student', cohortStartMonth: 10, cohortStartYear: 2026 },
      { id: 'old-student', studentId: '300', fullName: 'Previous March', cohortStartMonth: 3, cohortStartYear: 2025 },
      { id: 'unknown-student', studentId: '400', fullName: 'Unknown March', cohortStartMonth: 3, cohortStartYear: null },
    ]
  }) as any
  const app = express()
  app.use(cookieParser())
  app.use('/grades', gradesRouter)
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/grades/dashboard`
    const token = jwt.sign({ teacherId: 'teacher-1', email: 'test@example.com' }, process.env.JWT_SECRET ?? 'dev-secret')
    const headers = { Cookie: `token=${token}` }
    const response = await fetch(`${base}?subject=PLC+1&cohortMonth=3&cohortYear=2026`, { headers })
    assert.equal(response.status, 200)
    const body = await response.json() as any
    const future = await fetch(`${base}?subject=PLC+1&cohortMonth=3&cohortYear=2027`, { headers })
    assert.equal(future.status, 200)
    const missing = await future.json() as any
    assert.deepEqual(missing.data.students, [])
    assert.equal(missing.data.message, 'student cohort has not been uploaded yet to the system')
    assert.equal(body.data.students.length, 1)
    assert.equal(body.data.students[0].studentId, '100')
    assert.equal(body.data.students[0].attendance.percent, 90)
    assert.equal(body.data.students[0].attendance.days.length, 20)
    assert.equal((await fetch(`${base}?subject=PLC+1&cohortMonth=13&cohortYear=2026`, { headers })).status, 400)
    assert.equal((await fetch(`${base}?subject=PLC+1&cohortMonth=3&cohortYear=2026`)).status, 401)
    // Deployments may start the API before the optional month-definition table exists.
    // Grade reads must still calculate the same 20-day grade from attendance logs.
    prisma.attendanceMonth.upsert = (async () => {
      throw Object.assign(new Error('The table public.attendance_months does not exist'), { code: 'P2021' })
    }) as any
    prisma.attendanceMonth.createMany = prisma.attendanceMonth.upsert as any
    const withoutMonthTable = await fetch(`${base}?subject=PLC+1&cohortMonth=3&cohortYear=2026`, { headers })
    assert.equal(withoutMonthTable.status, 200, 'Missing month-definition table must not break the grade dashboard')
    const recovered = await withoutMonthTable.json() as any
    assert.equal(recovered.data.students[0].attendance.percent, 90)
    prisma.attendanceLog.findMany = (async () => []) as any
    let programMonth = 1
    prisma.curriculum.findFirst = (async () => ({ programMonth })) as any
    const decemberStudents = [
      { id: 'dec-old', studentId: '2025', fullName: 'December 2025', cohortStartMonth: 12, cohortStartYear: 2025 },
      { id: 'dec-new', studentId: '2026', fullName: 'December 2026', cohortStartMonth: 12, cohortStartYear: 2026 },
    ]
    prisma.student.findMany = (async () => decemberStudents.slice(0, 1)) as any
    const read = async (month: number, year: number) => {
      const response = await fetch(`${base}?subject=PLC+1&cohortMonth=${month}&cohortYear=${year}`, { headers })
      assert.equal(response.status, 200)
      return (await response.json() as any).data
    }
    assert.equal((await read(12, 2026)).message, 'student cohort has not been uploaded yet to the system')
    prisma.student.findMany = (async () => decemberStudents) as any
    assert.deepEqual((await read(12, 2026)).students.map((s: any) => s.studentId), ['2026'])
    assert.deepEqual((await read(12, 2025)).students.map((s: any) => s.studentId), ['2025'])
    programMonth = 2
    assert.deepEqual((await read(1, 2027)).students.map((s: any) => s.studentId), ['2026'])
    assert.deepEqual((await read(1, 2026)).students.map((s: any) => s.studentId), ['2025'])

  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()))
  }
  assert.ok(validateLoginTime(10, 45).warning)
  assert.equal(validateLoginTime(10, 45).allowed, true)
  console.log('Monthly attendance tests passed')
}

main().catch((err) => { console.error(err); process.exitCode = 1 })
