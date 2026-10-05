import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import prisma from '../src/lib/prisma'
import { importStudentsFromBuffer } from '../src/services/csvImportService'
async function main() {
  const students: any[] = [{ id: 'existing', studentId: 'old', cohortStartMonth: 12, cohortStartYear: null }]
  prisma.student.findUnique = (async ({ where }: any) => students.find(s => s.studentId === where.studentId) ?? null) as any
  prisma.student.update = (async ({ where, data }: any) => Object.assign(students.find(s => s.id === where.id), data)) as any
  prisma.student.create = (async ({ data }: any) => { students.push(data); return data }) as any
  const workbook = XLSX.utils.book_new()
  const serial = (year: number) => Date.UTC(year, 11, 1) / 86400000 + 25569
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
    { Acct: 'old', Name: 'Existing Student', Start: serial(2025), Groups: 'DAY', Program: 'Manufacturing' },
    { Acct: 'new', Name: 'New Student', Start: serial(2026), Groups: 'DAY', Program: 'Manufacturing' },
    { Acct: 'invalid', Name: 'Invalid Student', Start: -1, Groups: 'DAY', Program: 'Manufacturing' },
  ]), 'Full Pop')
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const result = await importStudentsFromBuffer(buffer)
  assert.equal(result.added, 1)
  assert.equal(result.skipped, 1)
  assert.equal(result.errors.length, 1)
  assert.equal(students[0].cohortStartYear, 2025)
  assert.equal(students[1].cohortStartYear, 2026)
  assert.equal(students[1].cohortStartMonth, 12)
  await importStudentsFromBuffer(buffer)
  assert.equal(students.length, 2, 'Re-upload must preserve students without duplicates')
  console.log('Cohort import tests passed')
}
main().catch(err => { console.error(err); process.exitCode = 1 })
