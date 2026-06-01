/**
 * Usage:
 *   npx tsx src/scripts/createTeacher.ts \
 *     --name "Jane Smith" \
 *     --email "jane@ptti.edu" \
 *     --password "SecurePass123" \
 *     --subject1 "DC 1" \
 *     --subject2 "AC 1" \
 *     --shift morning
 *
 * subject2 is optional. shift: morning | afternoon | evening | night
 */
import bcrypt from 'bcryptjs'
import { PrismaClient, Shift } from '@prisma/client'

const prisma = new PrismaClient()

const VALID_SUBJECTS = ['PLC 1','PLC 2','PLC 3','DC 1','DC 2','DC 3','AC 1','AC 2','MT','HT']
const VALID_SHIFTS: Shift[] = ['morning','afternoon','evening','night']

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

async function main() {
  const name     = getArg('--name')
  const email    = getArg('--email')
  const password = getArg('--password')
  const subject1 = getArg('--subject1')
  const subject2 = getArg('--subject2')
  const subject3 = getArg('--subject3')
  const shift    = getArg('--shift') as Shift | undefined

  const missing = ['--name','--email','--password','--subject1','--shift'].filter((f) => !getArg(f))
  if (missing.length) {
    console.error(`Missing required flags: ${missing.join(', ')}`)
    process.exit(1)
  }

  if (!VALID_SUBJECTS.includes(subject1!)) {
    console.error(`Invalid subject1 "${subject1}". Valid: ${VALID_SUBJECTS.join(', ')}`)
    process.exit(1)
  }
  if (subject2 && !VALID_SUBJECTS.includes(subject2)) {
    console.error(`Invalid subject2 "${subject2}". Valid: ${VALID_SUBJECTS.join(', ')}`)
    process.exit(1)
  }
  if (subject3 && !VALID_SUBJECTS.includes(subject3)) {
    console.error(`Invalid subject3 "${subject3}". Valid: ${VALID_SUBJECTS.join(', ')}`)
    process.exit(1)
  }
  if (!VALID_SHIFTS.includes(shift!)) {
    console.error(`Invalid shift "${shift}". Valid: ${VALID_SHIFTS.join(', ')}`)
    process.exit(1)
  }

  const existing = await prisma.teacher.findUnique({ where: { email: email! } })
  if (existing) {
    console.error(`A teacher with email "${email}" already exists.`)
    process.exit(1)
  }

  const passwordHash = await bcrypt.hash(password!, 12)

  const teacher = await prisma.teacher.create({
    data: {
      name: name!,
      email: email!,
      passwordHash,
      subject1: subject1!,
      subject2: subject2 ?? null,
      subject3: subject3 ?? null,
      shift: shift!,
      emailVerified: true,
    },
  })

  console.log(`\n✓ Teacher created:`)
  console.log(`  ID:       ${teacher.id}`)
  console.log(`  Name:     ${teacher.name}`)
  console.log(`  Email:    ${teacher.email}`)
  console.log(`  Subject1: ${teacher.subject1}`)
  console.log(`  Subject2: ${teacher.subject2 ?? '—'}`)
  console.log(`  Subject3: ${teacher.subject3 ?? '—'}`)
  console.log(`  Shift:    ${teacher.shift}`)
  console.log(`\nThey can now log in at the teacher portal.\n`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
