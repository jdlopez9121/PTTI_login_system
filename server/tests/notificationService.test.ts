import assert from 'node:assert/strict'
import {
  createManualNotification,
  listActiveNotifications,
  archiveNotification,
  upsertCalendarNotification,
  upsertStudentPopEmailNotification,
  type NotificationServicePrisma,
} from '../src/services/notificationService'

function makePrisma(initialNotifications: any[] = []): NotificationServicePrisma & { rows: any[] } {
  const rows = [...initialNotifications]
  let nextId = rows.length + 1

  const matchesWhere = (row: any, where: any): boolean => {
    if (!where) return true
    if (where.id !== undefined && row.id !== where.id) return false
    if (where.archivedAt === null && row.archivedAt !== null && row.archivedAt !== undefined) return false
    if (where.startsAt?.lte && row.startsAt > where.startsAt.lte) return false
    if (where.expiresAt?.gt && row.expiresAt <= where.expiresAt.gt) return false
    if (where.OR) {
      const anyMatch = where.OR.some((clause: any) => matchesWhere(row, clause))
      if (!anyMatch) return false
    }
    if (where.source && row.source !== where.source) return false
    if (where.sourceCalendarId && row.sourceCalendarId !== where.sourceCalendarId) return false
    if (where.sourceExternalId && row.sourceExternalId !== where.sourceExternalId) return false
    if (where.createdById && row.createdById !== where.createdById) return false
    return true
  }

  const prisma = {
    rows,
    notification: {
      create: async ({ data }: any) => {
        const row = { id: `n-${nextId++}`, archivedAt: null, createdAt: data.createdAt ?? new Date(), updatedAt: data.createdAt ?? new Date(), ...data }
        rows.push(row)
        return row
      },
      findMany: async ({ where, orderBy }: any = {}) => {
        const result = rows.filter((row) => matchesWhere(row, where))
        if (orderBy) {
          result.sort((a, b) => {
            if (orderBy.priority === 'desc' && a.priority !== b.priority) return String(b.priority).localeCompare(String(a.priority))
            if (orderBy.startsAt === 'desc') return b.startsAt.getTime() - a.startsAt.getTime()
            return 0
          })
        }
        return result
      },
      findUnique: async ({ where }: any) => rows.find((row) => row.id === where.id) ?? null,
      update: async ({ where, data }: any) => {
        const index = rows.findIndex((row) => row.id === where.id)
        if (index === -1) throw new Error('not found')
        rows[index] = { ...rows[index], ...data }
        return rows[index]
      },
      upsert: async ({ where, create, update }: any) => {
        const key = where.source_sourceCalendarId_sourceExternalId
        const found = rows.find((row) => row.source === key.source && row.sourceCalendarId === key.sourceCalendarId && row.sourceExternalId === key.sourceExternalId)
        if (found) {
          Object.assign(found, update)
          return found
        }
        const row = { id: `n-${nextId++}`, archivedAt: null, createdAt: new Date(), updatedAt: new Date(), ...create }
        rows.push(row)
        return row
      },
    },
  }
  return prisma
}

async function testManualNotificationsExpire48HoursAfterServerNow() {
  const now = new Date('2026-06-16T12:00:00.000Z')
  const prisma = makePrisma()

  const notification = await createManualNotification(prisma, 'teacher-1', {
    title: 'Reminder',
    body: 'Bring safety glasses.',
    priority: 'urgent',
  }, now)

  assert.equal(notification.source, 'manual')
  assert.equal(notification.createdById, 'teacher-1')
  assert.equal(notification.audience, 'all')
  assert.equal(notification.expiresAt.toISOString(), '2026-06-18T12:00:00.000Z')
}

async function testActiveNotificationsExcludeExpiredFutureAndArchivedRows() {
  const now = new Date('2026-06-16T12:00:00.000Z')
  const prisma = makePrisma([
    { id: 'active', title: 'Active', body: 'Visible', audience: 'all', priority: 'normal', source: 'manual', startsAt: new Date('2026-06-16T11:00:00.000Z'), expiresAt: new Date('2026-06-16T13:00:00.000Z'), archivedAt: null },
    { id: 'expired', title: 'Expired', body: 'Hidden', audience: 'all', priority: 'normal', source: 'manual', startsAt: new Date('2026-06-16T10:00:00.000Z'), expiresAt: new Date('2026-06-16T11:00:00.000Z'), archivedAt: null },
    { id: 'future', title: 'Future', body: 'Hidden', audience: 'all', priority: 'normal', source: 'manual', startsAt: new Date('2026-06-16T13:00:00.000Z'), expiresAt: new Date('2026-06-16T15:00:00.000Z'), archivedAt: null },
    { id: 'archived', title: 'Archived', body: 'Hidden', audience: 'all', priority: 'normal', source: 'manual', startsAt: new Date('2026-06-16T11:00:00.000Z'), expiresAt: new Date('2026-06-16T13:00:00.000Z'), archivedAt: new Date('2026-06-16T11:30:00.000Z') },
  ])

  const notifications = await listActiveNotifications(prisma, now)

  assert.deepEqual(notifications.map((notification) => notification.id), ['active'])
}

async function testCreatorCanArchiveManualNotification() {
  const now = new Date('2026-06-16T12:00:00.000Z')
  const prisma = makePrisma([
    { id: 'n-1', title: 'Owned', body: 'Body', audience: 'all', priority: 'normal', source: 'manual', createdById: 'teacher-1', startsAt: now, expiresAt: new Date('2026-06-18T12:00:00.000Z'), archivedAt: null },
  ])

  const archived = await archiveNotification(prisma, 'teacher-1', 'n-1', now)

  assert.equal(archived.archivedAt?.toISOString(), now.toISOString())
}

async function testOtherTeacherCannotArchiveManualNotification() {
  const now = new Date('2026-06-16T12:00:00.000Z')
  const prisma = makePrisma([
    { id: 'n-1', title: 'Owned', body: 'Body', audience: 'all', priority: 'normal', source: 'manual', createdById: 'teacher-1', startsAt: now, expiresAt: new Date('2026-06-18T12:00:00.000Z'), archivedAt: null },
  ])

  await assert.rejects(
    () => archiveNotification(prisma, 'teacher-2', 'n-1', now),
    /Only the creating teacher can archive this manual notification/
  )
}

async function testCalendarNotificationsUpsertByProviderEventWithoutUnarchivingHiddenRows() {
  const now = new Date('2026-06-16T12:00:00.000Z')
  const start = new Date('2026-06-17T09:00:00.000Z')
  const prisma = makePrisma()

  await upsertCalendarNotification(prisma, {
    calendarId: 'main-calendar',
    externalId: 'event-1',
    title: 'Graduation prep',
    body: 'Set up chairs',
    startsAt: start,
    endsAt: new Date('2026-06-17T10:00:00.000Z'),
  }, now)
  await upsertCalendarNotification(prisma, {
    calendarId: 'main-calendar',
    externalId: 'event-1',
    title: 'Graduation prep updated',
    body: 'Set up chairs and projector',
    startsAt: start,
    endsAt: new Date('2026-06-17T10:30:00.000Z'),
  }, now)

  assert.equal(prisma.rows.length, 1)
  assert.equal(prisma.rows[0].title, 'Graduation prep updated')
  assert.equal(prisma.rows[0].source, 'calendar')
  assert.equal(prisma.rows[0].expiresAt.toISOString(), '2026-06-19T09:00:00.000Z')
  assert.equal(prisma.rows[0].archivedAt, null)

  prisma.rows[0].archivedAt = new Date('2026-06-16T13:00:00.000Z')
  await upsertCalendarNotification(prisma, {
    calendarId: 'main-calendar',
    externalId: 'event-1',
    title: 'Graduation prep changed again',
    body: 'Updated body',
    startsAt: start,
    endsAt: new Date('2026-06-17T11:00:00.000Z'),
  }, now)

  assert.equal(prisma.rows.length, 1)
  assert.equal(prisma.rows[0].title, 'Graduation prep changed again')
  assert(prisma.rows[0].archivedAt instanceof Date)
}

async function testStudentPopEmailCreatesTwelveHourConcernsNotification() {
  const now = new Date('2026-06-16T12:00:00.000Z')
  const prisma = makePrisma()

  const notification = await upsertStudentPopEmailNotification(prisma, {
    mailboxAddress: 'reports@ptt.edu',
    messageId: 'message-1',
    fromAddress: 'sender@example.com',
    subject: 'Daily STUDENT POP export',
    receivedAt: now,
  }, now)

  assert(notification)
  assert.equal(notification.title, 'Concerns list ready')
  assert.equal(notification.body, 'Concerns list ready')
  assert.equal(notification.source, 'email')
  assert.equal(notification.sourceCalendarId, 'reports@ptt.edu')
  assert.equal(notification.sourceExternalId, 'message-1')
  assert.equal(notification.expiresAt.toISOString(), '2026-06-17T00:00:00.000Z')
  assert.equal(prisma.rows.length, 1)
}

async function testNonStudentPopEmailDoesNotCreateNotification() {
  const now = new Date('2026-06-16T12:00:00.000Z')
  const prisma = makePrisma()

  const notification = await upsertStudentPopEmailNotification(prisma, {
    mailboxAddress: 'reports@ptt.edu',
    messageId: 'message-2',
    fromAddress: 'sender@example.com',
    subject: 'Daily attendance export',
    receivedAt: now,
  }, now)

  assert.equal(notification, null)
  assert.equal(prisma.rows.length, 0)
}

async function run() {
  await testManualNotificationsExpire48HoursAfterServerNow()
  await testActiveNotificationsExcludeExpiredFutureAndArchivedRows()
  await testCreatorCanArchiveManualNotification()
  await testOtherTeacherCannotArchiveManualNotification()
  await testCalendarNotificationsUpsertByProviderEventWithoutUnarchivingHiddenRows()
  await testStudentPopEmailCreatesTwelveHourConcernsNotification()
  await testNonStudentPopEmailDoesNotCreateNotification()
  console.log('notificationService tests passed')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
