import assert from 'node:assert/strict'
import express from 'express'
import type { AddressInfo } from 'node:net'
import prisma from '../src/lib/prisma'
import studentsRouter from '../src/routes/students'

async function main() {
  const logs: any[] = []
  prisma.student.findFirst = (async ({ where, select }: any) => {
    // Simulate the legacy database: reading the newly added cohort year fails.
    if (!select || select.cohortStartYear) {
      throw Object.assign(new Error('Column students.cohort_start_year does not exist'), { code: 'P2022' })
    }
    return where.isActive && where.studentId === '100'
      ? { id: 'student-uuid', fullName: 'Test Student' } : null
  }) as any
  prisma.attendanceLog.create = (async ({ data }: any) => {
    const log = { id: `log-${logs.length}`, ...data }
    logs.push(log)
    return log
  }) as any

  const app = express()
  app.use(express.json())
  app.use('/api/student', studentsRouter)
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: err.message })
  })
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/student/login`
  const login = (identifier: string, roomName = 'PLC Room', clientHour = 8) => fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, roomName, clientHour, clientMinute: 0 }),
  })
  try {
    const response = await login(' 100 ')
    assert.equal(response.status, 201)
    const body = await response.json() as any
    assert.equal(body.data.studentName, 'Test Student')
    assert.equal(body.data.shift, 'morning')
    assert.equal(body.data.hoursCredit, 5)
    assert.equal(logs[0].studentId, 'student-uuid')
    assert.equal(logs[0].roomName, 'PLC Room')
    assert.ok(logs[0].loginTime instanceof Date)
    assert.equal((await login('unknown')).status, 404)
    assert.equal((await login('')).status, 400)
    assert.equal((await login('100', 'invalid')).status, 400)
    const late = await login('100', 'PLC Room', 23)
    assert.equal(late.status, 201)
    assert.ok(((await late.json()) as any).data.warning)
    assert.equal(logs.length, 2)
    console.log('Student sign-in tests passed')
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()))
    await prisma.$disconnect()
  }
}
main().catch(err => { console.error(err); process.exitCode = 1 })
