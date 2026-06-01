import * as XLSX from 'xlsx'
import { PrismaClient, Track } from '@prisma/client'

const prisma = new PrismaClient()

interface ImportResult {
  added: number
  skipped: number
  errors: string[]
}

// Excel serial date → calendar month (1–12)
function excelSerialToMonth(serial: number): number {
  const ms = (serial - 25569) * 86400000
  return new Date(ms).getMonth() + 1
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

    const cohortStartMonth = typeof startRaw === 'number' ? excelSerialToMonth(startRaw) : null
    if (!cohortStartMonth) {
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
      skipped++
      continue
    }

    await prisma.student.create({
      data: {
        studentId: acct,
        fullName: nameRaw,
        cohortStartMonth,
        track,
      },
    })
    added++
  }

  return { added, skipped, errors }
}
