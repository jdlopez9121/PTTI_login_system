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
  const day = /\bDAY\b/.test(upper)
  const evening = /\b(EVE|EVENING|NIGHT)\b/.test(upper)
  if (day && !evening) return 'day'
  if (evening && !day) return 'night'
  return null
}

export async function importStudentsFromBuffer(fileBuffer: Buffer): Promise<ImportResult> {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' })

  const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  const sheets = [...workbook.SheetNames].sort((a, b) => Number(normalize(b) === 'fullpop') - Number(normalize(a) === 'fullpop'))
  let rows: unknown[][] = []
  let headerIndex = -1
  for (const name of sheets) {
    const candidate = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: '' })
    const index = candidate.findIndex((row) => {
      const headers = row.map(normalize)
      return (headers.includes('badgeid') || headers.includes('acct')) && headers.includes('groups') &&
        ['start', 'startdate', 'enrollmentstartdate'].some((key) => headers.includes(key)) &&
        (headers.includes('name') || (headers.includes('firstname') && headers.includes('lastname')))
    })
    if (index >= 0) { rows = candidate; headerIndex = index; break }
  }
  if (headerIndex < 0) return { added: 0, skipped: 0, errors: ['No roster headers found. Required: Badge ID (or legacy Acct), Name (or First Name and Last Name), Start date, and Groups.'] }
  const headers = rows[headerIndex].map(normalize)
  const badgeFormat = headers.includes('badgeid')

  let added = 0
  let skipped = 0
  const errors: string[] = []

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i]

    // Find columns case-insensitively
    const get = (name: string) => {
      const index = headers.indexOf(normalize(name))
      return index >= 0 ? row[index] : undefined
    }

    const acct = String(get(badgeFormat ? 'Badge ID' : 'Acct') ?? '').trim()
    const nameRaw = String(get('Name') ?? '').trim() || [get('Last Name'), get('First Name')].map((part) => String(part ?? '').trim()).filter(Boolean).join(', ')
    const startRaw = get('Enrollment Start Date') ?? get('Start Date') ?? get('Start')
    const groupsRaw = String(get('Groups') ?? '').trim()

    if (row.every((value) => String(value ?? '').trim() === '')) continue

    // Only named program columns participate; unrelated columns are ignored.
    const programValue = String(
      get('Program') ?? get('Course') ?? get('Program Name') ?? get('Prog') ?? ''
    ).trim().toLowerCase()

    // Only import Manufacturing & Automation Training students.
    // If program column is found and doesn't match, skip the row.
    const programFound = programValue.length > 0
    const isMAT = programValue.includes('manufacturing') || programValue.includes('automation')
    if (programFound && !isMAT) {
      skipped++
      continue
    }

    if (!acct) { errors.push(`Row ${i + 1}: missing ${badgeFormat ? 'Badge ID' : 'Acct'}; no student imported.`); continue }
    if (!nameRaw) { errors.push(`Row ${i + 1}: missing student name for ID "${acct}"`); continue }

    let cohort = typeof startRaw === 'number' ? excelSerialToCohort(startRaw, !!workbook.Workbook?.WBProps?.date1904) : null
    if (typeof startRaw === 'string') {
      const iso = startRaw.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
      const us = startRaw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
      if (iso || us) {
        const year = Number(iso ? iso[1] : us![3]), month = Number(iso ? iso[2] : us![1]), day = Number(iso ? iso[3] : us![2])
        const date = new Date(Date.UTC(year, month - 1, day))
        if (year >= 1900 && year <= 9999 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) cohort = { cohortStartMonth: month, cohortStartYear: year }
      }
    }
    if (!cohort) {
      errors.push(`Row ${i + 1}: invalid or missing Start date for ID "${acct}"`)
      continue
    }

    const track = parseTrack(groupsRaw)
    if (!track) {
      errors.push(`Row ${i + 1}: unrecognized or ambiguous Groups value "${groupsRaw}" for ID "${acct}"`)
      continue
    }

    const existing = await prisma.student.findUnique({ where: { studentId: acct } })
    if (existing) {
      // Update roster fields by badge/account ID, preserving grades and attendance.
      await prisma.student.update({ where: { id: existing.id }, data: { ...cohort, fullName: nameRaw, track } })
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
