import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as XLSX from 'xlsx'
import prisma from '../src/lib/prisma'
import { importStudentsFromBuffer } from '../src/services/csvImportService'

async function main() {
  const students: any[] = []
  prisma.student.findUnique = (async ({ where }: any) => students.find(s => s.studentId === where.studentId) ?? null) as any
  prisma.student.create = (async ({ data }: any) => { const student = { id: String(students.length), ...data }; students.push(student); return student }) as any
  prisma.student.update = (async ({ where, data }: any) => Object.assign(students.find(s => s.id === where.id), data)) as any
  const wb = XLSX.utils.book_new()
  const headers = ['Student ID', 'Badge ID', 'Last Name', 'First Name', 'Program', 'Enrollment Start Date', 'Groups', 'Unused']
  const row = (badge: string, date: unknown, group: string, program = 'Manufacturing & Automation Training') => ['IGNORE-ME', badge, 'Last', 'First', program, date, group, 'irrelevant']
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Report title'], ['Subtitle'], ['Total Records'], headers,
    row('00123', '10/5/2026', 'DAY, Freedom Imported'),
    row('456', '2026-09-01', 'Freedom imported, EVE'),
    row('', '10/5/2026', 'DAY'),
    row('789', '10/5/2026', 'DAY, EVE'),
    row('other-program', '10/5/2026', 'DAY', 'Welding'),
    row('bad-date', '2/30/2026', 'DAY'),
  ]), 'Student Services LDA Report')
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const result = await importStudentsFromBuffer(buffer)
  assert.equal(result.added, 2)
  assert.equal(result.skipped, 1)
  assert.equal(result.errors.length, 3)
  assert.equal(students[0].studentId, '00123')
  assert.equal(students[0].fullName, 'Last, First')
  assert.equal(students[0].cohortStartMonth, 10)
  assert.equal(students[0].cohortStartYear, 2026)
  assert.equal(students[0].track, 'day')
  assert.equal(students[1].track, 'night')
  await importStudentsFromBuffer(buffer)
  assert.equal(students.length, 2)
  console.log('LDA mapping and duplicate protection checks passed')
  if (process.argv[2]) {
    students.length = 0
    const actual = await importStudentsFromBuffer(fs.readFileSync(process.argv[2]))
    console.log(JSON.stringify({ workbookDryRun: actual, day: students.filter(s => s.track === 'day').length, night: students.filter(s => s.track === 'night').length }))
    assert.equal(actual.errors.length, 0)
    assert.equal(actual.added, 158)
    const repeat = await importStudentsFromBuffer(fs.readFileSync(process.argv[2]))
    assert.equal(repeat.added, 0)
    assert.equal(students.length, 158)
    console.log('Actual workbook repeat-import check passed; no database writes performed')
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
