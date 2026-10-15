import assert from 'node:assert/strict'
import express from 'express'
import cookieParser from 'cookie-parser'
import jwt from 'jsonwebtoken'
import type { AddressInfo } from 'node:net'
import prisma from '../src/lib/prisma'
import gradesRouter from '../src/routes/grades'

async function main() {
  const roster = [
    { id: 'oct26', studentId: '100', fullName: 'October Student', cohortStartMonth: 10, cohortStartYear: 2026, track: 'day', isActive: true },
    { id: 'oct25', studentId: '101', fullName: 'Previous Year', cohortStartMonth: 10, cohortStartYear: 2025, track: 'day', isActive: true },
    { id: 'sep26', studentId: '102', fullName: 'September Student', cohortStartMonth: 9, cohortStartYear: 2026, track: 'day', isActive: true },
    { id: 'night', studentId: '103', fullName: 'Night Student', cohortStartMonth: 10, cohortStartYear: 2026, track: 'night', isActive: true },
    { id: 'inactive', studentId: '104', fullName: 'Inactive Student', cohortStartMonth: 10, cohortStartYear: 2026, track: 'day', isActive: false },
  ]
  prisma.teacher.findUnique = (async () => ({ subject1: 'PLC 1', subject2: 'PLC 2', subject3: null, shift: 'morning' })) as any
  prisma.student.findMany = (async ({ where }: any) => roster.filter((student) => Object.entries(where).every(([key, value]) => student[key as keyof typeof student] === value))) as any
  prisma.curriculum.findFirst = (async () => { throw new Error('Roster must not depend on subject curriculum') }) as any
  prisma.gradeTemplate.findMany = (async ({ where }: any) => where.type === 'project' ? [{ id: 'project', name: 'Project 1' }] : []) as any
  prisma.gradeEntry.findMany = (async ({ where }: any) => where.studentId === 'oct26' && where.cohortMonth === 11 && where.cohortYear === 2026 ? [{ templateId: 'project', id: 'entry', score: 85, submittedAt: new Date(), verifiedAt: new Date() }] : []) as any
  prisma.attendanceLog.findMany = (async () => []) as any

  const app = express()
  app.use(cookieParser())
  app.use('/grades', gradesRouter)
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/grades/dashboard`
  const headers = { Cookie: `token=${jwt.sign({ teacherId: 't1' }, process.env.JWT_SECRET ?? 'dev-secret')}` }
  async function lookup(subject: string, month = 10, year = 2026, studentId = '') {
    const response = await fetch(`${base}?${new URLSearchParams({ subject, cohortMonth: String(month), cohortYear: String(year), studentId })}`, { headers })
    return { status: response.status, body: await response.json() as any }
  }
  try {
    for (const subject of ['PLC 1', 'PLC 2']) {
      const result = await lookup(subject)
      assert.equal(result.status, 200)
      assert.deepEqual(result.body.data.students.map((student: any) => student.studentId), ['100'])
    }
    assert.equal((await lookup('PLC 1', 9)).body.data.students[0].studentId, '102')
    assert.equal((await lookup('PLC 2', 10, 2025)).body.data.students[0].studentId, '101')
    assert.equal((await lookup('PLC 1', 10, 2026, '103')).body.data.students[0].studentId, '103')
    assert.equal((await lookup('DC 1')).status, 403)
    assert.equal((await lookup('PLC 1', 13)).status, 400)
    assert.equal((await fetch(`${base}?subject=PLC+1&cohortMonth=10&cohortYear=2026`)).status, 401)
    assert.deepEqual((await lookup('PLC 1', 1)).body.data.students, [])
    const laterMonth = await fetch(`${base}?subject=PLC+1&cohortMonth=11&cohortYear=2026&enrollmentMonth=10&enrollmentYear=2026`, { headers })
    const later = await laterMonth.json() as any
    assert.equal(laterMonth.status, 200)
    assert.deepEqual(later.data.students.map((student: any) => student.studentId), ['100'])
    assert.equal(later.data.students[0].project.percent, 85)
    assert.ok(later.data.students[0].project.entries[0].submittedAt)
    assert.ok(later.data.students[0].project.entries[0].verifiedAt)
    assert.equal((await lookup('PLC 1')).body.data.students[0].project.percent, 0)
    assert.equal((await fetch(`${base}?subject=PLC+1&cohortMonth=11&cohortYear=2026&enrollmentMonth=13`, { headers })).status, 400)
    console.log('Grade dashboard cohort roster checks passed')
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    await prisma.$disconnect()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
