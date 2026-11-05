import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as XLSX from 'xlsx'
import prisma from '../src/lib/prisma'
import { importStudentsFromBuffer } from '../src/services/csvImportService'

async function main() {
  const students: any[] = []
  prisma.student.findUnique = (async ({ where }: any) => students.find(s => s.studentId === where.studentId) ?? null) as any
  prisma.student.create = (async ({ data }: any) => {
    const student = { id: String(students.length), ...data }
    students.push(student)
    return student
  }) as any
  prisma.student.update = (async ({ where, data }: any) => Object.assign(students.find(s => s.id === where.id), data)) as any
  const workbook = (rows: unknown[][]) => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1')
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  }
  const program = 'Manufacturing & Automation Training'
  const created = Date.UTC(2026, 9, 1) / 86400000 + 25569 + 0.69
  const buffer = workbook([
    ['Account report'],
    ['ID', ' BADGE ', 'NAME', 'PROGRAM', 'CREATED ON', 'EMAIL', 'PASSWORD'],
    [1, '00123', 'Student, Day', `${program} - DAY`, created, 'ignored', 'ignored'],
    [2, 159062, 'Student, Evening', `${program} - EVE`, created],
    [3, 'other', 'Other Program', 'Welding - DAY', created],
    [4, '', 'Missing Badge', `${program} - DAY`, created],
    [5, 'ambiguous', 'Ambiguous', `${program} - DAY / EVE`, created],
    [6, 'missing-shift', 'No Shift', program, created],
    [7, 'bad-date', 'Bad Date', `${program} - DAY`, '2/30/2026'],
  ])
  const result = await importStudentsFromBuffer(buffer)
  assert.deepEqual({ added: result.added, skipped: result.skipped, errors: result.errors.length }, { added: 2, skipped: 1, errors: 4 })
  assert.deepEqual(students.map(s => [s.studentId, s.cohortStartMonth, s.cohortStartYear, s.track]), [
    ['00123', 10, 2026, 'day'], ['159062', 10, 2026, 'night'],
  ])
  assert.deepEqual(Object.keys(students[0]).sort(), ['id', 'studentId', 'fullName', 'cohortStartMonth', 'cohortStartYear', 'track'].sort())
  assert.equal((await importStudentsFromBuffer(buffer)).added, 0)
  assert.equal(students.length, 2)

  const explicit = await importStudentsFromBuffer(workbook([
    ['Badge ID', 'BADGE', 'Name', 'Start', 'CREATED ON', 'Groups', 'PROGRAM'],
    ['preferred', 'ignore', 'Explicit Fields', '9/1/2025', created, 'NIGHT', `${program} - DAY`],
    ['invalid-explicit', 'ignore', 'Invalid Explicit Date', 'bad', created, 'DAY', program],
  ]))
  assert.equal(explicit.added, 1)
  assert.equal(explicit.errors.length, 1)
  assert.deepEqual(students.at(-1), {
    id: '2', studentId: 'preferred', fullName: 'Explicit Fields', cohortStartMonth: 9, cohortStartYear: 2025, track: 'night',
  })
  if (process.argv[2]) {
    students.length = 0
    const actualBuffer = fs.readFileSync(process.argv[2])
    const actual = await importStudentsFromBuffer(actualBuffer)
    assert.equal(actual.errors.length, 0)
    assert.equal(actual.added, 17)
    assert.ok(students.every(s => s.cohortStartMonth === 10 && s.cohortStartYear === 2026))
    assert.equal((await importStudentsFromBuffer(actualBuffer)).added, 0)
    assert.equal(students.length, 17)
    console.log(JSON.stringify({ dryRun: actual, day: students.filter(s => s.track === 'day').length, night: students.filter(s => s.track === 'night').length }))
  }
  console.log('Account roster import checks passed; no database writes performed')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
