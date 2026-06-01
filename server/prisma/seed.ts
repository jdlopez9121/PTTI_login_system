import { PrismaClient, Shift, Track } from '@prisma/client'

const prisma = new PrismaClient()

const curriculumRows: {
  subject: string
  programMonth: number
  shift: Shift
  track: Track
}[] = [
  // Month 1
  { subject: 'DC 1', programMonth: 1, shift: 'morning', track: 'day' },
  { subject: 'AC 1', programMonth: 1, shift: 'afternoon', track: 'day' },
  { subject: 'DC 1', programMonth: 1, shift: 'evening', track: 'night' },
  { subject: 'AC 1', programMonth: 1, shift: 'night', track: 'night' },
  // Month 2
  { subject: 'MT', programMonth: 2, shift: 'morning', track: 'day' },
  { subject: 'PLC 1', programMonth: 2, shift: 'afternoon', track: 'day' },
  { subject: 'MT', programMonth: 2, shift: 'evening', track: 'night' },
  { subject: 'PLC 1', programMonth: 2, shift: 'night', track: 'night' },
  // Month 3
  { subject: 'AC 2', programMonth: 3, shift: 'morning', track: 'day' },
  { subject: 'DC 2', programMonth: 3, shift: 'afternoon', track: 'day' },
  { subject: 'AC 2', programMonth: 3, shift: 'evening', track: 'night' },
  { subject: 'DC 2', programMonth: 3, shift: 'night', track: 'night' },
  // Month 4
  { subject: 'PLC 2', programMonth: 4, shift: 'morning', track: 'day' },
  { subject: 'HT', programMonth: 4, shift: 'afternoon', track: 'day' },
  { subject: 'PLC 2', programMonth: 4, shift: 'evening', track: 'night' },
  { subject: 'HT', programMonth: 4, shift: 'night', track: 'night' },
  // Month 5
  { subject: 'PLC 3', programMonth: 5, shift: 'morning', track: 'day' },
  { subject: 'DC 3', programMonth: 5, shift: 'afternoon', track: 'day' },
  { subject: 'PLC 3', programMonth: 5, shift: 'evening', track: 'night' },
  { subject: 'DC 3', programMonth: 5, shift: 'night', track: 'night' },
]

async function main() {
  console.log('Seeding curriculum...')
  for (const row of curriculumRows) {
    await prisma.curriculum.upsert({
      where: { subject_shift: { subject: row.subject, shift: row.shift } },
      update: {},
      create: row,
    })
  }
  console.log(`Seeded ${curriculumRows.length} curriculum rows.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
