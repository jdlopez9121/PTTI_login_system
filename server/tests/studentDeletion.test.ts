import assert from 'node:assert/strict'
import express from 'express'
import cookieParser from 'cookie-parser'
import jwt from 'jsonwebtoken'
import type { AddressInfo } from 'node:net'
import prisma from '../src/lib/prisma'
import studentsRouter from '../src/routes/students'

async function main() {
  let students = [{ id: 'one', studentId: '100' }, { id: 'two', studentId: '200' }]
  let grades = [{ studentId: 'one', month: 7 }, { studentId: 'one', month: 8 }, { studentId: 'two', month: 7 }]
  let attendance = [{ studentId: 'one' }, { studentId: 'two' }]
  let failDelete = false
  let teacherExists = true
  prisma.teacher.findUnique = (async () => teacherExists ? { id: 'teacher' } : null) as any
  prisma.student.findUnique = (async ({ where }: any) => students.find(s => s.id === where.id) ?? null) as any
  prisma.$transaction = (async (callback: any) => {
    const snapshot = structuredClone({ students, grades, attendance })
    try {
      return await callback({
        attendanceLog: { deleteMany: async ({ where }: any) => { attendance = attendance.filter(a => a.studentId !== where.studentId) } },
        gradeEntry: { deleteMany: async ({ where }: any) => { grades = grades.filter(g => g.studentId !== where.studentId) } },
        student: { delete: async ({ where }: any) => {
          if (failDelete) throw Error('Simulated database failure')
          students = students.filter(s => s.id !== where.id)
        } },
      })
    } catch (error) {
      ({ students, grades, attendance } = snapshot)
      throw error
    }
  }) as any
  const app = express()
  app.use(express.json(), cookieParser())
  app.use('/students', studentsRouter)
  app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ success: false }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/students`
  const token = jwt.sign({ teacherId: 'teacher' }, process.env.JWT_SECRET ?? 'dev-secret')
  const remove = (id: string, studentId: string, authenticated = true) => fetch(`${base}/${id}`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json', ...(authenticated ? { Cookie: `token=${token}` } : {}) }, body: JSON.stringify({ studentId }),
  })
  try {
    assert.equal((await remove('one', '100', false)).status, 401)
    teacherExists = false
    assert.equal((await remove('one', '100')).status, 403)
    teacherExists = true
    assert.equal((await remove('missing', '100')).status, 404)
    assert.equal((await remove('one', '200')).status, 400)
    assert.equal(grades.length, 3)
    failDelete = true
    assert.equal((await remove('one', '100')).status, 500)
    assert.equal(students.length, 2)
    assert.equal(grades.length, 3)
    assert.equal(attendance.length, 2)
    failDelete = false
    assert.equal((await remove('one', '100')).status, 200)
    assert.deepEqual(students, [{ id: 'two', studentId: '200' }])
    assert.deepEqual(grades, [{ studentId: 'two', month: 7 }])
    assert.deepEqual(attendance, [{ studentId: 'two' }])
    assert.equal((await remove('one', '100')).status, 404)
    console.log('Student deletion checks passed')
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await prisma.$disconnect()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
