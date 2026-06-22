import { PrismaClient, Shift, Track } from '@prisma/client'
import {
  STUDENT_POP_EMAIL_NOTIFICATION_TTL_HOURS,
  STUDENT_POP_MAILBOX_ADDRESS,
  STUDENT_POP_NOTIFICATION_TEXT,
  STUDENT_POP_SUBJECT_TOKEN,
} from '../src/services/notificationService'
import {
  DEFAULT_WORK_ORDER_TEMPLATE,
  persistWorkOrderTemplateFile,
} from '../src/services/workOrderService'

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

  console.log('Seeding reports mailbox notification source...')
  await prisma.emailSyncSource.upsert({
    where: { mailboxAddress: STUDENT_POP_MAILBOX_ADDRESS },
    update: {
      enabled: true,
      subjectContains: STUDENT_POP_SUBJECT_TOKEN,
      notificationTitle: STUDENT_POP_NOTIFICATION_TEXT,
      notificationBody: STUDENT_POP_NOTIFICATION_TEXT,
      notificationTtlHours: STUDENT_POP_EMAIL_NOTIFICATION_TTL_HOURS,
    },
    create: {
      name: 'Reports mailbox student pop watcher',
      mailboxAddress: STUDENT_POP_MAILBOX_ADDRESS,
      subjectContains: STUDENT_POP_SUBJECT_TOKEN,
      notificationTitle: STUDENT_POP_NOTIFICATION_TEXT,
      notificationBody: STUDENT_POP_NOTIFICATION_TEXT,
      notificationTtlHours: STUDENT_POP_EMAIL_NOTIFICATION_TTL_HOURS,
    },
  })
  console.log('Seeded reports mailbox notification source.')

  console.log('Seeding default work-order template...')
  const existingWorkOrderTemplate = await prisma.workOrderTemplate.findFirst({
    where: {
      name: DEFAULT_WORK_ORDER_TEMPLATE.name,
      versionLabel: DEFAULT_WORK_ORDER_TEMPLATE.versionLabel,
    },
  })
  if (existingWorkOrderTemplate) {
    console.log('Default work-order template already exists.')
  } else {
    const stored = await persistWorkOrderTemplateFile({
      sourcePath: DEFAULT_WORK_ORDER_TEMPLATE.sourcePath,
      originalFilename: DEFAULT_WORK_ORDER_TEMPLATE.originalFilename,
      mimeType: DEFAULT_WORK_ORDER_TEMPLATE.mimeType,
    })
    await prisma.workOrderTemplate.create({
      data: {
        name: DEFAULT_WORK_ORDER_TEMPLATE.name,
        versionLabel: DEFAULT_WORK_ORDER_TEMPLATE.versionLabel,
        description: DEFAULT_WORK_ORDER_TEMPLATE.description,
        photoPath: stored.storedPath,
        photoUrl: stored.url,
        photoMimeType: stored.mimeType,
        photoSizeBytes: stored.sizeBytes,
        originalFilename: stored.originalFilename,
      },
    })
    console.log('Seeded default work-order template.')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
