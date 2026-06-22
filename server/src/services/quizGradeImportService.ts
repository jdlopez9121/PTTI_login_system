import * as XLSX from 'xlsx'
import { GradeType } from '@prisma/client'

export interface ImportStudent {
  id: string
  studentId: string
  fullName: string
  cohortStartMonth: number
}

export interface ParsedQuizGradeRow {
  rowNumber: number
  firstName: string
  lastName: string
  fullName: string
  normalizedName: string
  assignmentName: string
  points: number
  maxPoints: number
  score: number
}

export interface ParseQuizGradeResult {
  rows: ParsedQuizGradeRow[]
  errors: string[]
}

export interface NameIndexMatch {
  normalizedName: string
  students: ImportStudent[]
}

export type StudentNameIndex = Map<string, ImportStudent[]>

export interface ImportableQuizGradeRow extends ParsedQuizGradeRow {
  studentDbId: string
  studentId: string
  studentName: string
}

export interface SkippedQuizGradeRow {
  rowNumber: number
  fullName: string
  assignmentName: string
  reason: string
}

export interface QuizGradePreviewResult {
  importable: ImportableQuizGradeRow[]
  skipped: SkippedQuizGradeRow[]
}

export interface QuizGradeApplyResult {
  imported: number
  createdOrUpdatedTemplates: string[]
  skipped: SkippedQuizGradeRow[]
  errors: string[]
}

interface GradeTemplateUpsertArgs {
  where: { subject_name: { subject: string; name: string } }
  update: { isActive: boolean; type: GradeType }
  create: { subject: string; name: string; type: GradeType; order: number }
}

interface GradeEntryUpsertArgs {
  where: { templateId_studentId_cohortMonth_cohortYear: { templateId: string; studentId: string; cohortMonth: number; cohortYear: number } }
  update: { score: number; submittedAt: Date; submittedBy: string }
  create: { templateId: string; studentId: string; cohortMonth: number; cohortYear: number; score: number; submittedAt: Date; submittedBy: string }
}

export interface QuizGradeImportTxClient {
  gradeTemplate: {
    upsert(args: GradeTemplateUpsertArgs): Promise<{ id: string; name: string }>
  }
  gradeEntry: {
    upsert(args: GradeEntryUpsertArgs): Promise<unknown>
  }
}

export interface QuizGradeImportPrisma {
  student: {
    findMany(args?: unknown): Promise<ImportStudent[]>
  }
  gradeTemplate: {
    upsert(args: GradeTemplateUpsertArgs): Promise<{ id: string; name: string }>
  }
  gradeEntry: {
    upsert(args: GradeEntryUpsertArgs): Promise<unknown>
  }
  $transaction<T>(fn: (tx: QuizGradeImportTxClient) => Promise<T>): Promise<T>
}

const REQUIRED_HEADERS = ['First Name', 'Last Name', 'Assignments', 'Points', 'Max Points']

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase()
}

export function normalizeStudentName(name: string): string {
  const compact = String(name)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .trim()

  const commaMatch = compact.match(/^([^,]+),\s*(.+)$/)
  if (commaMatch) return `${commaMatch[2]} ${commaMatch[1]}`.replace(/\s+/g, ' ').trim()
  return compact
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim())
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function readRows(fileBuffer: Buffer): Record<string, unknown>[] {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' })
  const firstSheet = workbook.SheetNames[0]
  if (!firstSheet) return []
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], { defval: '' })
}

export function parseQuizGradeWorkbook(fileBuffer: Buffer): ParseQuizGradeResult {
  const rawRows = readRows(fileBuffer)
  const rows: ParsedQuizGradeRow[] = []
  const errors: string[] = []

  if (rawRows.length === 0) {
    return { rows, errors: ['Uploaded workbook does not contain any grade rows.'] }
  }

  const firstKeys = Object.keys(rawRows[0])
  const headerByNormalized = new Map(firstKeys.map((key) => [normalizeHeader(key), key]))
  for (const required of REQUIRED_HEADERS) {
    if (!headerByNormalized.has(normalizeHeader(required))) {
      errors.push(`Missing required column: ${required}`)
    }
  }
  if (errors.length > 0) return { rows, errors }

  const getValue = (row: Record<string, unknown>, header: string) => row[headerByNormalized.get(normalizeHeader(header)) ?? header]

  for (let i = 0; i < rawRows.length; i++) {
    const rowNumber = i + 2
    const row = rawRows[i]
    const firstName = String(getValue(row, 'First Name') ?? '').trim()
    const lastName = String(getValue(row, 'Last Name') ?? '').trim()
    const assignmentName = String(getValue(row, 'Assignments') ?? '').trim()
    const pointsRaw = getValue(row, 'Points')
    const maxPointsRaw = getValue(row, 'Max Points')

    if (!firstName && !lastName && !assignmentName && String(pointsRaw ?? '').trim() === '') continue

    if (!firstName || !lastName) {
      errors.push(`Row ${rowNumber}: First Name and Last Name are required.`)
      continue
    }
    if (!assignmentName) {
      errors.push(`Row ${rowNumber}: Assignments is required.`)
      continue
    }
    if (String(pointsRaw ?? '').trim() === '') {
      errors.push(`Row ${rowNumber}: blank Points value skipped for ${firstName} ${lastName}.`)
      continue
    }

    const points = toNumber(pointsRaw)
    const maxPoints = toNumber(maxPointsRaw)
    if (points === null) {
      errors.push(`Row ${rowNumber}: Points must be a number.`)
      continue
    }
    if (maxPoints === null || maxPoints <= 0) {
      errors.push(`Row ${rowNumber}: Max Points must be greater than 0.`)
      continue
    }
    if (points < 0) {
      errors.push(`Row ${rowNumber}: Points cannot be negative.`)
      continue
    }

    const score = Math.round((points / maxPoints) * 10000) / 100
    const fullName = `${firstName} ${lastName}`.trim()
    rows.push({
      rowNumber,
      firstName,
      lastName,
      fullName,
      normalizedName: normalizeStudentName(fullName),
      assignmentName,
      points,
      maxPoints,
      score,
    })
  }

  return { rows, errors }
}

export function buildStudentNameIndex(students: ImportStudent[]): StudentNameIndex {
  const index: StudentNameIndex = new Map()
  for (const student of students) {
    const normalized = normalizeStudentName(student.fullName)
    const existing = index.get(normalized) ?? []
    existing.push(student)
    index.set(normalized, existing)
  }
  return index
}

export function previewQuizGradeImport(rows: ParsedQuizGradeRow[], index: StudentNameIndex): QuizGradePreviewResult {
  const importable: ImportableQuizGradeRow[] = []
  const skipped: SkippedQuizGradeRow[] = []

  for (const row of rows) {
    const matches = index.get(row.normalizedName) ?? []
    if (matches.length === 0) {
      skipped.push({ rowNumber: row.rowNumber, fullName: row.fullName, assignmentName: row.assignmentName, reason: `No active student matched "${row.fullName}".` })
      continue
    }
    if (matches.length > 1) {
      skipped.push({ rowNumber: row.rowNumber, fullName: row.fullName, assignmentName: row.assignmentName, reason: `Multiple active students matched "${row.fullName}"; skipped to avoid updating the wrong student.` })
      continue
    }

    const matched = matches[0]
    importable.push({ ...row, studentDbId: matched.id, studentId: matched.studentId, studentName: matched.fullName })
  }

  return { importable, skipped }
}

export async function previewQuizGradeImportFromBuffer(prisma: QuizGradeImportPrisma, fileBuffer: Buffer): Promise<ParseQuizGradeResult & QuizGradePreviewResult> {
  const parsed = parseQuizGradeWorkbook(fileBuffer)
  const students = await prisma.student.findMany({ where: { isActive: true }, select: { id: true, studentId: true, fullName: true, cohortStartMonth: true } })
  const preview = previewQuizGradeImport(parsed.rows, buildStudentNameIndex(students))
  return { ...parsed, ...preview }
}

export async function applyQuizGradeImport(params: {
  prisma: QuizGradeImportPrisma
  rows: ParsedQuizGradeRow[]
  subject: string
  cohortMonth: number
  cohortYear: number
  teacherId: string
}): Promise<QuizGradeApplyResult> {
  const students = await params.prisma.student.findMany({ where: { isActive: true }, select: { id: true, studentId: true, fullName: true, cohortStartMonth: true } })
  const preview = previewQuizGradeImport(params.rows, buildStudentNameIndex(students))

  if (preview.importable.length === 0) {
    return { imported: 0, createdOrUpdatedTemplates: [], skipped: preview.skipped, errors: [] }
  }

  const now = new Date()
  const assignmentNames = Array.from(new Set(preview.importable.map((row) => row.assignmentName)))

  await params.prisma.$transaction(async (tx) => {
    const templates = await Promise.all(
      assignmentNames.map((assignmentName, order) =>
        tx.gradeTemplate.upsert({
          where: { subject_name: { subject: params.subject, name: assignmentName } },
          update: { isActive: true, type: 'quiz' },
          create: { subject: params.subject, name: assignmentName, type: 'quiz', order },
        })
      )
    )

    const templateByName = new Map(templates.map((t) => [t.name, t]))

    await Promise.all(
      preview.importable.map((row) => {
        const template = templateByName.get(row.assignmentName)
        if (!template) throw new Error(`Template was not created for ${row.assignmentName}`)
        return tx.gradeEntry.upsert({
          where: {
            templateId_studentId_cohortMonth_cohortYear: {
              templateId: template.id,
              studentId: row.studentDbId,
              cohortMonth: params.cohortMonth,
              cohortYear: params.cohortYear,
            },
          },
          update: { score: row.score, submittedAt: now, submittedBy: params.teacherId },
          create: {
            templateId: template.id,
            studentId: row.studentDbId,
            cohortMonth: params.cohortMonth,
            cohortYear: params.cohortYear,
            score: row.score,
            submittedAt: now,
            submittedBy: params.teacherId,
          },
        })
      })
    )
  })

  return {
    imported: preview.importable.length,
    createdOrUpdatedTemplates: assignmentNames,
    skipped: preview.skipped,
    errors: [],
  }
}
