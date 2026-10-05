import * as XLSX from 'xlsx'
import { Track } from '@prisma/client'
import prisma from '../lib/prisma'

interface ImportResult {
  added: number
  skipped: number
  errors: string[]
}

// Excel serial date to cohort month and year.
function excelSerialToCohort(serial: number, date1904: boolean) {
  if (!Number.isFinite(serial)) return null
  const date = XLSX.SSF.parse_date_code(serial, { date1904 })
  if (!date || date.y < 1900 || date.y > 9999 || date.m < 1 || date.m > 12) return null
  return { cohortStartMonth: date.m, cohortStartYear: date.y }
}

// Parse Groups column: contains "DAY" or "EVE" (sometimes with extra text)
function parseTrack(groups: string): Track | null {
  const upper = String(groups).toUpperCase()
  if (upper.includes('DAY')) return 'day'
  if (upper.includes('EVE')) return 'night'
  return null
}

export async function importStudentsFromBuffer(fileBuffer: Buffer): Promise<ImportResult> {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' })

  const sheetName = workbook.SheetNames.find((n) => n.trim().toLowerCase() === 'full pop')
  if (!sheetName) {
    return { added: 0, skipped: 0, errors: ['Sheet "Full Pop" not found in uploaded file.'] }
  }

  const sheet = workbook.Sheets[sheetName]
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })

  let added = 0
  let skipped = 0
  const errors: string[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]

    // Find columns case-insensitively
    const keys = Object.keys(row)
    const get = (name: string) => {
      const key = keys.find((k) => k.trim().toLowerCase() === name.toLowerCase())
      return key ? row[key] : undefined
    }

    const acct = String(get('Acct') ?? '').trim()
    const nameRaw = String(get('Name') ?? '').trim()
    const startRaw = get('Start')
    const groupsRaw = String(get('Groups') ?? '').trim()

    if (!acct) continue // skip blank rows

    // Find program column — try named headers first, then fall back to column index 4
    const programValue = String(
      get('Program') ?? get('Course') ?? get('Program Name') ?? get('Prog') ??
      row[keys[4]] ?? ''
    ).trim().toLowerCase()

    // Only import Manufacturing & Automation Training students.
    // If program column is found and doesn't match, skip the row.
    const programFound = programValue.length > 0
    const isMAT = programValue.includes('manufacturing') || programValue.includes('automation')
    if (programFound && !isMAT) {
      skipped++
      continue
    }

    const cohort = typeof startRaw === 'number' ? excelSerialToCohort(startRaw, !!workbook.Workbook?.WBProps?.date1904) : null
    if (!cohort) {
      errors.push(`Row ${i + 2}: invalid or missing Start date for Acct "${acct}"`)
      continue
    }

    const track = parseTrack(groupsRaw)
    if (!track) {
      errors.push(`Row ${i + 2}: unrecognized Groups value "${groupsRaw}" for Acct "${acct}"`)
      continue
    }

    const existing = await prisma.student.findUnique({ where: { studentId: acct } })
    if (existing) {
      // Restore dates discarded by older imports without creating duplicate students.
      await prisma.student.update({ where: { id: existing.id }, data: cohort })
      skipped++
      continue
    }

    await prisma.student.create({
      data: {
        studentId: acct,
        fullName: nameRaw,
        ...cohort,
        track,
      },
    })
    added++
  }

  return { added, skipped, errors }
}
