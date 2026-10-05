import prisma from '../lib/prisma'

export const SCHOOL_TIME_ZONE = 'America/New_York'
const schoolDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SCHOOL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
})

export function schoolDateKey(date: Date): string {
  const parts = schoolDateFormatter.formatToParts(date)
  const part = (name: string) => parts.find((p) => p.type === name)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function schoolCalendarMonth(date: Date = new Date()) {
  const [year, month] = schoolDateKey(date).split('-').map(Number)
  return { year, month }
}

export function attendanceDates(year: number, month: number): string[] {
  if (!Number.isInteger(year) || year < 1900 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('Invalid attendance month or year')
  }
  const first = new Date(Date.UTC(year, month - 1, 1))
  const monday = 1 + (8 - first.getUTCDay()) % 7
  return Array.from({ length: 20 }, (_, i) =>
    new Date(Date.UTC(year, month - 1, monday + Math.floor(i / 5) * 7 + i % 5)).toISOString().slice(0, 10)
  )
}

export function monthlyAttendanceDefinition(year: number, month: number) {
  const dates = attendanceDates(year, month)
  const label = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)))
  return { year, month, name: `${label} Grade`, dates }
}

export async function ensureAttendanceMonth(year: number, month: number) {
  const definition = monthlyAttendanceDefinition(year, month)
  // INSERT ... ON CONFLICT DO NOTHING also handles concurrent server startups.
  await prisma.attendanceMonth.createMany({
    data: [definition],
    skipDuplicates: true,
  })
  return definition
}

export async function prepareAttendanceMonths(now: Date = new Date()) {
  const { year, month } = schoolCalendarMonth(now)
  await ensureAttendanceMonth(year, month)
  await ensureAttendanceMonth(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1)
}

export function attendanceBreakdown(period: { name: string; year: number; month: number; dates: string[] }, logs: { loginTime: Date }[]) {
  const signedDates = new Set(logs.map((log) => schoolDateKey(log.loginTime)))
  const days = period.dates.map((date) => ({ date, completed: signedDates.has(date) }))
  const signIns = days.filter((day) => day.completed).length
  return { name: period.name, year: period.year, month: period.month, signIns, expectedDays: 20, percent: signIns * 5, days }
}

export async function getMonthlyAttendance(studentId: string, year: number, month: number) {
  // The calendar is deterministic. Reading grades must not require a schema write
  // or the scheduled job's month-definition table to have been initialized yet.
  const period = monthlyAttendanceDefinition(year, month)
  // Fetch a padded UTC range; membership is determined by Philadelphia calendar dates.
  const start = new Date(`${period.dates[0]}T00:00:00Z`)
  const end = new Date(`${period.dates[19]}T00:00:00Z`)
  end.setUTCDate(end.getUTCDate() + 2)
  const logs = await prisma.attendanceLog.findMany({
    where: { studentId, loginTime: { gte: start, lt: end } },
    select: { loginTime: true },
  })
  return attendanceBreakdown(period, logs)
}
