import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import {
  parseQuizGradeWorkbook,
  buildStudentNameIndex,
  previewQuizGradeImport,
  applyQuizGradeImport,
  type ImportStudent,
  type QuizGradeImportPrisma,
} from '../src/services/quizGradeImportService'

function workbookBuffer(rows: Record<string, unknown>[]): Buffer {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(workbook, sheet, 'Quiz Export')
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
}

function student(id: string, fullName: string, cohortStartMonth = 1): ImportStudent {
  return { id, studentId: id, fullName, cohortStartMonth }
}

async function testParsesValidWorkbookAndCalculatesPercent() {
  const result = parseQuizGradeWorkbook(workbookBuffer([
    { 'First Name': 'Jane', 'Last Name': 'Doe', Assignments: 'Quiz 1', Points: 8, 'Max Points': 10 },
  ]))

  assert.equal(result.rows.length, 1)
  assert.deepEqual(result.errors, [])
  assert.equal(result.rows[0].normalizedName, 'jane doe')
  assert.equal(result.rows[0].score, 80)
  assert.equal(result.rows[0].assignmentName, 'Quiz 1')
}

async function testRejectsMissingColumnsAndBadRows() {
  const missing = parseQuizGradeWorkbook(workbookBuffer([
    { 'First Name': 'Jane', Points: 8, 'Max Points': 10 },
  ]))
  assert(missing.errors.some((error) => error.includes('Missing required column: Last Name')))
  assert.equal(missing.rows.length, 0)

  const malformed = parseQuizGradeWorkbook(workbookBuffer([
    { 'First Name': 'Jane', 'Last Name': 'Doe', Assignments: 'Quiz 1', Points: '', 'Max Points': 10 },
    { 'First Name': 'John', 'Last Name': 'Smith', Assignments: 'Quiz 1', Points: 5, 'Max Points': 0 },
  ]))
  assert.equal(malformed.rows.length, 0)
  assert(malformed.errors.some((error) => error.includes('blank Points')))
  assert(malformed.errors.some((error) => error.includes('Max Points must be greater than 0')))
}

async function testReportsUnmatchedAndAmbiguousStudentNames() {
  const rows = parseQuizGradeWorkbook(workbookBuffer([
    { 'First Name': 'Jane', 'Last Name': 'Doe', Assignments: 'Quiz 1', Points: 8, 'Max Points': 10 },
    { 'First Name': 'Missing', 'Last Name': 'Student', Assignments: 'Quiz 1', Points: 7, 'Max Points': 10 },
    { 'First Name': 'Sam', 'Last Name': 'Same', Assignments: 'Quiz 1', Points: 9, 'Max Points': 10 },
  ])).rows

  const preview = previewQuizGradeImport(rows, buildStudentNameIndex([
    student('s1', 'Doe, Jane'),
    student('s2', 'Same, Sam'),
    student('s3', 'Sam Same'),
  ]))

  assert.equal(preview.importable.length, 1)
  assert.equal(preview.importable[0].studentId, 's1')
  assert(preview.skipped.some((row) => row.reason.includes('No active student matched')))
  assert(preview.skipped.some((row) => row.reason.includes('Multiple active students matched')))
}

async function testAppliesImportWithTemplateUpsertAndGradeUpsert() {
  const calls: string[] = []
  const rows = parseQuizGradeWorkbook(workbookBuffer([
    { 'First Name': 'Jane', 'Last Name': 'Doe', Assignments: 'Quiz 1', Points: 8, 'Max Points': 10 },
  ])).rows

  const prisma: QuizGradeImportPrisma = {
    student: {
      findMany: async () => [student('db-jane', 'Jane Doe', 3)],
    },
    gradeTemplate: {
      upsert: async (args) => {
        calls.push(`template:${args.where.subject_name.subject}:${args.where.subject_name.name}`)
        assert.equal(args.create.type, 'quiz')
        return { id: 'template-1', name: args.where.subject_name.name }
      },
    },
    gradeEntry: {
      upsert: async (args) => {
        calls.push(`entry:${args.where.templateId_studentId_cohortMonth_cohortYear.studentId}:${args.create.score}`)
        assert.equal(args.where.templateId_studentId_cohortMonth_cohortYear.cohortMonth, 6)
        assert.equal(args.where.templateId_studentId_cohortMonth_cohortYear.cohortYear, 2026)
        assert.equal(args.update.submittedBy, 'teacher-1')
        return { id: 'entry-1' }
      },
    },
    $transaction: async (fn) => fn({
      gradeTemplate: prisma.gradeTemplate,
      gradeEntry: prisma.gradeEntry,
    }),
  }

  const result = await applyQuizGradeImport({
    prisma,
    rows,
    subject: 'PLC 1',
    cohortMonth: 6,
    cohortYear: 2026,
    teacherId: 'teacher-1',
  })

  assert.equal(result.imported, 1)
  assert.equal(result.skipped.length, 0)
  assert.deepEqual(calls, ['template:PLC 1:Quiz 1', 'entry:db-jane:80'])
}

async function run() {
  await testParsesValidWorkbookAndCalculatesPercent()
  await testRejectsMissingColumnsAndBadRows()
  await testReportsUnmatchedAndAmbiguousStudentNames()
  await testAppliesImportWithTemplateUpsertAndGradeUpsert()
  console.log('quizGradeImportService tests passed')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
