import assert from 'node:assert/strict'
import express from 'express'
import cookieParser from 'cookie-parser'
import jwt from 'jsonwebtoken'
import type { AddressInfo } from 'node:net'
import prisma from '../src/lib/prisma'
import router from '../src/routes/ipadGrading'

async function main() {
  const entries: any[] = []
  const students = [
    { id: 'july', studentId: '100', fullName: 'July Student', cohortStartMonth: 7, cohortStartYear: 2026 },
    { id: 'old', studentId: '101', fullName: 'Old Student', cohortStartMonth: 7, cohortStartYear: 2025 },
    { id: 'legacy', studentId: '102', fullName: 'Legacy Student', cohortStartMonth: 7, cohortStartYear: null },
    { id: 'august', studentId: '103', fullName: 'August Student', cohortStartMonth: 8, cohortStartYear: 2026 },
  ]
  prisma.teacher.findUnique = (async () => ({ subject1: 'PLC 1', subject2: 'PLC 2', subject3: null, shift: 'afternoon' })) as any
  prisma.curriculum.findMany = (async ({ where }: any) => {
    assert.equal(where.track, 'day')
    assert.deepEqual(where.subject.in, ['PLC 1', 'PLC 2'])
    return [{ subject: 'PLC 1', shift: 'afternoon', track: 'day', programMonth: 2 }, { subject: 'PLC 2', shift: 'morning', track: 'day', programMonth: 4 }]
  }) as any
  prisma.student.findMany = (async ({ where }: any) => {
    assert.deepEqual(where, { isActive: true, isFloating: false, track: 'day' })
    return students
  }) as any
  prisma.gradeTemplate.findMany = (async () => [{ id: 'project', name: 'Project One' }]) as any
  prisma.gradeTemplate.findFirst = (async ({ where }: any) => where.id === 'project' && where.type === 'project' && where.isActive && where.subject === 'PLC 1' ? { id: 'project' } : null) as any
  prisma.gradeEntry.findMany = (async ({ where }: any) => entries.filter(e => e.cohortMonth === where.cohortMonth && e.cohortYear === where.cohortYear)) as any
  prisma.gradeEntry.upsert = (async ({ where, create, update }: any) => {
    const key = where.templateId_studentId_cohortMonth_cohortYear
    const existing = entries.find(e => Object.keys(key).every(k => e[k] === key[k]))
    if (existing) { Object.assign(existing, update); return existing }
    entries.push(create); return create
  }) as any
  const app = express()
  app.use(express.json(), cookieParser())
  app.use('/ipad', router)
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/ipad`
  const headers = { Cookie: `token=${jwt.sign({ teacherId: 'teacher' }, process.env.JWT_SECRET ?? 'dev-secret')}`, 'Content-Type': 'application/json' }
  const selection = { subject: 'PLC 1', shift: 'afternoon', month: 8, year: 2026 }
  const complete = (extra: object = {}) => fetch(`${base}/complete`, { method: 'POST', headers, body: JSON.stringify({ ...selection, studentDbId: 'july', templateId: 'project', ...extra }) })
  try {
    assert.equal((await fetch(base)).status, 401)
    const get = await fetch(`${base}?subject=PLC+1&shift=afternoon&month=8&year=2026`, { headers })
    const initial = await get.json() as any
    assert.equal(get.status, 200)
    assert.deepEqual(initial.data.students.map((s: any) => s.id), ['july', 'legacy'])
    assert.equal((await complete({ subject: 'DC 1' })).status, 403)
    assert.equal((await complete({ shift: 'night' })).status, 403)
    assert.equal((await complete({ studentDbId: 'old' })).status, 403)
    assert.equal((await complete({ templateId: 'quiz' })).status, 404)
    assert.equal((await complete({ month: 13 })).status, 400)
    assert.equal(entries.length, 0)
    assert.equal((await complete()).status, 200)
    assert.equal(entries[0].score, 100)
    assert.ok(entries[0].submittedAt)
    assert.ok(entries[0].verifiedAt)
    assert.equal(entries[0].verifiedById, 'teacher')
    assert.equal(entries[0].cohortMonth, 8)
    assert.equal(entries[0].cohortYear, 2026)
    assert.equal((await complete()).status, 200)
    assert.equal(entries.length, 1, 'Repeated completion must not duplicate grades')
    const after = await fetch(`${base}?subject=PLC+1&shift=afternoon&month=8&year=2026`, { headers })
    assert.deepEqual((await after.json() as any).data.completed, [{ studentId: 'july', templateId: 'project' }])
    console.log('iPad grading authorization, roster, verification, and repeat-save checks passed')
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await prisma.$disconnect()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
